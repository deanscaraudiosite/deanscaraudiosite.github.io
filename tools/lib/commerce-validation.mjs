import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { validateJsonSchema } from "./json-schema-validation.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(directory, "../../schemas");
const schemaFileNames = [
  "catalog-release-v1.schema.json",
  "product-v1.schema.json",
  "fitment-release-v1.schema.json",
  "fitment-rule-v1.schema.json",
  "guest-cart-v1.schema.json",
];
let schemaEntriesPromise;

const loadSchemaEntries = () => {
  if (!schemaEntriesPromise) {
    schemaEntriesPromise = Promise.all(
      schemaFileNames.map(async (name) => ({
        name,
        schema: JSON.parse(await fs.readFile(path.join(schemaDirectory, name), "utf8")),
      })),
    );
  }
  return schemaEntriesPromise;
};

const validateWithSchema = async (value, schemaName, label) => {
  const entries = await loadSchemaEntries();
  const root = entries.find((entry) => entry.name === schemaName)?.schema;
  if (!root) return [`${label} schema ${schemaName} could not be loaded.`];
  return validateJsonSchema(value, root, entries).map(
    (error) => `${label} schema: ${error}`,
  );
};

export const validateCatalogSchema = (catalog) =>
  validateWithSchema(
    catalog,
    "catalog-release-v1.schema.json",
    "Catalog",
  );

export const validateFitmentSchema = (fitment) =>
  validateWithSchema(
    fitment,
    "fitment-release-v1.schema.json",
    "Fitment",
  );

const PRODUCT_SOURCE_HOSTS = new Set([
  "electronics.sony.com",
  "www.alpine-usa.com",
  "www.kenwood.com",
  "www.kicker.com",
  "rockfordfosgate.com",
  "www.rockfordfosgate.com",
  "www.metraonline.com",
  "metraonline.com",
  "pac-audio.com",
  "www.pac-audio.com",
]);

const FITMENT_SOURCE_HOSTS = new Set([
  "www.metraonline.com",
  "metraonline.com",
]);

const isHttpsFrom = (value, allowedHosts) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && allowedHosts.has(parsed.hostname);
  } catch (error) {
    return false;
  }
};

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

