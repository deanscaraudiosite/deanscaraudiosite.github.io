import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteDir = path.resolve(__dirname, '..');
const outputFilePath = path.join(siteDir, 'deans_car_audio_complete.html');

console.log('Compiling standalone single-file website (Direct Inlining)...');

// Image inlining Cache
const imageCache = {};

// Function to inline images to Base64
const inlineImages = (content) => {
  // Matches assets/img/... or assets/images/... optionally followed by ?... query params
  const regex = /assets\/(img|images)\/[a-zA-Z0-9_\-\/]+\.(png|jpg|jpeg|webp|gif)(\?[a-zA-Z0-9\.\=\-_]+)?/g;
  const matches = content.match(regex) || [];
  for (const match of matches) {
    const cleanPath = match.split('?')[0];
    const absPath = path.join(siteDir, cleanPath);
    if (fs.existsSync(absPath)) {
      if (!imageCache[match]) {
        console.log(`Inlining image: ${cleanPath}`);
        const ext = path.extname(cleanPath).replace('.', '').toLowerCase();
        const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
        const base64 = fs.readFileSync(absPath).toString('base64');
        imageCache[match] = `data:${mime};base64,${base64}`;
      }
      content = content.replaceAll(match, imageCache[match]);
    }
  }
  return content;
};

// 1. Read CSS
const css = fs.readFileSync(path.join(siteDir, 'assets/css/commerce.css'), 'utf8');

// Helper to load and preprocess JS files
const loadJs = (filename, patchFn) => {
  let content = fs.readFileSync(path.join(siteDir, filename), 'utf8');
  if (patchFn) {
    content = patchFn(content);
  }
  return content;
};

// 2. Read and patch JS files
const jsFiles = [
  loadJs('assets/js/commerce/catalog-data.js'),
  loadJs('assets/js/commerce/fitment-data.js'),
  loadJs('assets/js/commerce/core.js', (content) => {
    // Override url() and urlForVehicle() to return hashes for SPA
    content = content.replace(
      /const url = \(path, params = \{\}\) => \{[\s\S]*?return `\$\{target\.pathname\.split\("\/"\)\.pop\(\)\}\$\{target\.search\}\$\{target\.hash\}`;[\s\S]*?\};/,
      `const url = (path, params = {}) => {
        const page = path.split("/").pop().replace(".html", "");
        const targetParams = new URLSearchParams();
        const vehicle = currentVehicleParam();
        if (vehicle) targetParams.set("vehicle", vehicle);
        for (const [key, value] of Object.entries(params)) {
          if (value !== null && value !== undefined && value !== "") {
            targetParams.set(key, String(value));
          }
        }
        const q = targetParams.toString();
        const pageHash = page === "index" ? "home" : page;
        return "#" + pageHash + (q ? "?" + q : "");
      };`
    );
    
    content = content.replace(
      /const urlForVehicle = \(path, params = \{\}\, vehicle = null\) => \{[\s\S]*?return `\$\{target\.pathname\.split\("\/"\)\.pop\(\)\}\$\{target\.search\}\$\{target\.hash\}`;[\s\S]*?\};/,
      `const urlForVehicle = (path, params = {}, vehicle = null) => {
        const page = path.split("/").pop().replace(".html", "");
        const targetParams = new URLSearchParams();
        if (vehicle) targetParams.set("vehicle", JSON.stringify(vehicle));
        for (const [key, value] of Object.entries(params)) {
          if (value !== null && value !== undefined && value !== "") {
            targetParams.set(key, String(value));
          }
        }
        const q = targetParams.toString();
        const pageHash = page === "index" ? "home" : page;
        return "#" + pageHash + (q ? "?" + q : "");
      };`
    );
    
    // Replace window.location.search with SPA fallback
    content = content.replaceAll(
      'new URLSearchParams(window.location.search)',
      'new URLSearchParams(window.location.search.length > 1 ? window.location.search : (window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?")) : ""))'
    );
    return content;
  }),
  loadJs('assets/js/commerce/vehicle-context.js'),
  loadJs('assets/js/commerce/fitment-engine.js'),
  loadJs('assets/js/commerce/cart-store.js'),
  loadJs('assets/js/commerce/account-cart-adapter.js'),
  loadJs('assets/js/commerce/guest-account-merge.js'),
  loadJs('assets/js/commerce/ui.js'),
  loadJs('assets/js/commerce/shell.js'),
  loadJs('assets/js/commerce/vehicle-specs.js'),
  loadJs('assets/js/commerce/homepage-fitment.js'),
  loadJs('assets/js/commerce/home-planner.js'),
  loadJs('assets/js/commerce/home-bridge.js'),
  loadJs('assets/js/commerce/catalog-page.js', (content) => {
    // Expose render function for routing
    content = content.replace(
      'window.addEventListener("dca:vehicle-change", render);\n  render();',
      'window.addEventListener("dca:vehicle-change", render);\n  render();\n  window.DCA_CATALOG_RENDER = render;'
    );
    content = content.replaceAll(
      'new URLSearchParams(window.location.search)',
      'new URLSearchParams(window.location.search.length > 1 ? window.location.search : (window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?")) : ""))'
    );
    return content;
  }),
  loadJs('assets/js/commerce/product-page.js', (content) => {
    // Expose render function for routing
    content = content.replace(
      'window.addEventListener("dca:vehicle-change", render);\n  render();',
      'window.addEventListener("dca:vehicle-change", render);\n  render();\n  window.DCA_PRODUCT_RENDER = render;'
    );
    content = content.replaceAll(
      'new URLSearchParams(window.location.search)',
      'new URLSearchParams(window.location.search.length > 1 ? window.location.search : (window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?")) : ""))'
    );
    return content;
  }),
  loadJs('assets/js/commerce/cart-page.js', (content) => {
    // Expose render function for routing
    content = content.replace(
      'render();\n})();',
      'render();\n  window.DCA_CART_RENDER = render;\n})();'
    );
    return content;
  }),
  loadJs('assets/js/commerce/checkout-page.js', (content) => {
    // Expose render function for routing
    content = content.replace(
      /renderSummary\(\);\s*\}\)\(\);/,
      `renderSummary();
  window.DCA_CHECKOUT_RENDER = () => {
    showStep(1);
    if (typeof layout !== 'undefined') layout.hidden = false;
    if (typeof confirmation !== 'undefined') confirmation.hidden = true;
    if (typeof btnSubmit !== 'undefined') {
      btnSubmit.textContent = "Place Order";
      btnSubmit.disabled = false;
    }
    renderSummary();
  };
})();`
    );
    return content;
  })
];

