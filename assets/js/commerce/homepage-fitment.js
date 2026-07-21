(() => {
  const form = document.getElementById("fitment-finder");
  if (!form) return;

  const COMMON_MAKES = [
    "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", "Cadillac", 
    "Chevrolet", "Chrysler", "Dodge", "Ferrari", "FIAT", "Ford", "Genesis", "GMC", 
    "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Lamborghini", "Land Rover", 
    "Lexus", "Lincoln", "Maserati", "Mazda", "McLaren", "Mercedes-Benz", "MINI", 
    "Mitsubishi", "Nissan", "Polestar", "Porsche", "RAM", "Rolls-Royce", "Subaru", 
    "Tesla", "Toyota", "Volkswagen", "Volvo"
  ];

  const yearSelect = document.getElementById("fitment-year");
  const makeSelect = document.getElementById("fitment-make");
  const modelSelect = document.getElementById("fitment-model");
  const submitButton = document.getElementById("fitment-submit");
  const status = document.getElementById("fitment-status");

  // Populate years (2026 down to 1995)
  const years = [];
  for (let y = 2026; y >= 1995; y--) {
    years.push(y);
  }

  const fillSelect = (select, values, placeholder) => {
    select.replaceChildren(
      new Option(placeholder, ""),
      ...values.map((value) => new Option(value, value)),
    );
    select.disabled = values.length === 0;
  };

  // Initial fill
  fillSelect(yearSelect, years, "Select year");
  fillSelect(makeSelect, COMMON_MAKES, "Select make");
  makeSelect.disabled = true;
  modelSelect.disabled = true;

  const loadModels = async (year, make, selectValue = null) => {
    if (!year || !make) return;

    modelSelect.replaceChildren(new Option("Loading models...", ""));
    modelSelect.disabled = true;
    submitButton.disabled = true;
    status.textContent = `Connecting to NHTSA database to fetch ${year} ${make} models...`;

    try {
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
      );
      if (!response.ok) throw new Error("Network response was not ok");
      
      const data = await response.json();
      const rawResults = data.Results || [];
      
      // Extract, sanitize, and deduplicate model names
      const modelsList = [
        ...new Set(
          rawResults
            .map((r) => r.Model_Name ? r.Model_Name.trim() : "")
            .filter((m) => m.length > 0)
        )
      ].sort((a, b) => a.localeCompare(b));

      if (modelsList.length === 0) {
        fillSelect(modelSelect, [], "No models found");
        status.textContent = `No models found for ${year} ${make}.`;
      } else {
        fillSelect(modelSelect, modelsList, "Select model");
        status.textContent = `Successfully loaded ${modelsList.length} models from NHTSA.`;
        if (selectValue && modelsList.includes(selectValue)) {
          modelSelect.value = selectValue;
          submitButton.disabled = false;
        }
      }
    } catch (err) {
      console.error(err);
      fillSelect(modelSelect, [], "Failed to load models");
      status.textContent = "Error communicating with the NHTSA database. Please try again.";
    }
  };

  yearSelect.addEventListener("change", () => {
    status.textContent = "";
    if (yearSelect.value) {
      makeSelect.disabled = false;
      if (makeSelect.value) {
        loadModels(yearSelect.value, makeSelect.value);
      } else {
        fillSelect(modelSelect, [], "Select a make first");
      }
    } else {
      makeSelect.disabled = true;
      makeSelect.value = "";
      fillSelect(modelSelect, [], "Select a year first");
      submitButton.disabled = true;
    }
  });

  makeSelect.addEventListener("change", () => {
    status.textContent = "";
    if (makeSelect.value && yearSelect.value) {
      loadModels(yearSelect.value, makeSelect.value);
    } else {
      fillSelect(modelSelect, [], "Select a make first");
      submitButton.disabled = true;
    }
  });

  modelSelect.addEventListener("change", () => {
    submitButton.disabled = !modelSelect.value;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!yearSelect.value || !makeSelect.value || !modelSelect.value) return;
    
    submitButton.textContent = "Setting vehicle...";
    submitButton.disabled = true;
    
    const vehicle = {
      source: "nhtsa-vpic",
      year: yearSelect.value,
      makeName: makeSelect.value,
      modelName: modelSelect.value,
      makeId: makeSelect.value.toLowerCase().replace(/\s+/g, '-'),
      modelId: modelSelect.value.toLowerCase().replace(/\s+/g, '-'),
    };
    
    try {
      const commerceKey = "dcaCommerceVehicleV1";
      const normalized = window.DCACommerce?.vehicle?.normalize(vehicle) || vehicle;
      window.localStorage.setItem(commerceKey, JSON.stringify(normalized));
      
      status.textContent = `Vehicle set to ${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}. Redirecting to catalog...`;
      
      setTimeout(() => {
        window.location.href = "catalog.html";
      }, 500);
    } catch (err) {
      status.textContent = "Error saving vehicle selection. Please ensure cookies/storage are enabled.";
      submitButton.textContent = "Set Vehicle";
      submitButton.disabled = false;
    }
  });
  
  // Pre-fill if vehicle is already set in local context
  setTimeout(() => {
    if (window.DCACommerce && window.DCACommerce.vehicle && window.DCACommerce.vehicle.current) {
      const v = window.DCACommerce.vehicle.current;
      yearSelect.value = v.year;
      makeSelect.disabled = false;
      makeSelect.value = v.makeName;
      loadModels(v.year, v.makeName, v.modelName);
      submitButton.textContent = "Change Vehicle";
    }
  }, 100);

})();
