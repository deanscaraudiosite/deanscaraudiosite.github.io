(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const list = document.querySelector("[data-cart-list]");
  if (!list) return;

  const empty = document.querySelector("[data-cart-empty]");
  const cartContent = document.querySelector("[data-cart-content]");
  const itemCount = document.querySelector("[data-summary-items]");
  const subtotal = document.querySelector("[data-summary-subtotal]");
  const unpriced = document.querySelector("[data-summary-unpriced]");
  const unpricedRow = document.querySelector("[data-summary-unpriced-row]");
  const riskNote = document.querySelector("[data-cart-risk-note]");
  const clearButton = document.querySelector("[data-clear-cart]");
  const clearConfirm = document.querySelector("[data-clear-confirm]");
  const clearYes = document.querySelector("[data-clear-yes]");
  const clearNo = document.querySelector("[data-clear-no]");
  const emptyAction = document.querySelector("[data-empty-cart-action]");
  let pendingFocus = null;

  const vehicleLabel = (vehicle) =>
    vehicle
      ? `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`
      : "No vehicle assigned";

  const adjacentLineId = (lineId) => {
    const lines = Commerce.cart.getCart().lines;
    const index = lines.findIndex((item) => item.id === lineId);
    if (index < 0) return null;
    return lines[index + 1]?.id || lines[index - 1]?.id || null;
  };

  const requestLineFocus = (lineId, control) => {
    pendingFocus = { lineId, control };
  };

  const requestRemovalFocus = (lineId) => {
    pendingFocus = {
      lineId: adjacentLineId(lineId),
      control: "product",
      empty: true,
    };
  };

  const restoreFocus = (hasLines) => {
    if (!pendingFocus) return;
    const request = pendingFocus;
    pendingFocus = null;
    if (!hasLines) {
      if (request.empty) emptyAction?.focus();
      return;
    }
    const line = [...list.children].find(
      (item) => item.dataset.lineId === request.lineId,
    );
    const target = line?.querySelector(
      `[data-cart-control="${request.control}"]`,
    );
    (target || list.querySelector("[data-cart-control='product']"))?.focus();
  };

  const createLine = (line) => {
    const currentProduct = Commerce.productForVariant.get(line.variantId);
    const currentVariant = Commerce.variantById.get(line.variantId);
    const archived =
      line.catalogStatus === "archived" || !currentProduct || !currentVariant;
    const snapshot = line.displaySnapshot || {};
    const sku = archived ? snapshot.sku || line.variantId : currentVariant.sku;
    const name = archived
      ? snapshot.variantName || snapshot.productName || sku
      : currentVariant.name;
    const visualProduct = archived
      ? {
          brand: "Archived item",
          category: currentProduct?.category || "archived",
          visualType: currentProduct?.visualType || "accessory",
        }
      : currentProduct;
    const visualVariant = archived ? { sku } : currentVariant;
    const result = archived
      ? {
          status: "unknown",
          ...Commerce.fitment.statusMeta.unknown,
          label: "Fitment unavailable",
          customerNote:
            "This saved SKU is not in the current catalog release, so fitment cannot be re-evaluated.",
          conditions: [],
          source: null,
        }
      : Commerce.ui.overrideUnknownFit(Commerce.fitment.evaluate(line.variantId, line.selectedVehicle), line.variantId);
    const item = Commerce.element("li", {
      className: "dca-commerce-cart-line",
      data: { lineId: line.id },
    });
    item.append(Commerce.ui.createProductVisual(visualProduct, visualVariant));

    const body = Commerce.element("div", { className: "dca-commerce-cart-line-body" });
    const copy = Commerce.element("div");
    copy.append(
      Commerce.element("span", {
        className: "dca-commerce-eyebrow",
        text: archived ? "Archived catalog snapshot" : currentProduct.brand,
      }),
    );
    const title = Commerce.element("h2");
    if (archived) {
      title.append(
        Commerce.element("span", {
          text: name,
          attrs: { tabindex: "-1" },
          data: { cartControl: "product" },
        }),
      );
    } else {
      title.append(
        Commerce.element("a", {
          text: name,
          attrs: {
            href: Commerce.urlForVehicle(
              "product.html",
              { slug: currentProduct.slug, variant: currentVariant.id },
              line.selectedVehicle,
            ),
          },
          data: { cartControl: "product" },
        }),
      );
    }
    const categoryLabel = archived
      ? "Unavailable in current catalog"
      : Commerce.categoryById.get(currentProduct.category).label;
    copy.append(
      title,
      Commerce.element("p", {
        className: "dca-commerce-cart-line-meta",
        text: categoryLabel,
      }),
      Commerce.element("p", {
        className: "dca-commerce-cart-line-vehicle",
        text: `Vehicle: ${vehicleLabel(line.selectedVehicle)}`,
      }),
    );
    const fit = Commerce.element("div", { className: "dca-commerce-cart-line-fit" });
    fit.append(Commerce.fitment.createBadge(result, true));
    if (archived) {
      fit.append(
        Commerce.element("span", {
          className: "dca-commerce-source-status is-source_unavailable",
          text: "Archived · retained from your saved cart snapshot",
        }),
      );
    }
    copy.append(fit);

    const controls = Commerce.element("div", { className: "dca-commerce-line-controls" });
    const pricing = Commerce.element("div", { className: "dca-commerce-line-price" });
    if (archived) {
      pricing.append(
        Commerce.element("strong", { text: "Unavailable" }),
        Commerce.element("span", { text: "Excluded from estimate" }),
      );
    } else if (Number.isInteger(currentVariant.price.amountMinor)) {
      pricing.append(
        Commerce.element("strong", {
          text: Commerce.formatMoney(currentVariant.price.amountMinor * line.quantity),
        }),
        Commerce.element("span", { text: "Manufacturer reference total" }),
      );
    } else {
      pricing.append(
        Commerce.element("strong", { text: "Price on request" }),
        Commerce.element("span", { text: "Not included in estimate" }),
      );
    }

    let stepper = null;
    if (!archived) {
      stepper = Commerce.element("div", {
        className: "dca-commerce-stepper",
        attrs: { role: "group", "aria-label": `Quantity for ${sku}` },
      });
      const minus = Commerce.element("button", {
        text: "−",
        attrs: { type: "button", "aria-label": `Decrease ${sku} quantity` },
        data: { cartControl: "decrease" },
      });
      const quantity = Commerce.element("input", {
        attrs: {
          type: "number",
          min: "1",
          max: "25",
          value: line.quantity,
          inputmode: "numeric",
          "aria-label": `${sku} quantity`,
        },
        data: { cartControl: "quantity" },
      });
      const plus = Commerce.element("button", {
        text: "+",
        attrs: { type: "button", "aria-label": `Increase ${sku} quantity` },
        data: { cartControl: "increase" },
      });
      minus.addEventListener("click", () => {
        if (line.quantity <= 1) {
          requestRemovalFocus(line.id);
          Commerce.cart.removeItem(line.id);
        } else {
          requestLineFocus(line.id, "decrease");
          Commerce.cart.setQuantity(line.id, line.quantity - 1);
        }
      });
      plus.addEventListener("click", () => {
        requestLineFocus(line.id, "increase");
        Commerce.cart.setQuantity(line.id, Math.min(25, line.quantity + 1));
      });
      quantity.addEventListener("change", () => {
        const next = Number.parseInt(quantity.value, 10);
        if (!Number.isInteger(next) || next < 1) {
          requestRemovalFocus(line.id);
          Commerce.cart.removeItem(line.id);
        } else {
          requestLineFocus(line.id, "quantity");
          Commerce.cart.setQuantity(line.id, Math.min(25, next));
        }
      });
      stepper.append(minus, quantity, plus);
    }

    const remove = Commerce.element("button", {
      className: "dca-commerce-line-remove",
      text: "Remove",
      attrs: { type: "button", "aria-label": `Remove ${sku} from cart` },
      data: { cartControl: "remove" },
    });
    remove.addEventListener("click", () => {
      requestRemovalFocus(line.id);
      Commerce.cart.removeItem(line.id);
      Commerce.ui.toast(`${name} removed from cart.`);
    });
    controls.append(pricing);
    if (stepper) controls.append(stepper);
    controls.append(remove);
    body.append(copy, controls);
    item.append(body);
    return { item, result, product: currentProduct, archived };
  };

  const render = (cart = Commerce.cart.getCart()) => {
    const summary = Commerce.cart.getSummary();
    list.replaceChildren();
    const hasLines = cart.lines.length > 0;
    empty.hidden = hasLines;
    cartContent.hidden = !hasLines;
    clearConfirm.hidden = true;
    clearButton.setAttribute("aria-expanded", "false");

    let blockedCount = 0;
    let conditionalCount = 0;
    let archivedCount = 0;
    for (const line of cart.lines) {
      const rendered = createLine(line);
      list.append(rendered.item);
      if (rendered.archived) {
        archivedCount += 1;
        blockedCount += 1;
        continue;
      }
      if (
        rendered.result.status === "incompatible" ||
        (rendered.result.status === "unknown" &&
          rendered.product.fitmentPolicy === "required")
      ) {
        blockedCount += 1;
      }
      if (rendered.result.status === "conditional") conditionalCount += 1;
    }

    itemCount.textContent = `${summary.itemCount} ${summary.itemCount === 1 ? "item" : "items"}`;
    subtotal.textContent = Commerce.formatMoney(summary.estimatedSubtotalMinor);
    unpriced.textContent = `${summary.unpricedCount} ${summary.unpricedCount === 1 ? "item" : "items"}`;
    unpricedRow.hidden = summary.unpricedCount === 0;

    const messages = [];
    if (archivedCount) {
      messages.push(
        `${archivedCount} archived ${archivedCount === 1 ? "line is" : "lines are"} retained for reference and excluded from the estimate.`,
      );
    }
    if (blockedCount) {
      messages.push(
        `${blockedCount} ${blockedCount === 1 ? "line needs" : "lines need"} fitment confirmation or replacement before checkout.`,
      );
    }
    if (conditionalCount) {
      messages.push(
        `${conditionalCount} conditional ${conditionalCount === 1 ? "line requires" : "lines require"} installer review.`,
      );
    }
    messages.push(
      "Proceed to secure checkout to finalize your order, or call Dean's to confirm pricing and availability.",
    );
    riskNote.textContent = messages.join(" ");
    restoreFocus(hasLines);
  };

  clearButton.addEventListener("click", () => {
    const expanded = clearButton.getAttribute("aria-expanded") === "true";
    clearButton.setAttribute("aria-expanded", String(!expanded));
    clearConfirm.hidden = expanded;
    if (!expanded) clearNo.focus();
  });
  clearNo.addEventListener("click", () => {
    clearConfirm.hidden = true;
    clearButton.setAttribute("aria-expanded", "false");
    clearButton.focus();
  });
  clearYes.addEventListener("click", () => {
    pendingFocus = { lineId: null, control: "product", empty: true };
    Commerce.cart.clear();
    Commerce.ui.toast("Guest cart cleared.");
  });

  Commerce.cart.subscribe(render);
  window.addEventListener("dca:vehicle-change", () => render());
})();
