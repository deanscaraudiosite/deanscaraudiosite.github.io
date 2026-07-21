import path from "node:path";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sameValue = (left, right) => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      sameValue(leftKeys, rightKeys) &&
      leftKeys.every((key) => sameValue(left[key], right[key]))
    );
  }
  return false;
};

const valueType = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  return typeof value;
};

const matchesType = (value, expected) => {
  if (expected === "object") return isObject(value);
  if (expected === "array") return Array.isArray(value);
  if (expected === "null") return value === null;
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return typeof value === expected;
};

const childPath = (base, key) =>
  typeof key === "number"
    ? `${base}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${base}.${key}`
      : `${base}[${JSON.stringify(key)}]`;

const decodePointerToken = (value) =>
  decodeURIComponent(value).replace(/~1/g, "/").replace(/~0/g, "~");

const resolvePointer = (document, fragment) => {
  if (!fragment) return document;
  if (!fragment.startsWith("/")) return undefined;
  return fragment
    .slice(1)
    .split("/")
    .map(decodePointerToken)
    .reduce((value, key) => value?.[key], document);
};

const dateIsValid = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateTimeIsValid = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
    value,
  );
  if (!match || !dateIsValid(match[1])) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    return false;
  }
  if (match[5] !== "Z" && (Number(match[6]) > 23 || Number(match[7]) > 59)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
};

const uriIsValid = (value) => {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol);
  } catch (error) {
    return false;
  }
};

const formatIsValid = (value, format) => {
  if (format === "date") return dateIsValid(value);
  if (format === "date-time") return dateTimeIsValid(value);
  if (format === "uri") return uriIsValid(value);
  return true;
};

const registryFor = (entries) => {
  const registry = new Map();
  for (const entry of entries) {
    registry.set(entry.name, entry.schema);
    registry.set(path.basename(entry.name), entry.schema);
    if (entry.schema.$id) {
      registry.set(entry.schema.$id, entry.schema);
      try {
        registry.set(new URL(entry.schema.$id).pathname.split("/").pop(), entry.schema);
      } catch (error) {
        // A non-URL $id can still be resolved by its literal registry key.
      }
    }
  }
  return registry;
};

const resolveReference = (reference, document, registry) => {
  const hashIndex = reference.indexOf("#");
  const documentReference =
    hashIndex === -1 ? reference : reference.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : reference.slice(hashIndex + 1);
  let targetDocument = document;

  if (documentReference) {
    targetDocument = registry.get(documentReference);
    if (!targetDocument && document.$id) {
      try {
        targetDocument = registry.get(new URL(documentReference, document.$id).href);
      } catch (error) {
        targetDocument = null;
      }
    }
    if (!targetDocument) {
      targetDocument = registry.get(path.basename(documentReference));
    }
  }

  const targetSchema = targetDocument
    ? resolvePointer(targetDocument, fragment)
    : undefined;
  return { targetDocument, targetSchema };
};

