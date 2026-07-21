(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const GARAGE_KEY = "dcaDeviceGarageV1";
  const COMMERCE_VEHICLE_KEY = "dcaCommerceVehicleV1";

  const normalizeVehicle = (vehicle) => {
    if (!vehicle || typeof vehicle !== "object") return null;
    const year = String(vehicle.year || "").trim();
    const makeName = String(vehicle.makeName || "").trim().slice(0, 100);
    const modelName = String(vehicle.modelName || "").trim().slice(0, 120);
    const makeId = String(vehicle.makeId || "").trim().slice(0, 20);
    const modelId = String(vehicle.modelId || "").trim().slice(0, 20);
    if (!/^\d{4}$/.test(year) || !makeName || !modelName) return null;
    const source = vehicle.source === "nhtsa-vpic" ? "nhtsa-vpic" : "handoff";
    return {
      source,
      year,
      makeId,
      makeName,
      modelId,
      modelName,
      vehicleKey:
        String(vehicle.vehicleKey || "").slice(0, 180) ||
        [source, year, makeId || makeName, modelId || modelName].join(":"),
    };
  };

  const decodeHandoff = (value) => {
    if (!value || value.length > 1500) return null;
    try {
      return normalizeVehicle(JSON.parse(value));
    } catch (error) {
      return null;
    }
  };

  const readGarage = (raw = Commerce.storage.get(GARAGE_KEY)) => {
    const garage = Commerce.safeJsonParse(raw);
    if (!garage || garage.schemaVersion !== 1 || !Array.isArray(garage.vehicles)) {
      return { available: false, vehicle: null };
    }
    return {
      available: true,
      vehicle: normalizeVehicle(
        garage.vehicles.find(
          (vehicle) => vehicle.vehicleKey === garage.activeVehicleKey,
        ),
      ),
    };
  };

  const fromCommerceStorage = () =>
    normalizeVehicle(
      Commerce.safeJsonParse(Commerce.storage.get(COMMERCE_VEHICLE_KEY)),
    );

  const params = new URLSearchParams(window.location.search);
  const handoff = decodeHandoff(params.get("vehicle"));
  const garage = readGarage();
  let current =
    handoff ||
    (garage.available
      ? garage.vehicle
      : fromCommerceStorage() ||
        normalizeVehicle(Commerce.readWindowState().vehicle));

  const syncUrl = () => {
    const nextParams = new URLSearchParams(window.location.search);
    if (current) nextParams.set("vehicle", JSON.stringify(current));
    else nextParams.delete("vehicle");
    const query = nextParams.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    try {
      window.history.replaceState(null, "", next);
    } catch (error) {
      // Some file:// browsers restrict history replacement; storage still stays correct.
    }
  };

  const synchronize = (nextVehicle, { announce = false } = {}) => {
    const next = normalizeVehicle(nextVehicle);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    if (current) {
      Commerce.storage.set(COMMERCE_VEHICLE_KEY, JSON.stringify(current));
    } else {
      Commerce.storage.remove(COMMERCE_VEHICLE_KEY);
    }
    Commerce.writeWindowState({ vehicle: current });
    syncUrl();
    if (announce && changed) {
      Commerce.dispatch("vehicle-change", { vehicle: current });
    }
    return changed;
  };

  synchronize(current);

  const getLabel = (vehicle = current) =>
    vehicle
      ? `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`
      : "No vehicle selected";

  const renderContext = () => {
    for (const root of document.querySelectorAll("[data-vehicle-context]")) {
      root.replaceChildren();
      const copy = Commerce.element("div", { className: "dca-commerce-vehicle-copy" });
      copy.append(
        Commerce.element("span", {
          className: "dca-commerce-eyebrow",
          text: current ? "Compatibility shown for" : "Compatibility needs a vehicle",
        }),
        Commerce.element("strong", { text: getLabel() }),
        Commerce.element("p", {
          text: current
            ? "Status is evaluated per SKU from the partial verified fitment set."
            : "Choose a vehicle on the homepage. Until then, every vehicle-specific result stays unknown.",
        }),
      );
      const link = Commerce.element("a", {
        className: "dca-commerce-button dca-commerce-button-secondary",
        text: current ? "Change vehicle" : "Choose vehicle",
        attrs: { href: "index.html#fitment-finder" },
      });
      root.append(copy, link);
    }
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== GARAGE_KEY) return;
    const nextGarage = readGarage(event.newValue);
    if (!nextGarage.available && event.newValue !== null) return;
    if (synchronize(nextGarage.vehicle, { announce: true })) renderContext();
  });

  Commerce.vehicle = {
    get current() {
      return current;
    },
    getLabel,
    normalize: normalizeVehicle,
    render: renderContext,
  };
})();
