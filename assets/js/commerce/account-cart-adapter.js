(function () {
  "use strict";

  const Commerce = window.DCACommerce;

  class AccountCartAdapter {
    constructor({ endpoint = "/api/v1/cart", getAccessToken } = {}) {
      this.endpoint = endpoint;
      this.getAccessToken = getAccessToken;
    }

    get available() {
      return typeof this.getAccessToken === "function";
    }

    async request(path = "", options = {}) {
      if (!this.available) {
        throw new Error("Account authentication is not connected.");
      }
      const token = await this.getAccessToken();
      if (!token) throw new Error("A signed-in session is required.");
      const response = await fetch(`${this.endpoint}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Account cart request failed (${response.status}).`);
      }
      return response.status === 204 ? null : response.json();
    }

    load() {
      return this.request();
    }

    mergeGuestCart(cart, idempotencyKey) {
      return this.request("/merge", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ cart }),
      });
    }

    updateLine(lineId, quantity, expectedVersion, idempotencyKey) {
      return this.request(`/lines/${encodeURIComponent(lineId)}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ quantity, expectedVersion }),
      });
    }
  }

  Commerce.AccountCartAdapter = AccountCartAdapter;
  Commerce.accountCart = new AccountCartAdapter();
})();
