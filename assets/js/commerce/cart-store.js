(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const STORAGE_KEY = "dcaGuestCartV1";
  const SAFE_SESSION_KEY = `${STORAGE_KEY}:compat-session-v1`;
  const SCHEMA_VERSION = 1;
  const MAX_LINES = 100;
  const MAX_TOMBSTONES = 500;
  const MAX_QUANTITY = 25;
  const clientId =
    (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
    `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let operationCounter = 0;
  const listeners = new Set();

  const now = () => new Date().toISOString();
  const createOperationId = () => {
    operationCounter += 1;
    return `${clientId}:${String(operationCounter).padStart(6, "0")}`;
  };

  const createCart = () => ({
    schemaVersion: SCHEMA_VERSION,
    cartId:
      (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
      `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    currency: "USD",
    version: 0,
    lines: [],
    deletedLines: [],
    updatedAt: now(),
    operationId: createOperationId(),
  });

  const validTimestamp = (value, fallback = "1970-01-01T00:00:00.000Z") => {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
  };

  const clampQuantity = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed)
      ? Math.min(MAX_QUANTITY, Math.max(1, parsed))
      : 1;
  };

  const normalizeLine = (line) => {
    if (!line || typeof line !== "object") return null;
    const id = String(line.id || "").trim().slice(0, 220);
    const variantId = String(line.variantId || "").trim().slice(0, 180);
    if (!id || !variantId) return null;
    const product = Commerce.productForVariant.get(variantId);
    const variant = Commerce.variantById.get(variantId);
    const savedSku = String(line.displaySnapshot?.sku || "").trim();
    const currentSku = String(variant?.sku || "").trim();
    const skuChanged = Boolean(
      savedSku &&
        currentSku &&
        savedSku.toLocaleUpperCase("en-US") !==
          currentSku.toLocaleUpperCase("en-US"),
    );
    const catalogStatus = variant && product && !skuChanged ? "active" : "archived";
    const updatedAt = validTimestamp(line.updatedAt || line.addedAt, now());
    return {
      id,
      variantId,
      quantity: clampQuantity(line.quantity),
      vehicleKey: line.vehicleKey ? String(line.vehicleKey).slice(0, 180) : null,
      selectedVehicle: Commerce.vehicle.normalize(line.selectedVehicle),
      configuration:
        line.configuration && typeof line.configuration === "object"
          ? { ...line.configuration }
          : {},
      displaySnapshot: {
        productName: String(
          line.displaySnapshot?.productName || product?.name || "Archived catalog item",
        ).slice(0, 180),
        variantName: String(
          line.displaySnapshot?.variantName || variant?.name || savedSku || variantId,
        ).slice(0, 180),
        sku: String(savedSku || currentSku || variantId).slice(0, 80),
        amountMinor: Number.isInteger(line.displaySnapshot?.amountMinor)
          ? line.displaySnapshot.amountMinor
          : Number.isInteger(variant?.price?.amountMinor)
            ? variant.price.amountMinor
            : null,
        currency: "USD",
      },
      fitmentSnapshot:
        line.fitmentSnapshot && typeof line.fitmentSnapshot === "object"
          ? {
              status: String(line.fitmentSnapshot.status || "unknown"),
              ruleId: line.fitmentSnapshot.ruleId || null,
              releaseId: String(
                line.fitmentSnapshot.releaseId ||
                  Commerce.fitment.data.releaseId,
              ),
              evaluatedAt: validTimestamp(
                line.fitmentSnapshot.evaluatedAt,
                updatedAt,
              ),
            }
          : {
              status: "unknown",
              ruleId: null,
              releaseId: Commerce.fitment.data.releaseId,
              evaluatedAt: updatedAt,
            },
      addedAt: validTimestamp(line.addedAt, updatedAt),
      updatedAt,
      operationId: String(line.operationId || "legacy").slice(0, 220),
      catalogStatus,
      catalogStatusReason:
        catalogStatus === "active"
          ? null
          : skuChanged
            ? "sku_changed"
            : "missing_variant",
    };
  };

  const normalizeDeletion = (item) => {
    if (!item || typeof item !== "object") return null;
    const lineId = String(item.lineId || "").trim().slice(0, 220);
    if (!lineId) return null;
    return {
      lineId,
      deletedAt: validTimestamp(item.deletedAt, now()),
      operationId: String(item.operationId || "legacy").slice(0, 220),
    };
  };

  const isNewerSchema = (value) =>
    Boolean(
      value &&
        typeof value === "object" &&
        Number.isInteger(value.schemaVersion) &&
        value.schemaVersion > SCHEMA_VERSION,
    );

  const recordIsNewer = (left, right, timestampKey) => {
    if (!right) return true;
    const leftTime = Date.parse(left[timestampKey]);
    const rightTime = Date.parse(right[timestampKey]);
    if (leftTime !== rightTime) return leftTime > rightTime;
    return String(left.operationId) > String(right.operationId);
  };

  const compareText = (left, right) => {
    const leftText = String(left);
    const rightText = String(right);
    if (leftText === rightText) return 0;
    return leftText < rightText ? -1 : 1;
  };

  const compareRecord = (left, right, timestampKey, idKey) => {
    const timeDifference =
      Date.parse(left[timestampKey]) - Date.parse(right[timestampKey]);
    if (timeDifference) return timeDifference;
    const operationDifference = compareText(left.operationId, right.operationId);
    if (operationDifference) return operationDifference;
    return compareText(left[idKey], right[idKey]);
  };

  const compactionTombstone = (line) => ({
    lineId: line.id,
    deletedAt: line.updatedAt,
    // The leading tilde makes an eviction beat the exact line revision when
    // timestamps tie, while any genuinely newer edit can still revive it.
    operationId: `~compaction:${line.operationId}:${line.id}`.slice(0, 220),
  });

  const resolveRecords = (lineValues, deletionValues) => {
    const lines = new Map();
    const deletions = new Map();

    for (const line of lineValues) {
      const current = lines.get(line.id);
      if (recordIsNewer(line, current, "updatedAt")) lines.set(line.id, line);
    }
    for (const deletion of deletionValues) {
      const current = deletions.get(deletion.lineId);
      if (recordIsNewer(deletion, current, "deletedAt")) {
        deletions.set(deletion.lineId, deletion);
      }
    }

    for (const [lineId, deletion] of deletions) {
      const line = lines.get(lineId);
      if (!line) continue;
      const lineTime = Date.parse(line.updatedAt);
      const deletionTime = Date.parse(deletion.deletedAt);
      const lineWins =
        lineTime > deletionTime ||
        (lineTime === deletionTime && line.operationId > deletion.operationId);
      if (!lineWins) lines.delete(lineId);
    }

    const rankedLines = [...lines.values()].sort((left, right) =>
      compareRecord(left, right, "updatedAt", "id"),
    );
    const evicted = rankedLines.slice(0, Math.max(0, rankedLines.length - MAX_LINES));
    for (const line of evicted) {
      lines.delete(line.id);
      const deletion = compactionTombstone(line);
      const current = deletions.get(line.id);
      if (recordIsNewer(deletion, current, "deletedAt")) {
        deletions.set(line.id, deletion);
      }
    }

    return {
      lines: [...lines.values()].sort((left, right) => {
        const addedDifference = Date.parse(left.addedAt) - Date.parse(right.addedAt);
        return addedDifference || compareText(left.id, right.id);
      }),
      deletedLines: [...deletions.values()]
        .sort((left, right) =>
          compareRecord(left, right, "deletedAt", "lineId"),
        )
        .slice(-MAX_TOMBSTONES),
    };
  };

  const normalizeCart = (value) => {
    if (
      !value ||
      typeof value !== "object" ||
      value.schemaVersion !== SCHEMA_VERSION
    ) {
      return null;
    }
    const base = createCart();
    const normalizedLines = Array.isArray(value.lines)
      ? value.lines.map(normalizeLine).filter(Boolean)
      : [];
    const normalizedDeletions = Array.isArray(value.deletedLines)
      ? value.deletedLines.map(normalizeDeletion).filter(Boolean)
      : [];
    const records = resolveRecords(normalizedLines, normalizedDeletions);
    return {
      ...base,
      cartId: String(value.cartId || base.cartId).slice(0, 180),
      version: Math.max(0, Number.parseInt(value.version, 10) || 0),
      lines: records.lines,
      deletedLines: records.deletedLines,
      updatedAt: validTimestamp(value.updatedAt, base.updatedAt),
      operationId: String(value.operationId || base.operationId).slice(0, 220),
    };
  };

  const mergeCarts = (leftValue, rightValue) => {
    const left = normalizeCart(leftValue) || createCart();
    const right = normalizeCart(rightValue) || createCart();
    const records = resolveRecords(
      [...left.lines, ...right.lines],
      [...left.deletedLines, ...right.deletedLines],
    );

    const shell = recordIsNewer(left, right, "updatedAt") ? left : right;
    return {
      ...shell,
      version: Math.max(left.version, right.version),
      lines: records.lines,
      deletedLines: records.deletedLines,
      updatedAt:
        Date.parse(left.updatedAt) >= Date.parse(right.updatedAt)
          ? left.updatedAt
          : right.updatedAt,
      operationId:
        String(left.operationId) >= String(right.operationId)
          ? left.operationId
          : right.operationId,
    };
  };

  const storedCartValue = Commerce.safeJsonParse(Commerce.storage.get(STORAGE_KEY));
  const windowCartValue = Commerce.readWindowState().cart;
  let sessionOnlySafeMode =
    isNewerSchema(storedCartValue) || isNewerSchema(windowCartValue);
  const safeSessionCart = normalizeCart(
    Commerce.safeJsonParse(Commerce.storage.get(SAFE_SESSION_KEY, "session")),
  );
  const localCart = sessionOnlySafeMode ? null : normalizeCart(storedCartValue);
  const windowCart = sessionOnlySafeMode ? null : normalizeCart(windowCartValue);
  let cart = sessionOnlySafeMode
    ? safeSessionCart || createCart()
    : localCart && windowCart
      ? mergeCarts(localCart, windowCart)
      : localCart || windowCart || createCart();
  let persistent = !sessionOnlySafeMode;
  let broadcast = null;

  const cloneCart = () => JSON.parse(JSON.stringify(cart));
  const notify = () => {
    const snapshot = cloneCart();
    for (const listener of listeners) listener(snapshot);
    Commerce.dispatch("cart-change", { cart: snapshot });
  };

  const persist = ({ broadcastChange = true } = {}) => {
    const serialized = JSON.stringify(cart);
    if (sessionOnlySafeMode) {
      Commerce.storage.set(SAFE_SESSION_KEY, serialized, "session");
      persistent = false;
    } else {
      persistent = Commerce.storage.set(STORAGE_KEY, serialized);
      Commerce.writeWindowState({ cart });
    }
    if (!sessionOnlySafeMode && broadcastChange && broadcast) {
      try {
        broadcast.postMessage(cart);
      } catch (error) {
        // localStorage/window state remain the persistence path.
      }
    }
    notify();
    return persistent;
  };

  const enterSessionOnlySafeMode = () => {
    if (sessionOnlySafeMode) return;
    sessionOnlySafeMode = true;
    persistent = false;
    if (broadcast?.close) broadcast.close();
    broadcast = null;
    Commerce.storage.set(SAFE_SESSION_KEY, JSON.stringify(cart), "session");
    notify();
  };

  const touch = () => {
    cart.version += 1;
    cart.updatedAt = now();
    cart.operationId = createOperationId();
  };

  const selectedVehicle = () => Commerce.vehicle.current;
  const lineKey = (variantId, vehicleKey) =>
    `${variantId}::${vehicleKey || "no-vehicle"}::default`;

  const snapshotFor = (variantId) => {
    const product = Commerce.productForVariant.get(variantId);
    const item = Commerce.variantById.get(variantId);
    const result = Commerce.fitment.evaluate(variantId, selectedVehicle());
    return {
      product,
      item,
      result,
      displaySnapshot: {
        productName: product.name,
        variantName: item.name,
        sku: item.sku,
        amountMinor: item.price.amountMinor,
        currency: "USD",
      },
      fitmentSnapshot: {
        status: result.status,
        ruleId: result.ruleId,
        releaseId: Commerce.fitment.data.releaseId,
        evaluatedAt: now(),
      },
    };
  };

  const compactCurrentCart = () => {
    const records = resolveRecords(cart.lines, cart.deletedLines);
    cart.lines = records.lines;
    cart.deletedLines = records.deletedLines;
  };

  const addItem = ({ variantId, quantity = 1, acknowledged = false }) => {
    if (!Commerce.variantById.has(variantId)) {
      return { ok: false, reason: "unknown_variant" };
    }
    const currentFitment = Commerce.fitment.evaluate(
      variantId,
      selectedVehicle(),
    );
    if (currentFitment.status === "incompatible") {
      return { ok: false, reason: "fitment_blocked", fitment: currentFitment };
    }
    if (
      !acknowledged &&
      (currentFitment.status === "conditional" ||
        currentFitment.status === "unknown")
    ) {
      return {
        ok: false,
        reason: "acknowledgement_required",
        fitment: currentFitment,
      };
    }
    const vehicle = selectedVehicle();
    const id = lineKey(variantId, vehicle?.vehicleKey || null);
    const existing = cart.lines.find((line) => line.id === id);
    const operationId = createOperationId();
    const timestamp = now();
    const snapshots = snapshotFor(variantId);
    const next = {
      id,
      variantId,
      quantity: clampQuantity((existing?.quantity || 0) + clampQuantity(quantity)),
      vehicleKey: vehicle?.vehicleKey || null,
      selectedVehicle: vehicle ? { ...vehicle } : null,
      configuration: {},
      displaySnapshot: snapshots.displaySnapshot,
      fitmentSnapshot: snapshots.fitmentSnapshot,
      addedAt: existing?.addedAt || timestamp,
      updatedAt: timestamp,
      operationId,
      catalogStatus: "active",
      catalogStatusReason: null,
    };
    cart.lines = [...cart.lines.filter((line) => line.id !== id), next];
    cart.deletedLines = cart.deletedLines.filter((item) => item.lineId !== id);
    compactCurrentCart();
    touch();
    persist();
    return { ok: true, line: { ...next }, persistent };
  };

  const setQuantity = (lineId, quantity) => {
    const line = cart.lines.find((item) => item.id === lineId);
    if (!line) return { ok: false, reason: "missing_line" };
    const parsed = Number.parseInt(quantity, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return removeItem(lineId);
    }
    line.quantity = clampQuantity(parsed);
    line.updatedAt = now();
    line.operationId = createOperationId();
    touch();
    persist();
    return { ok: true, line: { ...line }, persistent };
  };

  const removeItem = (lineId) => {
    const line = cart.lines.find((item) => item.id === lineId);
    if (!line) return { ok: false, reason: "missing_line" };
    const deletion = {
      lineId,
      deletedAt: now(),
      operationId: createOperationId(),
    };
    cart.lines = cart.lines.filter((item) => item.id !== lineId);
    cart.deletedLines = [
      ...cart.deletedLines.filter((item) => item.lineId !== lineId),
      deletion,
    ];
    compactCurrentCart();
    touch();
    persist();
    return { ok: true, persistent };
  };

  const clear = () => {
    if (!cart.lines.length) return { ok: true, changed: false, persistent };
    const deletedAt = now();
    const deletions = cart.lines.map((line) => ({
      lineId: line.id,
      deletedAt,
      operationId: createOperationId(),
    }));
    cart.lines = [];
    cart.deletedLines = [...cart.deletedLines, ...deletions];
    compactCurrentCart();
    touch();
    persist();
    return { ok: true, changed: true, persistent };
  };

  const summary = () => {
    let itemCount = 0;
    let estimatedSubtotalMinor = 0;
    let unpricedCount = 0;
    for (const line of cart.lines) {
      itemCount += line.quantity;
      const current = Commerce.variantById.get(line.variantId);
      if (
        line.catalogStatus === "active" &&
        Number.isInteger(current?.price.amountMinor)
      ) {
        estimatedSubtotalMinor += current.price.amountMinor * line.quantity;
      } else {
        unpricedCount += line.quantity;
      }
    }
    return { itemCount, estimatedSubtotalMinor, unpricedCount };
  };

  const removeMergedSnapshot = (snapshotValue) => {
    const snapshot = normalizeCart(snapshotValue);
    if (!snapshot?.lines.length) {
      return { ok: true, changed: false, removedCount: 0, persistent };
    }
    const revisions = new Map(
      snapshot.lines.map((line) => [
        line.id,
        `${line.updatedAt}::${line.operationId}`,
      ]),
    );
    const removed = cart.lines.filter(
      (line) =>
        revisions.get(line.id) === `${line.updatedAt}::${line.operationId}`,
    );
    if (!removed.length) {
      return { ok: true, changed: false, removedCount: 0, persistent };
    }
    const deletedAt = now();
    const removedIds = new Set(removed.map((line) => line.id));
    cart.lines = cart.lines.filter((line) => !removedIds.has(line.id));
    cart.deletedLines = [
      ...cart.deletedLines,
      ...removed.map((line) => ({
        lineId: line.id,
        deletedAt,
        operationId: createOperationId(),
      })),
    ];
    compactCurrentCart();
    touch();
    persist();
    return {
      ok: true,
      changed: true,
      removedCount: removed.length,
      persistent,
    };
  };

  const receiveRemote = (remoteValue) => {
    if (isNewerSchema(remoteValue)) {
      enterSessionOnlySafeMode();
      return;
    }
    if (sessionOnlySafeMode) return;
    const remote = normalizeCart(remoteValue);
    if (!remote) return;
    const merged = mergeCarts(cart, remote);
    if (JSON.stringify(merged) === JSON.stringify(cart)) return;
    cart = merged;
    persist({ broadcastChange: false });
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    receiveRemote(Commerce.safeJsonParse(event.newValue));
  });

  if (
    !sessionOnlySafeMode &&
    "BroadcastChannel" in window &&
    window.location.protocol !== "file:"
  ) {
    try {
      broadcast = new BroadcastChannel("dca-guest-cart-v1");
      broadcast.addEventListener("message", (event) => receiveRemote(event.data));
    } catch (error) {
      broadcast = null;
    }
  }

  persist({ broadcastChange: false });

  Commerce.cart = {
    key: STORAGE_KEY,
    safeSessionKey: SAFE_SESSION_KEY,
    get persistent() {
      return persistent;
    },
    get mode() {
      if (sessionOnlySafeMode) return "session-only-newer-schema";
      return persistent ? "local" : "memory";
    },
    getCart: cloneCart,
    getSummary: summary,
    addItem,
    setQuantity,
    removeItem,
    clear,
    removeMergedSnapshot,
    mergeCarts,
    normalizeCart,
    subscribe(listener) {
      listeners.add(listener);
      listener(cloneCart());
      return () => listeners.delete(listener);
    },
  };
})();