export const validateCatalog = (catalog) => {
  const errors = [];
  if (!catalog || typeof catalog !== "object") return ["Catalog is not an object."];
  if (catalog.schemaVersion !== 1) errors.push("Catalog schemaVersion must be 1.");
  if (!catalog.releaseId) errors.push("Catalog releaseId is required.");
  if (
    !["official-source-curated", "licensed-feed", "demo"].includes(
      catalog.classification,
    )
  ) {
    errors.push("Catalog classification is invalid.");
  }
  if (!Array.isArray(catalog.products) || !catalog.products.length) {
    errors.push("Catalog products must be a non-empty array.");
    return errors;
  }
  if (!Array.isArray(catalog.categories) || !catalog.categories.length) {
    errors.push("Catalog categories must be a non-empty array.");
  }

  const categoryIdValues = (catalog.categories || []).map((item) => item.id);
  const categoryIds = new Set(categoryIdValues);
  const productIds = [];
  const slugs = [];
  const variantIds = [];
  const skus = [];
  for (const [productIndex, product] of catalog.products.entries()) {
    const path = `products[${productIndex}]`;
    productIds.push(product.id);
    slugs.push(product.slug);
    if (!product.id || !/^[a-z0-9][a-z0-9-]+$/.test(product.id)) {
      errors.push(`${path}.id is invalid.`);
    }
    if (!product.slug || !/^[a-z0-9][a-z0-9-]+$/.test(product.slug)) {
      errors.push(`${path}.slug is invalid.`);
    }
    const KNOWN_CATEGORIES = new Set([
      "receivers",
      "speakers",
      "subwoofers",
      "amplifiers",
      "standard-speaker-boxes",
      "truck-speaker-boxes",
      "installation",
    ]);
    if (!categoryIds.has(product.category)) {
      errors.push(`${path}.category references an unknown category.`);
    } else if (!KNOWN_CATEGORIES.has(product.category)) {
      errors.push(`${path}.category must be one of the canonical shop categories.`);
    }
    if (!["required", "advisory"].includes(product.fitmentPolicy)) {
      errors.push(`${path}.fitmentPolicy must be required or advisory.`);
    }
    if (!Array.isArray(product.variants) || !product.variants.length) {
      errors.push(`${path}.variants must be non-empty.`);
      continue;
    }
    for (const [variantIndex, variant] of product.variants.entries()) {
      const variantPath = `${path}.variants[${variantIndex}]`;
      variantIds.push(variant.id);
      skus.push(String(variant.sku || "").toLocaleUpperCase("en-US"));
      if (!variant.id || !variant.sku || !variant.name) {
        errors.push(`${variantPath} requires id, sku, and name.`);
      }
      if (!isHttpsFrom(variant.sourceUrl, PRODUCT_SOURCE_HOSTS)) {
        errors.push(`${variantPath}.sourceUrl is not an allowlisted official HTTPS host.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(variant.sourceCheckedAt || "")) {
        errors.push(`${variantPath}.sourceCheckedAt must be YYYY-MM-DD.`);
      }
      if (variant.localAvailability !== "confirm") {
        errors.push(`${variantPath}.localAvailability must remain confirm without a Dean's inventory feed.`);
      }
      if (
        !["listed_for_direct_sale", "source_unavailable", "not_stated"].includes(
          variant.sourceListingStatus,
        )
      ) {
        errors.push(`${variantPath}.sourceListingStatus is invalid.`);
      }
      if (!variant.price || variant.price.currency !== "USD") {
        errors.push(`${variantPath}.price must use USD.`);
      }
      if (
        variant.price?.amountMinor !== null &&
        (!Number.isInteger(variant.price?.amountMinor) ||
          variant.price.amountMinor < 0)
      ) {
        errors.push(`${variantPath}.price.amountMinor must be null or a non-negative integer.`);
      }
      if (variant.price?.kind === "quote" && variant.price.amountMinor !== null) {
        errors.push(`${variantPath} quote pricing must have a null amount.`);
      }
      if (variant.price?.amountMinor === null && variant.price?.kind !== "quote") {
        errors.push(`${variantPath} null pricing must use the quote kind.`);
      }
    }
  }

  for (const value of duplicateValues(categoryIdValues)) errors.push(`Duplicate category id: ${value}.`);
  for (const value of duplicateValues(productIds)) errors.push(`Duplicate product id: ${value}.`);
  for (const value of duplicateValues(slugs)) errors.push(`Duplicate product slug: ${value}.`);
  for (const value of duplicateValues(variantIds)) errors.push(`Duplicate variant id: ${value}.`);
  for (const value of duplicateValues(skus)) errors.push(`Duplicate SKU: ${value}.`);
  return errors;
};

export const validateFitment = (fitment, catalog) => {
  const errors = [];
  if (!fitment || typeof fitment !== "object") return ["Fitment release is not an object."];
  if (fitment.schemaVersion !== 1) errors.push("Fitment schemaVersion must be 1.");
  if (!fitment.releaseId) errors.push("Fitment releaseId is required.");
  if (fitment.absencePolicy !== "unknown") {
    errors.push("Fitment absencePolicy must be unknown.");
  }
  if (fitment.coverage !== "partial" && fitment.coverage !== "exhaustive") {
    errors.push("Fitment coverage must be partial or exhaustive.");
  }
  if (!Array.isArray(fitment.rules)) {
    errors.push("Fitment rules must be an array.");
    return errors;
  }
  if (!Array.isArray(fitment.providers) || !fitment.providers.length) {
    errors.push("Fitment providers must be a non-empty array.");
  }
  if (!Array.isArray(fitment.sources) || !fitment.sources.length) {
    errors.push("Fitment sources must be a non-empty array.");
  }
  const variantIds = new Set(
    (catalog?.products || []).flatMap((product) =>
      product.variants.map((variant) => variant.id),
    ),
  );
  const providerIds = (fitment.providers || []).map((provider) => provider.id);
  const sourceIds = (fitment.sources || []).map((source) => source.id);
  const knownSourceIds = new Set(sourceIds);
  const ruleIds = [];
  for (const [index, rule] of fitment.rules.entries()) {
    const path = `rules[${index}]`;
    ruleIds.push(rule.id);
    if (!variantIds.has(rule.variantId)) {
      errors.push(`${path}.variantId does not exist in the catalog.`);
    }
    if (!["compatible", "conditional", "incompatible"].includes(rule.decision)) {
      errors.push(`${path}.decision is invalid.`);
    }
    if (!rule.match?.make || !Array.isArray(rule.match?.models) || !rule.match.models.length) {
      errors.push(`${path}.match must contain make and models.`);
    }
    if (
      !Number.isInteger(rule.match?.yearStart) ||
      !Number.isInteger(rule.match?.yearEnd) ||
      rule.match.yearStart > rule.match.yearEnd
    ) {
      errors.push(`${path}.match has an invalid year range.`);
    }
    if (!isHttpsFrom(rule.evidence?.url, FITMENT_SOURCE_HOSTS)) {
      errors.push(`${path}.evidence.url is not an allowlisted manufacturer HTTPS host.`);
    }
    if (!knownSourceIds.has(rule.evidence?.sourceId)) {
      errors.push(`${path}.evidence.sourceId does not exist in fitment sources.`);
    }
    if (!rule.customerNote) errors.push(`${path}.customerNote is required.`);
    if (rule.decision === "conditional" && !rule.conditions?.length) {
      errors.push(`${path} conditional rules require visible conditions.`);
    }
  }
  for (const value of duplicateValues(providerIds)) errors.push(`Duplicate fitment provider id: ${value}.`);
  for (const value of duplicateValues(sourceIds)) errors.push(`Duplicate fitment source id: ${value}.`);
  for (const value of duplicateValues(ruleIds)) errors.push(`Duplicate fitment rule id: ${value}.`);
  return errors;
};

export const loadBrowserDataFile = async (path, exportName) => {
  const source = await fs.readFile(path, "utf8");
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context, { filename: path, timeout: 5000 });
  return context.window[exportName];
};

export const catalogCounts = (catalog) => ({
  products: catalog.products.length,
  variants: catalog.products.reduce(
    (total, product) => total + product.variants.length,
    0,
  ),
  pricedVariants: catalog.products.reduce(
    (total, product) =>
      total + product.variants.filter((variant) => Number.isInteger(variant.price.amountMinor)).length,
    0,
  ),
  quoteVariants: catalog.products.reduce(
    (total, product) =>
      total + product.variants.filter((variant) => variant.price.amountMinor === null).length,
    0,
  ),
});