// 3. Read HTML layouts
const getBodyContent = (filePath) => {
  const html = fs.readFileSync(path.join(siteDir, filePath), 'utf8');
  // Extract content between <main class="..."> and </main>
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!match) throw new Error(`Could not find <main> in ${filePath}`);
  return match[1];
};

const homeHtml = getBodyContent('index.html');
const catalogHtml = getBodyContent('catalog.html');
const productHtml = getBodyContent('product.html');
const cartHtml = getBodyContent('cart.html');
const checkoutHtml = getBodyContent('checkout.html');

// 4. Construct SPA shell
const indexFrame = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');

// Replace stylesheet link with inline CSS style
let spaHtml = indexFrame.replace(
  /<link rel="stylesheet" href="assets\/css\/commerce\.css[^>]*>/,
  `<style>\n${css}\n</style>`
);

// Clean dynamic and module scripts from indexFrame
spaHtml = spaHtml.replace(/<script src="assets\/js\/commerce\/[a-zA-Z0-9_\-]+\.js(?:\?[^"]*)?"><\/script>/g, '');

// Clean any remaining log/script wrappers
spaHtml = spaHtml.replace(/<script>[\s\S]*?console\.log\([\s\S]*?<\/script>/g, '');

// Replace <main> tag in indexFrame with the 5 SPA view sections
const spaViews = `
<main class="dca-commerce-main">
  <div id="view-home" class="view-section">
    ${homeHtml}
  </div>
  <div id="view-catalog" class="view-section" style="display: none;">
    ${catalogHtml}
  </div>
  <div id="view-product" class="view-section" style="display: none;">
    ${productHtml}
  </div>
  <div id="view-cart" class="view-section" style="display: none;">
    ${cartHtml}
  </div>
  <div id="view-checkout" class="view-section" style="display: none;">
    ${checkoutHtml}
  </div>
</main>
`;

spaHtml = spaHtml.replace(/<main[^>]*>[\s\S]*?<\/main>/, spaViews);

// Fix static navigation links to hashes
spaHtml = spaHtml.replaceAll('href="index.html"', 'href="#home"');
spaHtml = spaHtml.replaceAll('href="catalog.html"', 'href="#catalog"');
spaHtml = spaHtml.replaceAll('href="cart.html"', 'href="#cart"');
spaHtml = spaHtml.replaceAll('href="checkout.html"', 'href="#checkout"');
spaHtml = spaHtml.replaceAll('href="index.html#fitment-finder"', 'href="#home#fitment-finder"');
spaHtml = spaHtml.replaceAll('href="index.html#planner"', 'href="#home#planner"');
spaHtml = spaHtml.replaceAll('href="index.html#contact"', 'href="#home#contact"');

// 5. Inlining all images into Base64 inside HTML & JS files
spaHtml = inlineImages(spaHtml);

const patchedJsFiles = jsFiles.map(content => inlineImages(content));

// Build final script block
const finalScript = `
<script>
console.log('Standalone SPA starting...');
${patchedJsFiles.join('\n\n')}

// Standalone SPA Router
(function() {
  const handleRoute = () => {
    const hash = window.location.hash || '#home';
    const routePath = hash.split('?')[0];
    
    console.log('Routing to:', routePath);
    
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => {
      el.style.display = 'none';
    });
    
    // Reset active navigation links
    document.querySelectorAll('.dca-commerce-nav a, .dca-commerce-header-actions a').forEach(el => {
      el.removeAttribute('aria-current');
      el.classList.remove('is-active');
    });
    
    if (routePath === '#home' || routePath === '#') {
      const homeView = document.getElementById('view-home');
      if (homeView) {
        homeView.style.display = 'block';
        if (hash.includes('#')) {
          const parts = hash.split('#');
          if (parts.length > 2) {
            const anchor = parts[2];
            const target = document.getElementById(anchor);
            if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 50);
          }
        }
      }
    } else if (routePath === '#catalog') {
      const catalogView = document.getElementById('view-catalog');
      if (catalogView) {
        catalogView.style.display = 'block';
        const activeLink = document.querySelector('.dca-commerce-nav a[data-commerce-link="catalog"]');
        if (activeLink) {
          activeLink.setAttribute('aria-current', 'page');
          activeLink.classList.add('is-active');
        }
        if (window.DCA_CATALOG_RENDER) window.DCA_CATALOG_RENDER();
      }
    } else if (routePath === '#product') {
      const productView = document.getElementById('view-product');
      if (productView) {
        productView.style.display = 'block';
        if (window.DCA_PRODUCT_RENDER) window.DCA_PRODUCT_RENDER();
      }
    } else if (routePath === '#cart') {
      const cartView = document.getElementById('view-cart');
      if (cartView) {
        cartView.style.display = 'block';
        const activeLink = document.querySelector('.dca-commerce-header-actions a[data-commerce-link="cart"]');
        if (activeLink) {
          activeLink.setAttribute('aria-current', 'page');
          activeLink.classList.add('is-active');
        }
        if (window.DCA_CART_RENDER) window.DCA_CART_RENDER();
      }
    } else if (routePath === '#checkout') {
      const checkoutView = document.getElementById('view-checkout');
      if (checkoutView) {
        checkoutView.style.display = 'block';
        if (window.DCA_CHECKOUT_RENDER) window.DCA_CHECKOUT_RENDER();
      }
    }
    
    // Scroll to top on navigation (except home page anchors)
    if (!hash.includes('#home#')) {
      window.scrollTo({ top: 0 });
    }
  };
  
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('load', handleRoute);
  // Trigger initial routing
  setTimeout(handleRoute, 100);
})();
</script>
`;

spaHtml = spaHtml.replace('</body>', `${finalScript}\n</body>`);

fs.writeFileSync(outputFilePath, spaHtml, 'utf8');
console.log('Standalone single-file compilation successful! Saved to:', outputFilePath);
