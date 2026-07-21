(function () {
  "use strict";

  const Commerce = (window.DCACommerce = window.DCACommerce || {});
  const catalog = window.DCA_CATALOG_DATA;

  if (!catalog || catalog.schemaVersion !== 1) {
    throw new Error("Dean's catalog data is missing or unsupported.");
  }

  const productById = new Map();
  const productBySlug = new Map();
  const variantById = new Map();
  const productForVariant = new Map();

  for (const product of catalog.products) {
    productById.set(product.id, product);
    productBySlug.set(product.slug, product);
    for (const item of product.variants) {
      variantById.set(item.id, item);
      productForVariant.set(item.id, product);
    }
  }

  const formatMoney = (amountMinor, currency = "USD") => {
    if (!Number.isInteger(amountMinor)) return "Price on request";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  };

  const normalizeText = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const element = (tag, options = {}, children = []) => {
    const node = document.createElement(tag);
    const { className, text, attrs = {}, data = {} } = options;
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null && value !== undefined && value !== false) {
        node.setAttribute(key, value === true ? "" : String(value));
      }
    }
    for (const [key, value] of Object.entries(data)) {
      node.dataset[key] = String(value);
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child instanceof Node) node.append(child);
      else if (child !== null && child !== undefined) {
        node.append(document.createTextNode(String(child)));
      }
    }
    return node;
  };

  const safeJsonParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  };

  const storage = {
    get(key, type = "local") {
      try {
        return window[`${type}Storage`].getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value, type = "local") {
      try {
        window[`${type}Storage`].setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    },
    remove(key, type = "local") {
      try {
        window[`${type}Storage`].removeItem(key);
        return true;
      } catch (error) {
        return false;
      }
    },
  };

  const WINDOW_STATE_PREFIX = "dcaCommerceWindowV1:";
  const readWindowState = () => {
    if (!window.name || !window.name.startsWith(WINDOW_STATE_PREFIX)) {
      return { schemaVersion: 1 };
    }
    const parsed = safeJsonParse(window.name.slice(WINDOW_STATE_PREFIX.length));
    return parsed && parsed.schemaVersion === 1
      ? parsed
      : { schemaVersion: 1 };
  };

  const writeWindowState = (patch) => {
    if (window.name && !window.name.startsWith(WINDOW_STATE_PREFIX)) {
      return false;
    }
    try {
      window.name = `${WINDOW_STATE_PREFIX}${JSON.stringify({
        ...readWindowState(),
        ...patch,
        schemaVersion: 1,
      })}`;
      return true;
    } catch (error) {
      return false;
    }
  };

  const currentVehicleParam = () =>
    new URLSearchParams(window.location.search).get("vehicle") || "";

  const url = (path, params = {}) => {
    const target = new URL(path, window.location.href);
    const vehicle = currentVehicleParam();
    if (vehicle) target.searchParams.set("vehicle", vehicle);
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== "") {
        target.searchParams.set(key, String(value));
      }
    }
    return `${target.pathname.split("/").pop()}${target.search}${target.hash}`;
  };

  const urlForVehicle = (path, params = {}, vehicle = null) => {
    const target = new URL(path, window.location.href);
    if (vehicle) target.searchParams.set("vehicle", JSON.stringify(vehicle));
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== "") {
        target.searchParams.set(key, String(value));
      }
    }
    return `${target.pathname.split("/").pop()}${target.search}${target.hash}`;
  };

  const productUrl = (product, variantId = "") =>
    url("product.html", { slug: product.slug, variant: variantId });

  const categoryById = new Map(
    catalog.categories.map((category) => [category.id, category]),
  );

  const sourceStatusLabel = (status) => {
    const labels = {
      listed_for_direct_sale: "Listed on manufacturer source",
      source_unavailable: "Manufacturer source says unavailable",
      not_stated: "Manufacturer availability not stated",
    };
    return labels[status] || labels.not_stated;
  };

  const minVariantPrice = (product) => {
    const currentlyListable = product.variants.filter(
      (item) => item.sourceListingStatus !== "source_unavailable",
    );
    const pool = currentlyListable.length ? currentlyListable : product.variants;
    const values = pool
      .map((item) => item.price.amountMinor)
      .filter(Number.isInteger);
    return values.length ? Math.min(...values) : null;
  };

  const maxVariantPrice = (product) => {
    const currentlyListable = product.variants.filter(
      (item) => item.sourceListingStatus !== "source_unavailable",
    );
    const pool = currentlyListable.length ? currentlyListable : product.variants;
    const values = pool
      .map((item) => item.price.amountMinor)
      .filter(Number.isInteger);
    return values.length ? Math.max(...values) : null;
  };

  const dispatch = (name, detail) =>
    window.dispatchEvent(new CustomEvent(`dca:${name}`, { detail }));

  Commerce.catalog = catalog;
  Commerce.productById = productById;
  Commerce.productBySlug = productBySlug;
  Commerce.variantById = variantById;
  Commerce.productForVariant = productForVariant;
  Commerce.categoryById = categoryById;
  Commerce.formatMoney = formatMoney;
  Commerce.normalizeText = normalizeText;
  Commerce.element = element;
  Commerce.safeJsonParse = safeJsonParse;
  Commerce.storage = storage;
  Commerce.readWindowState = readWindowState;
  Commerce.writeWindowState = writeWindowState;
  Commerce.url = url;
  Commerce.urlForVehicle = urlForVehicle;
  Commerce.productUrl = productUrl;
  Commerce.sourceStatusLabel = sourceStatusLabel;
  Commerce.minVariantPrice = minVariantPrice;
  Commerce.maxVariantPrice = maxVariantPrice;
  Commerce.dispatch = dispatch;
})();
