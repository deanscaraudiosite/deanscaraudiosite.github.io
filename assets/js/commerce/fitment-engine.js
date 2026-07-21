(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const data = window.DCA_FITMENT_DATA;

  if (!data || data.schemaVersion !== 1) {
    throw new Error("Dean's fitment data is missing or unsupported.");
  }

  const statusMeta = Object.freeze({
    compatible: {
      label: "Compatible",
      icon: "✓",
      short: "Verified vehicle match",
    },
    conditional: {
      label: "Conditional",
      icon: "!",
      short: "Fits only when conditions are met",
    },
    incompatible: {
      label: "Incompatible",
      icon: "×",
      short: "Explicit source conflict or exclusion",
    },
    unknown: {
      label: "Unknown",
      icon: "?",
      short: "Fit has not been verified",
    },
  });

  const equalsName = (left, right) =>
    Commerce.normalizeText(left) === Commerce.normalizeText(right);

  const matches = (rule, vehicle) => {
    if (!vehicle || !rule?.match) return false;
    const year = Number.parseInt(vehicle.year, 10);
    if (!Number.isInteger(year)) return false;
    if (!equalsName(rule.match.make, vehicle.makeName)) return false;
    if (year < rule.match.yearStart || year > rule.match.yearEnd) return false;
    return rule.match.models.some((model) => equalsName(model, vehicle.modelName));
  };

  const unknown = (vehicle, reason) => ({
    status: "unknown",
    ...statusMeta.unknown,
    vehicle,
    ruleId: null,
    source: null,
    conditions: [],
    customerNote:
      reason ||
      "No authoritative rule for this SKU and vehicle exists in the current partial dataset.",
    coverage: data.coverage,
  });

  const evaluate = (variantId, vehicle = Commerce.vehicle?.current || null) => {
    if (!Commerce.variantById.has(variantId)) {
      return unknown(vehicle, "This SKU is not present in the current catalog release.");
    }
    if (!vehicle) {
      return unknown(
        null,
        "Choose a vehicle before checking compatibility. No vehicle selection is treated as unknown.",
      );
    }

    const candidates = data.rules
      .filter((item) => item.variantId === variantId && matches(item, vehicle))
      .sort((left, right) => right.priority - left.priority);

    if (!candidates.length) {
      return unknown(
        vehicle,
        "No matching source-cited record exists for this SKU and vehicle in the current partial dataset. This does not mean it fits or does not fit.",
      );
    }

    const selected =
      candidates.find((item) => item.decision === "incompatible") ||
      candidates[0];
    const meta = statusMeta[selected.decision] || statusMeta.unknown;
    return {
      status: selected.decision,
      ...meta,
      vehicle,
      ruleId: selected.id,
      source: selected.evidence,
      conditions: selected.conditions || [],
      customerNote: selected.customerNote,
      coverage: data.coverage,
    };
  };

  const evaluateProduct = (product, vehicle = Commerce.vehicle?.current || null) => {
    const evaluations = product.variants.map((item) => ({
      variant: item,
      result: evaluate(item.id, vehicle),
    }));
    const rank = { compatible: 4, conditional: 3, unknown: 2, incompatible: 1 };
    evaluations.sort((left, right) => rank[right.result.status] - rank[left.result.status]);
    return {
      best: evaluations[0]?.result || unknown(vehicle),
      evaluations,
      counts: evaluations.reduce(
        (counts, item) => {
          counts[item.result.status] += 1;
          return counts;
        },
        { compatible: 0, conditional: 0, incompatible: 0, unknown: 0 },
      ),
    };
  };

  const createBadge = (result, compact = false) => {
    const badge = Commerce.element("span", {
      className: `dca-commerce-fit-badge is-${result.status}${compact ? " is-compact" : ""}`,
      attrs: {
        title: result.short,
        "data-fitment-status": result.status,
      },
    });
    badge.append(
      Commerce.element("span", {
        className: "dca-commerce-fit-icon",
        text: result.icon,
        attrs: { "aria-hidden": "true" },
      }),
      Commerce.element("span", { text: result.label }),
    );
    return badge;
  };

  Commerce.fitment = {
    data,
    statusMeta,
    evaluate,
    evaluateProduct,
    createBadge,
  };
})();
