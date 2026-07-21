(() => {
  "use strict";

  const Commerce = (window.DCACommerce = window.DCACommerce || {});
  const STORAGE_KEY = "dcaCommerceSystemPlanV1";
  const VEHICLE_KEY = "dcaCommerceVehicleV1";
  const summaryEl = document.querySelector("[data-planner-summary]");
  const contactLink = document.querySelector("[data-planner-contact]");
  const clearBtn = document.querySelector("[data-planner-clear]");
  const buttons = document.querySelectorAll("[data-planner-btn]");

  if (!summaryEl || !contactLink || !clearBtn || buttons.length === 0) return;

  const PLANS = {
    bass: { title: "More bass", desc: "Subwoofers and enclosure planning" },
    sound: { title: "Clearer sound", desc: "Speaker-focused improvements" },
    power: { title: "More power", desc: "Amplifier and signal planning" },
    controls: { title: "Modern controls", desc: "Head unit and connectivity goals" },
    system: { title: "Complete system", desc: "Plan the full audio signal chain" }
  };

  let selectedKeys = [];

  const loadSavedPlan = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        selectedKeys = JSON.parse(saved) || [];
      }
    } catch (e) {
      selectedKeys = [];
    }
  };

  const savePlan = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedKeys));
    } catch (e) {}
  };

  const getActiveVehicle = () => {
    try {
      const raw = localStorage.getItem(VEHICLE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const updateUI = () => {
    const vehicle = getActiveVehicle();
    
    // Toggle active state on buttons
    buttons.forEach((btn) => {
      const key = btn.dataset.plannerBtn;
      const isSelected = selectedKeys.includes(key);
      btn.setAttribute("aria-pressed", String(isSelected));
    });

    if (selectedKeys.length === 0) {
      summaryEl.replaceChildren();
      summaryEl.append(
        document.createTextNode("General system plan"),
        Commerce.element("br"),
        document.createTextNode("Choose one or more areas to build your plan.")
      );
      contactLink.href = "#contact";
      return;
    }

    summaryEl.replaceChildren();
    if (vehicle) {
      const vDiv = Commerce.element("div", {
        style: "margin-bottom: 12px; font-weight: 700; color: var(--blue-bright);",
        text: `Vehicle: ${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`
      });
      summaryEl.append(vDiv);
    }

    const titleStrong = Commerce.element("strong", { text: "Selected Upgrades:" });
    const ul = Commerce.element("ul", {
      style: "margin: 10px 0 0 16px; padding: 0; list-style-type: disc; display: grid; gap: 6px;"
    });

    selectedKeys.forEach((key) => {
      const p = PLANS[key];
      if (p) {
        const li = Commerce.element("li", {
          style: "color: #fff; font-size: 13.5px;"
        });
        li.append(
          Commerce.element("strong", { text: p.title, style: "color: var(--blue-bright);" }),
          document.createTextNode(` · ${p.desc}`)
        );
        ul.append(li);
      }
    });

    summaryEl.append(titleStrong, ul);

    // Build the mailto link
    const vehicleStr = vehicle ? `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}` : "No vehicle selected";
    const improvementsStr = selectedKeys.map((key) => {
      const p = PLANS[key];
      return p ? `- ${p.title} (${p.desc})` : "";
    }).filter(Boolean).join("\n");

    const emailBody = `Hi Dean's Car Audio,

I'm building a custom audio plan for my vehicle. Here are the details of what I'm looking to improve:

Vehicle: ${vehicleStr}

Upgrades I want to discuss:
${improvementsStr}

Please contact me back to talk about pricing, parts compatibility, and scheduling.

Thanks!`;

    const subject = `Car Audio Custom Build Inquiry - ${vehicleStr}`;
    contactLink.href = `mailto:deanscaraudioinfo@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  };

  // Attach button click listeners
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.plannerBtn;
      const index = selectedKeys.indexOf(key);
      if (index > -1) {
        selectedKeys.splice(index, 1);
      } else {
        selectedKeys.push(key);
      }
      savePlan();
      updateUI();
    });
  });

  // Attach clear click listener
  clearBtn.addEventListener("click", () => {
    selectedKeys = [];
    savePlan();
    updateUI();
  });

  // Listen to vehicle change event to refresh planner description dynamically
  window.addEventListener("dca:vehicle-change", updateUI);
  window.addEventListener("storage", (e) => {
    if (e.key === VEHICLE_KEY) {
      updateUI();
    }
  });

  // Init
  loadSavedPlan();
  updateUI();
})();
