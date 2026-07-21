#!/usr/bin/env node
/**
 * fetch-stock-product-images.mjs
 *
 * Fetches PROFESSIONAL STOCK-STYLE product photos (product on white
 * background, retailer/manufacturer style) for every product in
 * catalog-data.js, replacing candid/placeholder images.
 *
 * How it works:
 *   1. Builds search queries from each product's brand + model + type
 *      (models taken from the master catalog spreadsheet).
 *   2. Scrapes Bing Images with the "white" dominant-color filter.
 *   3. Scores candidates for relevance (model/brand/type tokens in the
 *      result title or source page URL).
 *   4. Downloads the image and VERIFIES a white background by sampling
 *      border pixels of a 32x32 BMP conversion (no dependencies needed).
 *   5. Saves a 600px-wide quality-78 JPEG to assets/img/products/<id>.jpg
 *      (the site's CSS renders images with object-fit: contain, so any
 *      aspect ratio sits cleanly on the square card).
 *
 * Guarantees: unique image per product (dedupe by URL + MD5), white-
 * background check on every accepted image, sources recorded in
 * data/image-attributions.v1.json for audit.
 *
 * Usage:
 *   node tools/fetch-stock-product-images.mjs [--only=sub-001,amp-002]
 *
 * Resumable via tools/.stock-image-state.json.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(SITE, "assets", "img", "products");
const ATTR_PATH = path.join(SITE, "data", "image-attributions.v1.json");
const STATE_PATH = path.join(__dirname, ".stock-image-state.json");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SEARCH_DELAY_MS = 1200;
const MIN_BORDER_WHITE = 0.55;
const MIN_ALL_WHITE = 0.15;

function loadCatalog() {
  const code = fs.readFileSync(
    path.join(SITE, "assets", "js", "commerce", "catalog-data.js"),
    "utf-8",
  );
  const window = {};
  new Function("window", code)(window);
  return window.DCA_CATALOG_DATA;
}

// ---------------------------------------------------------------------------
// Per-product query data (models from the master catalog spreadsheet)
// ---------------------------------------------------------------------------
// Known legible models -> used for exact-model queries.
const MODEL_MAP = {
  "sub-002": "CUP", "sub-003": "ADS1250", "sub-004": "KFC-WPS1000F",
  "sub-005": "G3-12D", "sub-006": "STXW12D4", "sub-007": "WF3030D",
  "sub-008": "TS-A301D4", "sub-009": "GR-12PW", "sub-010": "ADS1260",
  "sub-011": "GW12D4", "sub-012": "G3-8D", "sub-013": "ADS835",
  "sub-016": "ADS1050", "sub-017": "GR-10PW", "sub-018": "GR-15PW",
  "sub-019": "G3-15D",
  "amp-001": "ST-2500.2", "amp-005": "AT-5000.1", "amp-006": "Zeus Gamma",
  "amp-007": "Brutus", "amp-008": "D7500.1D",
  "hu-003": "VGR-5700G", "hu-007": "KW-M560BT", "hu-012": "KDC-BT282U",
  "hu-013": "KDC-BT35", "hu-014": "UTE-73BT", "hu-015": "Celebrity 100",
  "spk-001": "STX X69.2R 6x9", "spk-004": "CS-DF6930", "spk-005": "TS-A6970F",
  "spk-010": "SXE-1750S", "spk-011": "Alpine S-S57 5x7", "spk-012": "TS-G1620F",
  "spk-020": "Audio360 ADS1650P", "spk-025": "ST-694", "spk-026": "AB-690",
  "enc-007": "Q12BD", "acc-008": "SX4C",
};

// Full query-list overrides for products whose type needs special phrasing.
const QUERY_OVERRIDES = {
  "sub-014": ["12 inch car subwoofer", "car audio subwoofer 12"],
  "sub-015": ["10 inch car subwoofer", "car audio subwoofer 10 inch"],
  "sub-020": ["Memphis 10 inch subwoofer", "Memphis car subwoofer"],
  "enc-001": ["dual 12 subwoofer enclosure box loaded", "dual subwoofer box"],
  "enc-002": ["single 12 subwoofer enclosure box", "subwoofer box enclosure"],
  "enc-003": ["dual subwoofer enclosure plexiglass", "subwoofer box"],
  "enc-004": ["dual subwoofer enclosure", "loaded subwoofer box"],
  "enc-005": ["empty dual subwoofer enclosure box carpeted", "subwoofer enclosure empty"],
  "enc-006": ["empty single subwoofer box carpeted", "subwoofer enclosure empty"],
  "enc-008": ["subwoofer enclosure box", "dual subwoofer box"],
  "acc-001": ["Rockford Fosgate RCA cable", "car audio RCA cable 2 channel"],
  "acc-002": ["Audiotek RCA cable", "car audio RCA cable"],
  "acc-003": ["car audio RCA cable pack", "RCA interconnect cable car"],
  "acc-004": ["car audio cable kit RCA", "RCA cable assortment"],
  "acc-005": ["ANL fuse holder car audio", "car audio fuse holder distribution block"],
  "acc-006": ["ANL fuse holder inline", "power distribution block car audio"],
  "acc-007": ["0 gauge amplifier wiring kit", "0 gauge amp install kit"],
  "acc-008": ["4 gauge amplifier wiring kit", "4 AWG amp wiring kit"],
  "acc-009": ["amplifier installation wiring kit", "8 gauge amp wiring kit"],
  "acc-010": ["car dome tweeters pair", "car audio tweeter"],
  "acc-011": ["car dome tweeters pair", "car audio tweeter 200W"],
  "acc-012": ["car audio tweeters pair", "dome tweeter car"],
  "pa-001": ["LED party speaker tower bluetooth", "light up party speaker"],
  "pa-002": ["portable party speaker pair", "bluetooth party speaker"],
  "pa-003": ["powered PA speaker 15 inch", "active PA speaker"],
  "pa-004": ["tower speaker bluetooth led", "portable tower speaker"],
  "spk-027": ["car audio speakers set", "car coaxial speakers pair"],
  "hu-017": ["screen mirroring car stereo", "car multimedia receiver touchscreen"],
};

function typeWordFor(product) {
  const id = product.id;
  if (id.startsWith("enc-")) return "subwoofer enclosure";
  if (id.startsWith("pa-")) return "party speaker";
  if (id.startsWith("acc-")) {
    if (["acc-001", "acc-002", "acc-003", "acc-004"].includes(id)) return "RCA cable";
    if (["acc-005", "acc-006"].includes(id)) return "fuse holder";
    if (["acc-007", "acc-008", "acc-009"].includes(id)) return "amplifier wiring kit";
    return "car tweeters";
  }
  switch (product.category) {
    case "subwoofers": return "car subwoofer";
    case "amplifiers": return "car amplifier";
    case "receivers": return "car stereo receiver";
    case "speakers": return "car speakers";
    default: return "car audio";
  }
}

// Brands that need disambiguation help in queries.
const BRAND_QUERY_NAME = {
  "Sound Xtreme / Xtreme": "Xtreme audio",
  "Sound Xtreme": "Sound Xtreme car audio",
  "Sound Xtreme / Remote Xtreme": "Xtreme car stereo",
  "Multiple brands": "",
  "Unknown": "",
  "Generic": "",
  "Unknown / EMB Home": "EMB party speaker",
  "EMB Home (appears)": "EMB party speaker",
  "Quality / BGCOR": "",
  "CITA": "CITA car audio",
  "Gravity": "Gravity car audio",
  "Warzone Elite": "Warzone car audio",
  "Audio360": "Audio360",
  "STX Audio": "STX car audio",
  "STX": "STX car audio",
};

function buildQueries(product) {
  if (QUERY_OVERRIDES[product.id]) return QUERY_OVERRIDES[product.id].slice();
  const queries = [];
  const seen = new Set();
  const push = (q) => {
    const k = q.trim().toLowerCase().replace(/\s+/g, " ");
    if (k && !seen.has(k)) { seen.add(k); queries.push(k); }
  };

  const rawBrand = (product.brand || "").trim();
  const brand = BRAND_QUERY_NAME[rawBrand] !== undefined
    ? BRAND_QUERY_NAME[rawBrand]
    : rawBrand;
  const type = typeWordFor(product);
  const model = MODEL_MAP[product.id];

  const sizeMatch = (product.name || "").match(
    /(6x9|6\.5|5x7|6x8|8|10|12|15)[ -]?inch/i,
  );
  const size = sizeMatch ? sizeMatch[0].toLowerCase().replace(" ", "-") : "";

  if (brand && model) {
    push(`${brand} ${model}`);
    push(`${brand} ${model} ${type}`);
  }
  if (brand && size) push(`${brand} ${size} ${type}`);
  if (brand) push(`${brand} ${type}`);
  if (size) push(`${size} ${type}`);
  push(type);
  return queries;
}

// ---------------------------------------------------------------------------
// DuckDuckGo image search (vqd token flow) + relevance scoring
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSearchAt = 0;

async function ddgFetch(url) {
  return fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://duckduckgo.com/",
    },
  });
}

async function ddgImages(query) {
  const wait = Math.max(0, lastSearchAt + SEARCH_DELAY_MS - Date.now());
  if (wait) await sleep(wait);
  lastSearchAt = Date.now();

  const pageRes = await ddgFetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  );
  if (!pageRes.ok) throw new Error(`DDG page HTTP ${pageRes.status}`);
  const pageHtml = await pageRes.text();
  const vqdMatch =
    pageHtml.match(/vqd="([^"]+)"/) || pageHtml.match(/vqd=([\d-]+)/);
  if (!vqdMatch) throw new Error("no vqd token");
  const vqd = vqdMatch[1];

  await sleep(400);
  const res = await ddgFetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}` +
      `&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`,
  );
  if (!res.ok) throw new Error(`DDG i.js HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .filter((r) => r.image && /\.(jpe?g|png)($|\?)/i.test(r.image))
    .filter((r) => !r.width || r.width >= 400)
    .map((r) => ({
      murl: r.image,
      purl: r.url || "",
      t: r.title || "",
    }));
}

const squash = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// At least one of these words must appear in the result title/page URL.
function requiredWordsFor(product) {
  const id = product.id;
  if (id.startsWith("enc-")) return ["subwoofer", "enclosure", "box"];
  if (id.startsWith("pa-")) return ["speaker"];
  if (id.startsWith("acc-")) {
    if (["acc-001", "acc-002", "acc-003", "acc-004"].includes(id))
      return ["rca", "cable"];
    if (["acc-005", "acc-006"].includes(id)) return ["fuse"];
    if (["acc-007", "acc-008", "acc-009"].includes(id))
      return ["wiring", "kit", "cable"];
    return ["tweeter"];
  }
  switch (product.category) {
    case "subwoofers": return ["subwoofer"];
    case "amplifiers": return ["amplifier", "amp"];
    case "receivers": return ["stereo", "radio", "receiver", "din"];
    case "speakers": return ["speaker"];
    default: return ["audio"];
  }
}

// House/flea-market brands whose token almost never appears in stock-photo
// titles; for these we accept on the product-type word alone.
const WEAK_BRAND_TOKENS = new Set([
  "gravity", "stx", "audio360", "audiobank", "audiotek", "warzone",
  "cita", "emb", "xtreme", "quality", "bgcor", "sound", "remote",
]);

function brandTokenFor(product) {
  const rawBrand = (product.brand || "").trim();
  const mapped = BRAND_QUERY_NAME[rawBrand];
  const brandName = mapped !== undefined ? mapped : rawBrand;
  if (!brandName) return "";
  const token = squash(brandName.split(" ")[0]);
  return WEAK_BRAND_TOKENS.has(token) ? "" : token;
}

// Wrong-category words that must not appear in the result title/URL.
function excludeWordsFor(product) {
  if (product.id.startsWith("acc-") || product.id.startsWith("enc-"))
    return [];
  switch (product.category) {
    case "subwoofers": return ["coaxial", "tweeter"];
    case "speakers": return ["subwoofer"];
    case "amplifiers": return ["subwoofer"];
    default: return [];
  }
}

function scoreCandidate(product, cand, queryUsedModel) {
  const hay = squash(`${cand.t} ${cand.purl}`);
  if (!hay) return 0;
  const brandToken = brandTokenFor(product);
  const model = MODEL_MAP[product.id];
  if (excludeWordsFor(product).some((w) => hay.includes(squash(w)))) return 0;
  const reqHit = requiredWordsFor(product).some((w) =>
    hay.includes(squash(w)),
  );
  let score = 0;
  if (model && hay.includes(squash(model))) score += 6;
  if (brandToken && brandToken.length >= 3 && hay.includes(brandToken))
    score += 2;
  if (reqHit) score += 2;
  if (model && queryUsedModel) return score >= 6 ? score : 0; // model must appear
  if (brandToken && brandToken.length >= 3)
    return score >= 4 ? score : 0; // brand + required type word
  return reqHit ? score : 0;
}

// ---------------------------------------------------------------------------
// Download, white-background verification, and processing
// ---------------------------------------------------------------------------
function md5File(file) {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

// Sample a 32x32 BMP conversion; return border/overall near-white ratios.
function whiteness(bmpPath) {
  const data = fs.readFileSync(bmpPath);
  if (data.length < 54 || data.readUInt16LE(28) !== 24) return null;
  const offset = data.readUInt32LE(10);
  const w = Math.abs(data.readInt32LE(18));
  const h = Math.abs(data.readInt32LE(22));
  const rowSize = Math.floor((w * 24 + 31) / 32) * 4;
  let borderWhite = 0, borderN = 0, allWhite = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = offset + y * rowSize + x * 3;
      const white =
        data[i + 2] >= 235 && data[i + 1] >= 235 && data[i] >= 235;
      if (white) allWhite++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        borderN++;
        if (white) borderWhite++;
      }
    }
  }
  const total = w * h;
  return { border: borderWhite / borderN, all: allWhite / total };
}

// Returns { hash, bytes } on success; throws on any failure.
function fetchAndProcess(cand, productId) {
  const tmp = path.join(PRODUCTS_DIR, `_stk_${productId}`);
  const bmp = path.join(PRODUCTS_DIR, `_stk_${productId}.bmp`);
  const out = path.join(PRODUCTS_DIR, `${productId}.jpg`);
  try {
    execFileSync(
      "curl",
      ["-sfL", "--max-time", "40", "-A", BROWSER_UA,
       "-o", tmp, cand.murl],
      { stdio: "pipe" },
    );
    const dlSize = fs.statSync(tmp).size;
    if (dlSize < 5000) throw new Error("download too small");
    execFileSync(
      "sips",
      ["-s", "format", "bmp", "--resampleHeightWidth", "32", "32", tmp,
       "--out", bmp],
      { stdio: "pipe" },
    );
    const w = whiteness(bmp);
    if (!w) throw new Error("whiteness check unreadable");
    if (w.border < MIN_BORDER_WHITE || w.all < MIN_ALL_WHITE) {
      throw new Error(
        `not white-bg (border=${w.border.toFixed(2)} all=${w.all.toFixed(2)})`,
      );
    }
    execFileSync(
      "sips",
      ["-s", "format", "jpeg", "-s", "formatOptions", "78",
       "--resampleWidth", "600", tmp, "--out", out],
      { stdio: "pipe" },
    );
    const stat = fs.statSync(out);
    if (stat.size < 4000) throw new Error("output too small");
    return { hash: md5File(out), bytes: stat.size };
  } finally {
    for (const f of [tmp, bmp]) if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",") : null;

  const catalog = loadCatalog();
  let products = catalog.products;
  if (only) products = products.filter((p) => only.includes(p.id));
  console.log(`Processing ${products.length} products`);

  const state = fs.existsSync(STATE_PATH)
    ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"))
    : { done: {}, failed: {} };
  const attributions = fs.existsSync(ATTR_PATH)
    ? JSON.parse(fs.readFileSync(ATTR_PATH, "utf-8"))
    : { schemaVersion: 1, generatedAt: null, images: {} };

  const usedUrls = new Set();
  const usedHashes = new Set();
  for (const [pid, rec] of Object.entries(state.done)) {
    usedUrls.add(rec.murl);
    const f = path.join(PRODUCTS_DIR, `${pid}.jpg`);
    if (fs.existsSync(f)) usedHashes.add(md5File(f));
  }

  for (const product of products) {
    const pid = product.id;
    if (state.done[pid]) {
      console.log(`SKIP  ${pid} (already done)`);
      continue;
    }
    const queries = buildQueries(product);
    const model = MODEL_MAP[product.id];
    let placed = false;

    for (const query of queries) {
      if (placed) break;
      const queryUsedModel = !!(
        model && query.toLowerCase().includes(model.toLowerCase())
      );
      let results = [];
      try {
        results = await ddgImages(query);
      } catch (err) {
        console.log(`  ! search "${query}": ${err.message}`);
        continue;
      }
      // Score + sort best-first.
      const scored = results
        .map((c) => ({ c, s: scoreCandidate(product, c, queryUsedModel) }))
        .filter((x) => x.s > 0 && !usedUrls.has(x.c.murl))
        .sort((a, b) => b.s - a.s);

      let tried = 0;
      for (const { c } of scored) {
        if (tried >= 6) break;
        tried++;
        try {
          const { hash, bytes } = fetchAndProcess(c, pid);
          if (usedHashes.has(hash)) {
            console.log(`  ~ ${pid}: duplicate image content, next`);
            continue;
          }
          usedUrls.add(c.murl);
          usedHashes.add(hash);
          const record = {
            file: `assets/img/products/${pid}.jpg`,
            bytes,
            query,
            title: c.t,
            imageUrl: c.murl,
            sourcePage: c.purl,
            provider: "duckduckgo-image-search",
            murl: c.murl,
          };
          state.done[pid] = record;
          delete state.failed[pid];
          attributions.images[pid] = record;
          fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
          console.log(
            `OK    ${pid}  <- "${(c.t || "").slice(0, 60)}" (${(bytes / 1024).toFixed(1)}KB, q="${query}")`,
          );
          placed = true;
          break;
        } catch (err) {
          console.log(`  ~ ${pid}: ${err.message.slice(0, 70)}`);
        }
      }
    }

    if (!placed) {
      state.failed[pid] = "no white-background stock image found";
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      console.log(`FAIL  ${pid}`);
    }
  }

  attributions.generatedAt = new Date().toISOString();
  fs.writeFileSync(ATTR_PATH, JSON.stringify(attributions, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Done: ${Object.keys(state.done).length}`);
  console.log(`Failed: ${Object.keys(state.failed).length}`);
  if (Object.keys(state.failed).length) {
    console.log(`Failed IDs: ${Object.keys(state.failed).join(", ")}`);
    if (!only) process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
