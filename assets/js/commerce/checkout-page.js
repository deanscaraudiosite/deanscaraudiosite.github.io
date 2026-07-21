(function () {
  "use strict";

  const Commerce = window.DCACommerce;
  const layout = document.querySelector("[data-checkout-layout]");
  if (!layout) return;

  const confirmation = document.querySelector("[data-checkout-confirmation]");
  
  // Elements
  const btnNext1 = document.querySelector("[data-action-next='2']");
  const btnNext2 = document.querySelector("[data-action-next='3']");
  const btnBack1 = document.querySelector("[data-action-back='1']");
  const btnBack2 = document.querySelector("[data-action-back='2']");
  const btnSubmit = document.querySelector("[data-action-submit]");
  
  const inName = document.querySelector("[data-input-name]");
  const inEmail = document.querySelector("[data-input-email]");
  const inPhone = document.querySelector("[data-input-phone]");
  const inAddr = document.querySelector("[data-input-address]");
  const inCity = document.querySelector("[data-input-city]");
  const inState = document.querySelector("[data-input-state]");
  const inZip = document.querySelector("[data-input-zip]");
  
  const inCard = document.querySelector("[data-input-card]");
  const inCardName = document.querySelector("[data-input-cardname]");
  const inExpiry = document.querySelector("[data-input-expiry]");
  const inCvv = document.querySelector("[data-input-cvv]");
  
  const cardType = document.querySelector("[data-card-type]");
  const cardNumDisp = document.querySelector("[data-card-number-display]");
  const cardNameDisp = document.querySelector("[data-card-name-display]");
  const cardExpDisp = document.querySelector("[data-card-expiry-display]");

  const steps = [1, 2, 3];
  
  const summaryList = document.querySelector("[data-summary-list]");
  const totSub = document.querySelector("[data-total-subtotal]");
  const totTax = document.querySelector("[data-total-tax]");
  const totGrand = document.querySelector("[data-total-grand]");

  // Order summary rendering
  const renderSummary = () => {
    const cart = Commerce.cart.getCart();
    const summary = Commerce.cart.getSummary();
    
    if (cart.lines.length === 0) {
      window.location.href = Commerce.url("catalog.html");
      return;
    }
    
    summaryList.replaceChildren();
    
    for (const line of cart.lines) {
      const product = Commerce.productForVariant.get(line.variantId);
      const variant = Commerce.variantById.get(line.variantId);
      
      const li = Commerce.element("li", { className: "dca-checkout-summary-item" });
      const imgUrl = variant.imageUrl || (product ? `assets/images/${product.category === 'receivers' ? 'receiver' : product.category === 'speakers' ? 'speaker' : product.category === 'subwoofers' ? 'subwoofer' : product.category === 'amplifiers' ? 'amplifier' : 'installation'}.jpg` : 'assets/images/receiver.jpg');
      
      const img = Commerce.element("img", {
        className: "dca-checkout-item-thumb",
        attrs: { src: imgUrl, alt: "" }
      });
      
      const info = Commerce.element("div", { className: "dca-checkout-item-info" });
      info.append(
        Commerce.element("div", { className: "dca-checkout-item-name", text: product ? product.name : variant.name }),
        Commerce.element("div", { className: "dca-checkout-item-meta", text: `Qty ${line.quantity} · SKU ${variant.sku}` })
      );
      
      const priceVal = variant.price.amountMinor;
      const priceText = Number.isInteger(priceVal) ? Commerce.formatMoney(priceVal * line.quantity) : "TBD";
      const priceEl = Commerce.element("div", { className: "dca-checkout-item-price", text: priceText });
      
      li.append(img, info, priceEl);
      summaryList.append(li);
    }
    
    const subMinor = summary.estimatedSubtotalMinor;
    const taxMinor = Math.round(subMinor * 0.0875);
    const grandMinor = subMinor + taxMinor;
    
    totSub.textContent = Commerce.formatMoney(subMinor);
    totTax.textContent = Commerce.formatMoney(taxMinor);
    totGrand.textContent = Commerce.formatMoney(grandMinor);
  };
  
  // Validation helpers
  const showError = (input, errorSelector, msg) => {
    input.classList.add("is-invalid");
    input.classList.remove("is-valid");
    document.querySelector(errorSelector).textContent = msg;
  };
  
  const clearError = (input, errorSelector) => {
    input.classList.remove("is-invalid");
    input.classList.add("is-valid");
    document.querySelector(errorSelector).textContent = "";
  };

  const validateStep1 = () => {
    let valid = true;
    if (!inName.value.trim() || inName.value.trim().length < 2) {
      showError(inName, "[data-error-name]", "Please enter a valid name");
      valid = false;
    } else clearError(inName, "[data-error-name]");
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inEmail.value)) {
      showError(inEmail, "[data-error-email]", "Valid email required");
      valid = false;
    } else clearError(inEmail, "[data-error-email]");
    
    if (inPhone.value.replace(/\D/g,'').length < 10) {
      showError(inPhone, "[data-error-phone]", "Valid phone required");
      valid = false;
    } else clearError(inPhone, "[data-error-phone]");
    
    return valid;
  };

  const validateStep2 = () => {
    let valid = true;
    if (!inAddr.value.trim()) { showError(inAddr, "[data-error-address]", "Address required"); valid = false; } else clearError(inAddr, "[data-error-address]");
    if (!inCity.value.trim()) { showError(inCity, "[data-error-city]", "City required"); valid = false; } else clearError(inCity, "[data-error-city]");
    if (!inState.value) { showError(inState, "[data-error-state]", "State required"); valid = false; } else clearError(inState, "[data-error-state]");
    if (inZip.value.replace(/\D/g,'').length < 5) { showError(inZip, "[data-error-zip]", "Valid ZIP required"); valid = false; } else clearError(inZip, "[data-error-zip]");
    return valid;
  };

  const validateStep3 = () => {
    let valid = true;
    const cardNum = inCard.value.replace(/\D/g, '');
    if (cardNum.length < 13) { showError(inCard, "[data-error-card]", "Valid card number required"); valid = false; } else clearError(inCard, "[data-error-card]");
    if (!inCardName.value.trim()) { showError(inCardName, "[data-error-cardname]", "Name on card required"); valid = false; } else clearError(inCardName, "[data-error-cardname]");
    if (!/^\d{2}\/\d{2}$/.test(inExpiry.value)) { showError(inExpiry, "[data-error-expiry]", "Valid expiry (MM/YY) required"); valid = false; } else clearError(inExpiry, "[data-error-expiry]");
    if (inCvv.value.replace(/\D/g,'').length < 3) { showError(inCvv, "[data-error-cvv]", "Valid CVV required"); valid = false; } else clearError(inCvv, "[data-error-cvv]");
    return valid;
  };

  const showStep = (step) => {
    document.querySelectorAll("[data-checkout-step]").forEach(el => el.classList.remove("is-active"));
    document.querySelector(`[data-checkout-step="${step}"]`).classList.add("is-active");
    
    document.querySelectorAll("[data-progress-step]").forEach(el => {
      const s = parseInt(el.dataset.progressStep, 10);
      if (s < step) {
        el.classList.add("is-complete");
        el.classList.remove("is-active");
      } else if (s === step) {
        el.classList.add("is-active");
        el.classList.remove("is-complete");
      } else {
        el.classList.remove("is-active", "is-complete");
      }
    });
  };

  btnNext1.addEventListener("click", () => { if (validateStep1()) showStep(2); });
  btnBack1.addEventListener("click", () => showStep(1));
  btnNext2.addEventListener("click", () => { if (validateStep2()) showStep(3); });
  btnBack2.addEventListener("click", () => showStep(2));
  
  // Card formatting
  inCard.addEventListener("input", (e) => {
    let val = e.target.value.replace(/\D/g, '');
    let formatted = val.match(/.{1,4}/g)?.join(' ') || '';
    e.target.value = formatted;
    
    cardNumDisp.textContent = formatted || '•••• •••• •••• ••••';
    
    if (val.startsWith('4')) cardType.textContent = 'VISA';
    else if (val.startsWith('5') || val.startsWith('2')) cardType.textContent = 'MASTERCARD';
    else if (val.startsWith('3')) cardType.textContent = 'AMEX';
    else cardType.textContent = 'CARD';
  });

  inCardName.addEventListener("input", (e) => {
    cardNameDisp.textContent = e.target.value.toUpperCase() || 'JOHN DOE';
  });

  inExpiry.addEventListener("input", (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 2) val = val.substring(0,2) + '/' + val.substring(2,4);
    e.target.value = val;
    cardExpDisp.textContent = val || 'MM/YY';
  });

  btnSubmit.addEventListener("click", () => {
    if (!validateStep3()) return;
    
    btnSubmit.textContent = "Processing payment...";
    btnSubmit.disabled = true;
    
    // Simulate API request to backend
    setTimeout(() => {
        const ts = Date.now().toString();
        const orderId = `DCA-${ts.substring(ts.length-6)}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        
        Commerce.cart.clear();
        
        layout.hidden = true;
        confirmation.hidden = false;
        document.querySelector("[data-order-id]").textContent = orderId;
        Commerce.ui.toast('Order placed successfully!');
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1500);
  });

  renderSummary();

})();
