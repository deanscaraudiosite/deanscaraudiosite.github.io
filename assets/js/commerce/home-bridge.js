(function () {
  "use strict";

  const GARAGE_KEY = "dcaDeviceGarageV1";

  const readActiveVehicle = () => {
    try {
      const garage = JSON.parse(localStorage.getItem(GARAGE_KEY));
      if (
        !garage ||
        garage.schemaVersion !== 1 ||
        !Array.isArray(garage.vehicles)
      ) {
        return null;
      }
      const vehicle = garage.vehicles.find(
        (item) => item.vehicleKey === garage.activeVehicleKey,
      );
      if (!vehicle) return null;
      return {
        source: "nhtsa-vpic",
        year: String(vehicle.year || ""),
        makeId: String(vehicle.makeId || ""),
        makeName: String(vehicle.makeName || ""),
        modelId: String(vehicle.modelId || ""),
        modelName: String(vehicle.modelName || ""),
        vehicleKey: String(vehicle.vehicleKey || ""),
      };
    } catch (error) {
      return null;
    }
  };

  const updateLink = (link) => {
    const target = new URL(link.getAttribute("href"), window.location.href);
    const vehicle = readActiveVehicle();
    if (vehicle) target.searchParams.set("vehicle", JSON.stringify(vehicle));
    else target.searchParams.delete("vehicle");
    link.href = target.href;
  };

  const updateAll = () => {
    for (const link of document.querySelectorAll(".js-commerce-link")) {
      updateLink(link);
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest(".js-commerce-link");
      if (link) updateLink(link);
    },
    true,
  );
  window.addEventListener("storage", (event) => {
    if (event.key === GARAGE_KEY) updateAll();
  });
  updateAll();
})();
