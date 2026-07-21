(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const el = Commerce.element;

  const CATEGORY_IMAGES = {
    receivers: "assets/images/receiver.jpg",
    speakers: "assets/images/speaker.jpg",
    subwoofers: "assets/images/subwoofer.jpg",
    amplifiers: "assets/images/amplifier.jpg",
    installation: "assets/images/installation.jpg",
  };

  const isPlaceholder = (url) =>
    !url || url.includes("placehold.co") || url.includes("placeholder");

  const createProductVisual = (product, variant = null, large = false) => {
    const visual = el("div", {
      className: `dca-commerce-product-visual is-${product.visualType}${large ? " is-large" : ""}`,
      attrs: { "aria-hidden": "true" },
    });
    
    const selectedVariant = variant || product.variants[0];
    const rawUrl = selectedVariant?.imageUrl;
    const imageUrl = isPlaceholder(rawUrl)
      ? CATEGORY_IMAGES[product.category] || "assets/images/receiver.jpg"
      : rawUrl;
    
    const img = el("img", {
      className: "dca-commerce-product-image",
      attrs: {
        src: imageUrl,
        alt: `${product.brand} ${selectedVariant.sku}`,
        loading: "lazy",
      },
    });
    visual.append(img);
    
    const category = Commerce.categoryById.get(product.category);
    let labelText = category?.shortLabel || product.category;
    if (product.tags) {
      if (product.tags.includes("tweeter")) {
        labelText = "Tweeters";
      } else if (product.tags.includes("epicenter") || product.tags.includes("equalizer") || product.tags.includes("eq") || product.tags.includes("processor")) {
        labelText = "Processors";
      } else if (product.tags.includes("enclosure") || product.tags.includes("box")) {
        labelText = "Enclosures";
      } else if (product.tags.includes("wiring") || product.tags.includes("power-wire")) {
        labelText = "Wiring Kits";
      }
    }
    const label = el("span", {
      className: "dca-commerce-product-visual-label",
      text: labelText,
    });
    visual.append(label);
    return visual;
  };


  const createPrice = (value, { prefix = "", compact = false } = {}) => {
    const root = el("div", {
      className: `dca-commerce-price${compact ? " is-compact" : ""}`,
    });
    if (prefix) root.append(el("span", { className: "dca-commerce-price-prefix", text: prefix }));
    if (!Number.isInteger(value.amountMinor)) {
      root.append(el("strong", { text: "Price on request" }));
      return root;
    }
    root.append(el("strong", { text: Commerce.formatMoney(value.amountMinor, value.currency) }));
    if (
      Number.isInteger(value.compareAtMinor) &&
      value.compareAtMinor > value.amountMinor
    ) {
      root.append(
        el("s", {
          text: Commerce.formatMoney(value.compareAtMinor, value.currency),
          attrs: { "aria-label": `Previously ${Commerce.formatMoney(value.compareAtMinor, value.currency)}` },
        }),
      );
    }
    return root;
  };

  const createSourceStatus = (status) => {
    const root = el("span", {
      className: `dca-commerce-source-status is-${status}`,
    });
    root.append(
      el("span", { attrs: { "aria-hidden": "true" }, text: "•" }),
      el("span", { text: Commerce.sourceStatusLabel(status) }),
    );
    return root;
  };

  const overrideUnknownFit = (result, variantId) => {
    if (!result || result.status !== "unknown" || !result.vehicle) return result;
    const product = Commerce.productForVariant.get(variantId);
    if (!product) return result;

    const vehicle = result.vehicle;
    const vehicleLabel = `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`;

    if (product.category === "receivers") {
      return {
        status: "compatible",
        label: "Fits Your Vehicle",
        icon: "✓",
        short: "Fits your vehicle",
        vehicle,
        ruleId: null,
        source: null,
        conditions: ["Requires a vehicle-specific dash kit and wiring harness for installation."],
        customerNote: `This receiver fits your ${vehicleLabel}. An aftermarket dash kit, antenna adapter, and wiring harness are required to complete the installation.`,
        coverage: result.coverage,
      };
    } else if (product.category === "speakers") {
      return {
        status: "compatible",
        label: "Fits Your Vehicle",
        icon: "✓",
        short: "Fits your vehicle",
        vehicle,
        ruleId: null,
        source: null,
        conditions: ["May require speaker mounting brackets or harness adapters depending on exact location."],
        customerNote: `These speakers can be installed in your ${vehicleLabel}. Speaker brackets or plug-and-play wiring adapters are typically required for factory locations.`,
        coverage: result.coverage,
      };
    } else if (product.category === "amplifiers" || product.category === "subwoofers") {
      return {
        status: "compatible",
        label: "Universal Fit",
        icon: "✓",
        short: "Universal fit",
        vehicle,
        ruleId: null,
        source: null,
        conditions: ["Requires amplifier wiring kit or custom enclosure (sold separately)."],
        customerNote: `This is a universal item that fits your ${vehicleLabel}. Custom wiring and brackets/enclosures are typical for installation.`,
        coverage: result.coverage,
      };
    }
    return result;
  };

  const createProductCard = (product, { preferredVariant = null } = {}) => {
    const productFit = Commerce.fitment.evaluateProduct(product);
    const selectedVariant = product.variants.includes(preferredVariant)
      ? preferredVariant
      : null;
    const selectedFit = selectedVariant
      ? Commerce.fitment.evaluate(selectedVariant.id)
      : null;

    const activeFit = selectedVariant
      ? overrideUnknownFit(selectedFit, selectedVariant.id)
      : overrideUnknownFit(productFit.best, product.variants[0].id);

    const destination = Commerce.productUrl(product, selectedVariant?.id || "");
    const priceFloor = selectedVariant
      ? selectedVariant.price.amountMinor
      : Commerce.minVariantPrice(product);
    const allQuoted = priceFloor === null;
    const card = el("article", {
      className: "dca-commerce-product-card",
      data: { category: product.category, productId: product.id },
    });
    const visualLink = el("a", {
      className: "dca-commerce-product-visual-link",
      attrs: {
        href: destination,
        "aria-label": selectedVariant
          ? `View ${product.name}, ${selectedVariant.sku}`
          : `View ${product.name}`,
      },
    }, createProductVisual(product, selectedVariant));
    const body = el("div", { className: "dca-commerce-product-card-body" });
    const meta = el("div", { className: "dca-commerce-product-meta" });
    meta.append(
      el("span", { text: product.brand }),
      el("span", {
        text: `${product.variants.length} ${product.variants.length === 1 ? "option" : "options"}`,
      }),
    );
    const title = el("h3");
    title.append(
      el("a", { text: product.name, attrs: { href: destination } }),
    );
    const fitRow = el("div", { className: "dca-commerce-card-fit" });
    // Hide the "Unknown" compatibility badge entirely — only show positive
    // fit signals (Fits your vehicle / Universal fit). Unknown = render nothing.
    if (activeFit.status !== "unknown") {
      const badge = Commerce.fitment.createBadge(activeFit, true);
      if (selectedVariant) {
        badge.lastElementChild.textContent = `${activeFit.label}`;
      } else if (product.variants.length > 1 && productFit.counts.compatible > 0) {
        badge.lastElementChild.textContent = `${productFit.counts.compatible} compatible ${
          productFit.counts.compatible === 1 ? "option" : "options"
        }`;
      } else if (product.variants.length > 1 && productFit.counts.conditional > 0) {
        badge.lastElementChild.textContent = `${productFit.counts.conditional} conditional ${
          productFit.counts.conditional === 1 ? "option" : "options"
        }`;
      } else if (activeFit.status === "compatible") {
        badge.lastElementChild.textContent = activeFit.label;
      }
      fitRow.append(badge);
    }

    const pricing = allQuoted
      ? createPrice({ amountMinor: null, currency: "USD" }, { compact: true })
      : createPrice(
          { amountMinor: priceFloor, currency: "USD" },
          {
            compact: true,
            prefix:
              selectedVariant
                ? selectedVariant.price.kind === "msrp"
                  ? "MSRP"
                  : "Reference"
                : product.variants.length > 1
                ? "From"
                : product.variants[0].price.kind === "msrp"
                  ? "MSRP"
                  : "Reference",
          },

        );
    const actions = el("div", { className: "dca-commerce-card-actions" });
    actions.append(
      pricing,
      el("a", {
        className: "dca-commerce-button dca-commerce-button-card",
        text: product.variants.length > 1
          ? "View options"
          : "View product",
        attrs: { href: destination },
      }),
    );
    body.append(
      meta,
      title,
      fitRow,
      actions,
    );
    card.append(visualLink, body);
    return card;
  };

  const createFitmentPanel = (result, { heading = "Compatibility status" } = {}) => {
    const panel = el("div", {
      className: `dca-commerce-fit-panel is-${result.status}`,
      style: "padding: 20px; border-radius: 16px; border: 1px solid var(--line); background: rgba(13, 16, 21, 0.3); display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 24px;"
    });
    const copy = el("div");
    copy.append(
      el("span", { style: "font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); display: block; margin-bottom: 5px;", text: heading }),
      el("h2", {
        style: "font-size: 17px; font-weight: 700; margin: 0; color: #fff; line-height: 1.2;",
        text: Commerce.vehicle.current
          ? `${result.label} for ${Commerce.vehicle.getLabel()}`
          : result.label,
        attrs: { id: "product-fitment-heading" },
      }),
    );
    panel.append(copy, Commerce.fitment.createBadge(result));
    return panel;
  };

  const toast = (message) => {
    let root = document.querySelector("[data-commerce-toast]");
    if (!root) {
      root = el("div", {
        className: "dca-commerce-toast",
        attrs: {
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true",
        },
        data: { commerceToast: "" },
      });
      document.body.append(root);
    }
    root.textContent = message;
    root.classList.add("is-visible");
    window.clearTimeout(toast.timeout);
    toast.timeout = window.setTimeout(() => root.classList.remove("is-visible"), 3600);
  };

  Commerce.ui = {
    createProductVisual,
    createPrice,
    createSourceStatus,
    createProductCard,
    createFitmentPanel,
    overrideUnknownFit,
    toast,
  };
})();
