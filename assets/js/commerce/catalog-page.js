(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const grid = document.querySelector("[data-product-grid]");
  if (!grid) return;

  const searchInput = document.querySelector("[data-catalog-search]");
  const brandSelect = document.querySelector("[data-brand-filter]");
  const compatibilitySelect = document.querySelector("[data-compatibility-filter]");
  const availabilitySelect = document.querySelector("[data-availability-filter]");
  const priceSelect = document.querySelector("[data-price-filter]");
  const sortSelect = document.querySelector("[data-sort-filter]");
  const count = document.querySelector("[data-results-count]");
  const heading = document.querySelector("[data-results-heading]");
  const chips = document.querySelector("[data-active-filters]");
  const reset = document.querySelector("[data-reset-filters]");
  const categoryList = document.querySelector("[data-category-list]");
  const params = new URLSearchParams(window.location.search);
  const allowedStatuses = new Set(["all", "compatible", "conditional", "incompatible", "unknown"]);
  const allowedAvailability = new Set([
    "all",
    "listed_for_direct_sale",
    "source_unavailable",
    "not_stated",
  ]);
  const allowedSort = new Set(["featured", "price-asc", "price-desc", "name"]);
  const allowedPrices = new Set([
    "all",
    "under-50",
    "50-100",
    "100-200",
    "200-500",
    "over-500",
  ]);
  // Ranges in minor units (cents); min inclusive, max exclusive, null = unbounded.
  const priceRanges = {
    "under-50": { min: null, max: 5000, label: "Under $50" },
    "50-100": { min: 5000, max: 10000, label: "$50 – $100" },
    "100-200": { min: 10000, max: 20000, label: "$100 – $200" },
    "200-500": { min: 20000, max: 50000, label: "$200 – $500" },
    "over-500": { min: 50000, max: null, label: "$500+" },
  };

  const brandValues = Array.from(
    new Set(Commerce.catalog.products.map((product) => product.brand).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const state = {
    query: (params.get("q") || "").slice(0, 120),
    category: Commerce.categoryById.has(params.get("category"))
      ? params.get("category")
      : "all",
    brand: brandValues.includes(params.get("brand")) ? params.get("brand") : "all",
    compatibility: allowedStatuses.has(params.get("fit"))
      ? params.get("fit")
      : "all",
    availability: allowedAvailability.has(params.get("availability"))
      ? params.get("availability")
      : "all",
    price: allowedPrices.has(params.get("price")) ? params.get("price") : "all",
    sort: allowedSort.has(params.get("sort")) ? params.get("sort") : "featured",
  };

  const searchText = (product) =>
    Commerce.normalizeText(
      [
        product.brand,
        product.name,
        product.summary,
        product.description,
        ...product.tags,
        ...product.variants.flatMap((item) => [item.sku, item.name, item.option]),
      ].join(" "),
    );

  const productSearchIndex = new Map(
    Commerce.catalog.products.map((product) => [product.id, searchText(product)]),
  );

  const matchingVariants = (product) =>
    product.variants.filter((item) => {
      if (
        state.compatibility !== "all" &&
        Commerce.fitment.evaluate(item.id).status !== state.compatibility
      ) {
        return false;
      }
      if (
        state.availability !== "all" &&
        item.sourceListingStatus !== state.availability
      ) {
        return false;
      }
      if (state.price !== "all") {
        const range = priceRanges[state.price];
        const amount =
          item.price && typeof item.price.amountMinor === "number"
            ? item.price.amountMinor
            : null;
        if (amount === null) return false;
        if (range.min !== null && amount < range.min) return false;
        if (range.max !== null && amount >= range.max) return false;
      }
      return true;
    });

  const matchProduct = (product) => {
    const query = Commerce.normalizeText(state.query);
    if (query && !productSearchIndex.get(product.id).includes(query)) return false;
    if (state.category !== "all" && product.category !== state.category) return false;
    if (state.brand !== "all" && product.brand !== state.brand) return false;

    return matchingVariants(product).length > 0;
  };

  const sortProducts = (products) => {
    const items = [...products];
    if (state.sort === "name") {
      return items.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (state.sort === "price-asc") {
      return items.sort((a, b) => {
        const left = Commerce.minVariantPrice(a);
        const right = Commerce.minVariantPrice(b);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right || a.name.localeCompare(b.name);
      });
    }
    if (state.sort === "price-desc") {
      return items.sort((a, b) => {
        const left = Commerce.maxVariantPrice(a);
        const right = Commerce.maxVariantPrice(b);
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left || a.name.localeCompare(b.name);
      });
    }
    return items.sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name),
    );
  };

  const setParam = (key, value, defaultValue = "all") => {
    if (!value || value === defaultValue) params.delete(key);
    else params.set(key, value);
  };

  const syncUrl = () => {
    setParam("q", state.query, "");
    setParam("category", state.category);
    setParam("brand", state.brand);
    setParam("fit", state.compatibility);
    setParam("availability", state.availability);
    setParam("price", state.price);
    setParam("sort", state.sort, "featured");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    try {
      window.history.replaceState(null, "", next);
    } catch (error) {
      // Filtering remains functional in browsers that restrict file:// history.
    }
  };

  const categoryLabel = () =>
    state.category === "all"
      ? "All products"
      : Commerce.categoryById.get(state.category).label;

  const renderChips = () => {
    chips.replaceChildren();
    const values = [];
    if (state.query) values.push(`Search: ${state.query}`);
    if (state.category !== "all") values.push(categoryLabel());
    if (state.brand !== "all") values.push(`Brand: ${state.brand}`);
    if (state.compatibility !== "all") {
      values.push(`Fit: ${Commerce.fitment.statusMeta[state.compatibility].label}`);
    }
    if (state.availability !== "all") {
      values.push(Commerce.sourceStatusLabel(state.availability));
    }
    if (state.price !== "all") {
      values.push(`Price: ${priceRanges[state.price].label}`);
    }
    for (const value of values) {
      chips.append(
        Commerce.element("span", {
          className: "dca-commerce-filter-chip",
          text: value,
        }),
      );
    }
  };

  const renderCategories = () => {
    categoryList.replaceChildren();
    const values = [
      { id: "all", label: "All products" },
      ...Commerce.catalog.categories,
    ];
    for (const category of values) {
      const productCount =
        category.id === "all"
          ? Commerce.catalog.products.length
          : Commerce.catalog.products.filter(
              (product) => product.category === category.id,
            ).length;
      const button = Commerce.element("button", {
        className: "dca-commerce-category-filter",
        attrs: {
          type: "button",
          "aria-pressed": String(state.category === category.id),
        },
      });
      button.append(
        Commerce.element("span", { text: category.label }),
        Commerce.element("span", { text: productCount }),
      );
      button.addEventListener("click", () => {
        state.category = category.id;
        render();
      });
      categoryList.append(button);
    }
  };

  const populateBrands = () => {
    if (!brandSelect) return;
    for (const value of brandValues) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      brandSelect.append(option);
    }
  };

  const render = () => {
    syncUrl();
    renderCategories();
    renderChips();
    const products = sortProducts(Commerce.catalog.products.filter(matchProduct));
    grid.replaceChildren();
    heading.textContent = categoryLabel();
    count.textContent = `${products.length} ${products.length === 1 ? "product family" : "product families"}`;
    if (!products.length) {
      const empty = Commerce.element("div", {
        className: "dca-commerce-empty-results",
      });
      const copy = Commerce.element("div");
      copy.append(
        Commerce.element("h3", { text: "No products match those filters." }),
        Commerce.element("p", {
          text: "Try a broader category or compatibility status. Unknown results are intentionally retained unless you filter them out.",
        }),
      );
      const button = Commerce.element("button", {
        className: "dca-commerce-button dca-commerce-button-primary",
        text: "Clear filters",
        attrs: { type: "button" },
      });
      button.addEventListener("click", clearFilters);
      copy.append(button);
      empty.append(copy);
      grid.append(empty);
      return;
    }
    for (const product of products) {
      const variants = matchingVariants(product);
      const preferredVariant =
        state.compatibility !== "all" ||
        state.availability !== "all" ||
        state.price !== "all"
          ? variants[0]
          : null;
      grid.append(
        Commerce.ui.createProductCard(product, { preferredVariant }),
      );
    }
  };

  const clearFilters = () => {
    state.query = "";
    state.category = "all";
    state.brand = "all";
    state.compatibility = "all";
    state.availability = "all";
    state.price = "all";
    state.sort = "featured";
    searchInput.value = "";
    if (brandSelect) brandSelect.value = "all";
    compatibilitySelect.value = "all";
    availabilitySelect.value = "all";
    if (priceSelect) priceSelect.value = "all";
    sortSelect.value = "featured";
    render();
    searchInput.focus();
  };

  populateBrands();
  let searchTimeout = null;
  searchInput.value = state.query;
  if (brandSelect) brandSelect.value = state.brand;
  compatibilitySelect.value = state.compatibility;
  availabilitySelect.value = state.availability;
  if (priceSelect) priceSelect.value = state.price;
  sortSelect.value = state.sort;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      state.query = searchInput.value.trim().slice(0, 120);
      render();
    }, 120);
  });
  if (brandSelect) {
    brandSelect.addEventListener("change", () => {
      state.brand = brandSelect.value;
      render();
    });
  }
  compatibilitySelect.addEventListener("change", () => {
    state.compatibility = compatibilitySelect.value;
    render();
  });
  availabilitySelect.addEventListener("change", () => {
    state.availability = availabilitySelect.value;
    render();
  });
  if (priceSelect) {
    priceSelect.addEventListener("change", () => {
      state.price = priceSelect.value;
      render();
    });
  }
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    render();
  });
  reset.addEventListener("click", clearFilters);
  window.addEventListener("dca:vehicle-change", render);

  // On small screens, present categories as a collapsed disclosure to save space.
  const categoryDisclosure = document.querySelector("[data-category-disclosure]");
  const categoryMedia = window.matchMedia("(max-width: 980px)");
  const syncCategoryDisclosure = () => {
    if (!categoryDisclosure) return;
    categoryDisclosure.open = !categoryMedia.matches;
  };
  syncCategoryDisclosure();
  if (typeof categoryMedia.addEventListener === "function") {
    categoryMedia.addEventListener("change", syncCategoryDisclosure);
  }

  render();
})();
