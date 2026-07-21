(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const root = document.querySelector("[data-product-root]");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const product = Commerce.productBySlug.get(params.get("slug"));
  const relatedRoot = document.querySelector("[data-related-products]");
  const relatedSection = document.querySelector("[data-related-section]");

  if (!product) {
    document.title = "Product not found | Dean's Car Audio";
    root.replaceChildren();
    const empty = Commerce.element("div", {
      className: "dca-commerce-cart-empty",
      data: { productNotFound: "" },
    });
    const copy = Commerce.element("div");
    const heading = Commerce.element("h1", {
      text: "That product could not be found.",
      attrs: { tabindex: "-1" },
    });
    copy.append(
      Commerce.element("div", {
        className: "dca-commerce-cart-empty-symbol",
        text: "?",
        attrs: { "aria-hidden": "true" },
      }),
      heading,
      Commerce.element("p", {
        text: "The link may be old, or the product may not be present in this catalog release.",
      }),
      Commerce.element("a", {
        className: "dca-commerce-button dca-commerce-button-primary",
        text: "Return to catalog",
        attrs: { href: Commerce.url("catalog.html") },
      }),
    );
    empty.append(copy);
    root.append(empty);
    if (relatedSection) relatedSection.hidden = true;
    heading.focus();
    return;
  }

  let selected =
    product.variants.find((item) => item.id === params.get("variant")) ||
    product.variants[0];

  const breadcrumbs = document.querySelector("[data-breadcrumbs]");
  const visualRoot = document.querySelector("[data-product-visual-root]");
  const category = Commerce.categoryById.get(product.category);
  const brand = document.querySelector("[data-product-brand]");
  const name = document.querySelector("[data-product-name]");
  const summary = document.querySelector("[data-product-summary]");
  const variantSelect = document.querySelector("[data-variant-select]");
  const priceRoot = document.querySelector("[data-product-price]");
  const priceKind = document.querySelector("[data-price-kind]");
  const sourceStatusRoot = document.querySelector("[data-source-status]");
  const fitmentRoot = document.querySelector("[data-fitment-root]");
  const acknowledgementRoot = document.querySelector("[data-acknowledgement-root]");
  const acknowledgement = document.querySelector("[data-fitment-acknowledgement]");
  const acknowledgementText = document.querySelector("[data-acknowledgement-text]");
  const quantity = document.querySelector("[data-product-quantity]");
  const addButton = document.querySelector("[data-add-to-cart]");
  const addStatus = document.querySelector("[data-add-status]");
  const specsRoot = document.querySelector("[data-specs]");
  const description = document.querySelector("[data-product-description]");
  const sourceLink = document.querySelector("[data-source-link]");
  const sourceMeta = document.querySelector("[data-source-meta]");
  const sourceNotes = document.querySelector("[data-source-notes]");
  const localAvailability = document.querySelector("[data-local-availability]");

  document.title = `${product.name} | Dean's Car Audio`;
  brand.textContent = `${product.brand} · ${category.label}`;
  name.textContent = product.name;
  summary.textContent = product.summary;
  description.textContent = product.description;

  breadcrumbs.replaceChildren(
    Commerce.element("a", { text: "Catalog", attrs: { href: Commerce.url("catalog.html") } }),
    Commerce.element("span", { text: "/", attrs: { "aria-hidden": "true" } }),
    Commerce.element("a", {
      text: category.label,
      attrs: { href: Commerce.url("catalog.html", { category: product.category }) },
    }),
    Commerce.element("span", { text: "/", attrs: { "aria-hidden": "true" } }),
    Commerce.element("span", { text: product.name, attrs: { "aria-current": "page" } }),
  );

  const cleanOptionText = (option, sku) => {
    let text = option || "";
    if (text.includes("·")) {
      const parts = text.split("·");
      text = parts[parts.length - 1].trim();
    }
    if (text.toLowerCase() === sku.toLowerCase()) {
      return "Standard Configuration";
    }
    return text;
  };

  variantSelect.replaceChildren();
  for (const item of product.variants) {
    variantSelect.append(
      Commerce.element("option", {
        text: cleanOptionText(item.option, item.sku),
        attrs: { value: item.id },
      }),
    );
  }

  const variantPicker = document.querySelector(".dca-commerce-variant-picker");
  if (variantPicker) {
    variantPicker.style.display = product.variants.length > 1 ? "" : "none";
  }

  const syncUrl = () => {
    params.set("slug", product.slug);
    params.set("variant", selected.id);
    const next = `${window.location.pathname}?${params.toString()}`;
    try {
      window.history.replaceState(null, "", next);
    } catch (error) {
      // Variant selection remains functional in restrictive file:// browsers.
    }
  };

  const purchaseGate = (result) => {
    if (result.status === "incompatible") {
      return {
        allowed: false,
        acknowledgement: false,
        button: "Not compatible",
        note: "This item is not compatible with the selected vehicle.",
      };
    }
    return {
      allowed: true,
      acknowledgement: false,
      button: "Add to cart",
      note: "Standard shipping & handling applies.",
    };
  };

  const renderSpecs = () => {
    specsRoot.replaceChildren();
    for (const [label, value] of selected.specs) {
      const row = Commerce.element("div");
      row.append(
        Commerce.element("dt", { text: label }),
        Commerce.element("dd", { text: value }),
      );
      specsRoot.append(row);
    }
    if (!selected.specs.length) {
      const row = Commerce.element("div");
      row.append(
        Commerce.element("dt", { text: "Specifications" }),
        Commerce.element("dd", { text: "See the official manufacturer page." }),
      );
      specsRoot.append(row);
    }
  };

  const render = () => {
    syncUrl();
    variantSelect.value = selected.id;
    acknowledgement.checked = false;
    visualRoot.replaceChildren(Commerce.ui.createProductVisual(product, selected, true));
    priceKind.textContent =
      selected.price.kind === "msrp"
        ? "Manufacturer MSRP"
        : selected.price.kind === "quote"
          ? "Public price not stated"
          : "Manufacturer reference price";
    priceRoot.replaceChildren(Commerce.ui.createPrice(selected.price));
    sourceStatusRoot.replaceChildren(
      Commerce.ui.createSourceStatus(selected.sourceListingStatus),
    );

    const result = Commerce.fitment.evaluate(selected.id);
    const overridden = Commerce.ui.overrideUnknownFit(result, selected.id);
    fitmentRoot.replaceChildren();
    fitmentRoot.hidden = true;
    const gate = purchaseGate(overridden);
    acknowledgementRoot.hidden = !gate.acknowledgement;
    acknowledgementText.textContent = gate.acknowledgementText || "";
    addButton.textContent = gate.button;
    addButton.disabled =
      !gate.allowed || (gate.acknowledgement && !acknowledgement.checked);
    addButton.dataset.gateAllowed = String(gate.allowed);
    addButton.dataset.needsAcknowledgement = String(gate.acknowledgement);
    addStatus.textContent = gate.note;
    localAvailability.textContent = "In Stock";

    if (sourceLink) {
      sourceLink.href = selected.sourceUrl;
      sourceLink.textContent = `${product.brand} official page`;
    }
    if (sourceMeta) {
      sourceMeta.textContent = `${
        selected.price.kind === "msrp"
          ? "Manufacturer MSRP"
          : selected.price.kind === "quote"
            ? "Public price not stated"
            : "Manufacturer reference price"
      } · checked ${selected.sourceCheckedAt}`;
    }
    if (sourceNotes) {
      sourceNotes.replaceChildren();
      for (const note of selected.notes || []) {
        sourceNotes.append(Commerce.element("p", { text: note }));
      }
    }
    renderSpecs();
  };

  acknowledgement.addEventListener("change", () => {
    const allowed = addButton.dataset.gateAllowed === "true";
    const needsAcknowledgement =
      addButton.dataset.needsAcknowledgement === "true";
    addButton.disabled = !allowed || (needsAcknowledgement && !acknowledgement.checked);
  });

  variantSelect.addEventListener("change", () => {
    selected = product.variants.find((item) => item.id === variantSelect.value) || product.variants[0];
    render();
  });

  addButton.addEventListener("click", () => {
    if (addButton.disabled) return;
    const result = Commerce.cart.addItem({
      variantId: selected.id,
      quantity: Math.min(25, Math.max(1, Number.parseInt(quantity.value, 10) || 1)),
      acknowledged:
        acknowledgement.checked ||
        addButton.dataset.needsAcknowledgement !== "true",
    });
    if (!result.ok) {
      addStatus.textContent = "This item could not be added. Refresh the page and try again.";
      return;
    }
    quantity.value = "1";
    addStatus.textContent = result.persistent
      ? `${product.name} is in your guest cart and saved on this device.`
      : `${product.name} is in your cart for this visit.`;
    Commerce.ui.toast(`${product.name} added to cart.`);
  });

  window.addEventListener("dca:vehicle-change", render);

  if (relatedRoot) {
    const related = Commerce.catalog.products
      .filter((item) => item.category === product.category && item.id !== product.id)
      .slice(0, 3);
    if (!related.length) relatedSection.hidden = true;
    else for (const item of related) relatedRoot.append(Commerce.ui.createProductCard(item));
  }

  render();
})();