export const validateJsonSchema = (
  value,
  rootSchema,
  schemaEntries = [{ name: rootSchema.$id || "root", schema: rootSchema }],
) => {
  const errors = [];
  const registry = registryFor(schemaEntries);

  const visit = (instance, schema, instancePath, document) => {
    if (schema === true) return;
    if (schema === false) {
      errors.push(`${instancePath} is not allowed by the schema.`);
      return;
    }
    if (!isObject(schema)) {
      errors.push(`${instancePath} references an invalid schema node.`);
      return;
    }

    if (schema.$ref) {
      const { targetDocument, targetSchema } = resolveReference(
        schema.$ref,
        document,
        registry,
      );
      if (!targetDocument || targetSchema === undefined) {
        errors.push(`${instancePath} uses unresolved schema reference ${schema.$ref}.`);
        return;
      }
      visit(instance, targetSchema, instancePath, targetDocument);
      return;
    }

    if (schema.type) {
      const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!expected.some((type) => matchesType(instance, type))) {
        errors.push(
          `${instancePath} must be ${expected.join(" or ")}; received ${valueType(instance)}.`,
        );
        return;
      }
    }

    if (Object.hasOwn(schema, "const") && !sameValue(instance, schema.const)) {
      errors.push(`${instancePath} must equal ${JSON.stringify(schema.const)}.`);
    }
    if (schema.enum && !schema.enum.some((item) => sameValue(instance, item))) {
      errors.push(
        `${instancePath} must be one of ${schema.enum
          .map((item) => JSON.stringify(item))
          .join(", ")}.`,
      );
    }

    if (typeof instance === "string") {
      if (Number.isInteger(schema.minLength) && instance.length < schema.minLength) {
        errors.push(`${instancePath} must contain at least ${schema.minLength} characters.`);
      }
      if (Number.isInteger(schema.maxLength) && instance.length > schema.maxLength) {
        errors.push(`${instancePath} must contain at most ${schema.maxLength} characters.`);
      }
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(instance)) {
        errors.push(`${instancePath} must match ${schema.pattern}.`);
      }
      if (schema.format && !formatIsValid(instance, schema.format)) {
        errors.push(`${instancePath} must be a valid ${schema.format}.`);
      }
    }

    if (typeof instance === "number" && Number.isFinite(instance)) {
      if (typeof schema.minimum === "number" && instance < schema.minimum) {
        errors.push(`${instancePath} must be at least ${schema.minimum}.`);
      }
      if (typeof schema.maximum === "number" && instance > schema.maximum) {
        errors.push(`${instancePath} must be at most ${schema.maximum}.`);
      }
    }

    if (Array.isArray(instance)) {
      if (Number.isInteger(schema.minItems) && instance.length < schema.minItems) {
        errors.push(`${instancePath} must contain at least ${schema.minItems} items.`);
      }
      if (Number.isInteger(schema.maxItems) && instance.length > schema.maxItems) {
        errors.push(`${instancePath} must contain at most ${schema.maxItems} items.`);
      }
      if (schema.uniqueItems) {
        for (let index = 0; index < instance.length; index += 1) {
          if (instance.slice(0, index).some((item) => sameValue(item, instance[index]))) {
            errors.push(`${childPath(instancePath, index)} duplicates an earlier item.`);
          }
        }
      }

      const prefixItems = Array.isArray(schema.prefixItems)
        ? schema.prefixItems
        : [];
      for (
        let index = 0;
        index < Math.min(prefixItems.length, instance.length);
        index += 1
      ) {
        visit(instance[index], prefixItems[index], childPath(instancePath, index), document);
      }
      if (schema.items === false && instance.length > prefixItems.length) {
        errors.push(`${instancePath} contains items not allowed by the tuple schema.`);
      } else if (isObject(schema.items) || schema.items === true) {
        for (let index = prefixItems.length; index < instance.length; index += 1) {
          visit(instance[index], schema.items, childPath(instancePath, index), document);
        }
      }
    }

    if (isObject(instance)) {
      const properties = schema.properties || {};
      for (const key of schema.required || []) {
        if (!Object.hasOwn(instance, key)) {
          errors.push(`${childPath(instancePath, key)} is required.`);
        }
      }
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (Object.hasOwn(instance, key)) {
          visit(instance[key], propertySchema, childPath(instancePath, key), document);
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(instance)) {
          if (!Object.hasOwn(properties, key)) {
            errors.push(`${childPath(instancePath, key)} is not an allowed property.`);
          }
        }
      } else if (isObject(schema.additionalProperties)) {
        for (const key of Object.keys(instance)) {
          if (!Object.hasOwn(properties, key)) {
            visit(
              instance[key],
              schema.additionalProperties,
              childPath(instancePath, key),
              document,
            );
          }
        }
      }
    }
  };

  visit(value, rootSchema, "$", rootSchema);
  return errors;
};
