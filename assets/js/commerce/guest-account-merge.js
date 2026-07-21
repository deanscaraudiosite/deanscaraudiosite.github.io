(function () {
  "use strict";

  const Commerce = window.DCACommerce;

  const stableValue = (value) => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, stableValue(value[key])]),
      );
    }
    return value;
  };

  const configurationKey = (line) =>
    JSON.stringify(stableValue({
      variantId: line.variantId,
      vehicleKey: line.vehicleKey || null,
      configuration: line.configuration || {},
    }));

  const mergeLines = (guestLines = [], accountLines = [], maxQuantity = 25) => {
    const merged = new Map();
    for (const line of [...accountLines, ...guestLines]) {
      const key = configurationKey(line);
      const current = merged.get(key);
      if (!current) {
        merged.set(key, { ...line, quantity: Math.min(maxQuantity, line.quantity) });
      } else {
        current.quantity = Math.min(
          maxQuantity,
          Number(current.quantity || 0) + Number(line.quantity || 0),
        );
      }
    }
    return [...merged.values()];
  };

  const migrateGuestCart = async (adapter) => {
    if (!adapter?.available) {
      return { ok: false, reason: "account_not_connected" };
    }
    const guest = Commerce.cart.getCart();
    if (!guest.lines.length) return { ok: true, changed: false };
    const idempotencyKey = `guest-merge:${guest.cartId}:${guest.version}`;
    const result = await adapter.mergeGuestCart(guest, idempotencyKey);
    if (!result?.ok) return result;
    const localCleanup = Commerce.cart.removeMergedSnapshot(guest);
    return { ...result, localCleanup };
  };

  Commerce.guestAccountMerge = { mergeLines, migrateGuestCart };
})();
