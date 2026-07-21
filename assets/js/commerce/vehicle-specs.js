(() => {
  const Commerce = window.DCACommerce;
  if (!Commerce) return;

  const getVehicleSpecs = (vehicle) => {
    const make = (vehicle.makeName || "").toLowerCase();
    const model = (vehicle.modelName || "").toLowerCase();

    // Default generic specs
    const specs = {
      radioSize: "Double-DIN",
      frontSpeaker: "6.5\"",
      rearSpeaker: "6.5\"",
      subwooferEnclosure: "10\" or 12\""
    };

    // Specific popular cars specs
    if (make.includes("honda") && model.includes("civic")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("toyota") && model.includes("tacoma")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6x9\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("toyota") && model.includes("camry")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6x9\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("toyota") && model.includes("corolla")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("jeep") && (model.includes("wrangler") || model.includes("gladiator"))) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("ford") && model.includes("f-150")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6x9\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("chevrolet") && model.includes("silverado")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("subaru") && model.includes("outback")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    } else if (make.includes("bmw")) {
      specs.radioSize = "Factory Fit";
      specs.frontSpeaker = "4\"";
      specs.rearSpeaker = "4\"";
      specs.subwooferEnclosure = "8\" under-seat";
    } else if (make.includes("hyundai") && model.includes("equus")) {
      specs.radioSize = "Factory Fit";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
      specs.subwooferEnclosure = "8\" rear deck";
    } else if (make.includes("hyundai")) {
      specs.radioSize = "Double-DIN";
      specs.frontSpeaker = "6.5\"";
      specs.rearSpeaker = "6.5\"";
    }

    return specs;
  };

  const renderSpecsPanel = () => {
    const container = document.getElementById("dca-vehicle-specs-panel");
    if (!container) return;

    container.replaceChildren();
    const vehicle = Commerce.vehicle?.current;
    if (!vehicle) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    const specs = getVehicleSpecs(vehicle);

    const card = Commerce.element("div", {
      className: "dca-commerce-specs-card",
      attrs: {
        style: "background: rgba(13, 16, 21, 0.4); border: 1px solid var(--line); border-radius: 16px; padding: 12px 20px; margin-top: 15px; display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);"
      }
    });

    const titleEl = Commerce.element("div", {
      attrs: {
        style: "display: flex; align-items: center; gap: 8px;"
      }
    });
    titleEl.append(
      Commerce.element("span", { text: "🚗", attrs: { style: "font-size: 18px;" } }),
      Commerce.element("strong", {
        text: `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName} Fits:`,
        attrs: {
          style: "font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -0.01em;"
        }
      })
    );

    const badges = Commerce.element("div", {
      attrs: {
        style: "display: flex; gap: 8px; flex-wrap: wrap;"
      }
    });

    const createBadge = (label, value) => {
      const b = Commerce.element("div", {
        attrs: {
          style: "background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--foreground); display: flex; gap: 6px;"
        }
      });
      b.append(
        Commerce.element("span", { text: label, attrs: { style: "color: var(--muted);" } }),
        Commerce.element("strong", { text: value, attrs: { style: "color: var(--blue-bright);" } })
      );
      return b;
    };

    badges.append(
      createBadge("Front Doors", specs.frontSpeaker),
      createBadge("Rear Doors", specs.rearSpeaker),
      createBadge("Dash", specs.radioSize),
      createBadge("Sub", specs.subwooferEnclosure)
    );

    card.append(titleEl, badges);
    container.append(card);
  };

  // Render on load and on vehicle change
  window.addEventListener("DOMContentLoaded", renderSpecsPanel);
  window.addEventListener("dca:vehicle-change", renderSpecsPanel);
  // Also register to trigger when DCACommerce is ready
  setTimeout(renderSpecsPanel, 200);
})();
