(function () {
  "use strict";

  const Commerce = window.DCACommerce;

  const updateCartBadges = () => {
    const { itemCount } = Commerce.cart.getSummary();
    for (const badge of document.querySelectorAll("[data-cart-count]")) {
      badge.textContent = String(itemCount);
      badge.setAttribute(
        "aria-label",
        `${itemCount} ${itemCount === 1 ? "item" : "items"} in cart`,
      );
    }
  };

  const updateCommerceLinks = () => {
    for (const link of document.querySelectorAll("[data-commerce-link]")) {
      const route = link.dataset.commerceLink;
      if (route === "catalog") link.href = Commerce.url("catalog.html");
      if (route === "cart") link.href = Commerce.url("cart.html");
    }
  };

  const updateStorageNotices = () => {
    for (const note of document.querySelectorAll("[data-cart-storage-note]")) {
      note.textContent = Commerce.cart.persistent
        ? "Guest cart · saved on this device"
        : "Guest cart · available for this visit only";
    }
  };

  const navigation = document.querySelector("[data-store-navigation]");
  const navigationToggle = document.querySelector("[data-nav-toggle]");
  const closeNavigation = ({ returnFocus = false } = {}) => {
    if (!navigation || !navigationToggle) return;
    navigation.classList.remove("is-open");
    navigationToggle.setAttribute("aria-expanded", "false");
    navigationToggle.setAttribute("aria-label", "Open store navigation");
    if (returnFocus) navigationToggle.focus();
  };

  if (navigation && navigationToggle) {
    navigationToggle.setAttribute("aria-label", "Open store navigation");
    navigationToggle.addEventListener("click", () => {
      const open = navigationToggle.getAttribute("aria-expanded") === "true";
      if (open) {
        closeNavigation();
      } else {
        navigation.classList.add("is-open");
        navigationToggle.setAttribute("aria-expanded", "true");
        navigationToggle.setAttribute("aria-label", "Close store navigation");
        navigation.querySelector("a")?.focus();
      }
    });
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNavigation();
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        navigationToggle.getAttribute("aria-expanded") === "true"
      ) {
        closeNavigation({ returnFocus: true });
      }
    });
    const desktop = window.matchMedia?.("(min-width: 1025px)");
    desktop?.addEventListener?.("change", (event) => {
      if (event.matches) closeNavigation();
    });
  }

  Commerce.cart.subscribe(() => {
    updateCartBadges();
    updateStorageNotices();
  });
  Commerce.vehicle.render();
  updateCommerceLinks();
  updateCartBadges();
  updateStorageNotices();
  window.addEventListener("dca:vehicle-change", updateCommerceLinks);

  const year = document.querySelector("[data-current-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ── Scroll-reveal (progressive enhancement) ──────────────────────────
     Adds .dca-reveal to key content blocks, then fades them in as they
     enter the viewport. If IntersectionObserver or motion preference is
     unavailable, everything is simply shown. */
  const initReveal = () => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const selectors = [
      ".dca-commerce-hero > .dca-commerce-content",
      ".dca-commerce-content > div",
      ".dca-commerce-vehicle-bar",
      ".dca-commerce-filter-panel",
      ".dca-commerce-summary-card",
      ".dca-commerce-account-card",
      ".dca-checkout-form-panel",
      ".dca-checkout-summary",
    ];
    // Containers that hold dynamic catalog content must never be hidden by the
    // reveal animation (products/results are rendered by JS and must stay visible).
    const EXCLUDE = ".dca-commerce-results, .dca-commerce-product-grid, [data-product-grid]";

    const targets = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest(".dca-commerce-header, .dca-commerce-footer")) continue;
        if (el.matches(EXCLUDE) || el.querySelector(EXCLUDE)) continue;
        targets.push(el);
      }
    }
    if (!targets.length) return;

    // Avoid double-revealing a container and its own descendants (which can
    // leave an ancestor stuck hidden and hide everything inside it). Keep the
    // outermost target only.
    const topLevel = targets.filter(
      (el) => !targets.some((other) => other !== el && other.contains(el)),
    );


    if (reduced || !("IntersectionObserver" in window)) {
      return; // no reveal animation; content is visible by default
    }

    topLevel.forEach((el, i) => {
      el.classList.add("dca-reveal");
      // gentle stagger for grids of cards
      el.style.setProperty("--reveal-delay", `${Math.min((i % 6) * 60, 300)}ms`);
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    topLevel.forEach((el) => io.observe(el));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReveal);
  } else {
    initReveal();
  }
})();
