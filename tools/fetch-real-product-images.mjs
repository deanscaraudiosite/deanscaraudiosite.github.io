#!/usr/bin/env node
/**
 * fetch-real-product-images.mjs
 *
 * Replaces duplicated category-placeholder product images with REAL, UNIQUE
 * freely-licensed photographs from Wikimedia Commons for every product in
 * catalog-data.js.
 *
 * Why Wikimedia Commons: its files are human-categorized, so a search for
 * "subwoofer" returns actual subwoofers (unlike loose stock-photo search).
 *
 * Guarantees:
 *   - Every product gets a DIFFERENT image (deduped by Commons page ID, file
 *     URL, and MD5 of the final processed JPEG).
 *   - Relevance guard: candidate title/categories must contain a product-type
 *     keyword before it is accepted.
 *   - Output matches the existing image pipeline convention: 300px-wide,
 *     quality-75 JPEG at assets/img/products/<product-id>.jpg
 *   - Attribution for every downloaded image is recorded in
 *     data/image-attributions.v1.json
 *
 * Usage:
 *   node tools/fetch-real-product-images.mjs [--only=sub-001,amp-002]
 *
 * Resumable: progress is kept in tools/.image-fetch-state.json; re-running
 * skips products that already completed successfully.
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
const STATE_PATH = path.join(__dirname, ".image-fetch-state.json");

const USER_AGENT =
  "DeansCarAudioCatalog/1.0 (local catalog maintenance; contact: site owner)";
const SEARCH_DELAY_MS = 1500; // stay well under Commons anon rate limits
const MAX_RETRIES = 4;

// ---------------------------------------------------------------------------
// Catalog loading (catalog-data.js is a browser IIFE that sets a window global)
// ---------------------------------------------------------------------------
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
// Query planning (Commons-oriented queries per product type)
// ---------------------------------------------------------------------------
const QUERY_OVERRIDES = {
  "sub-003": ["shallow mount subwoofer", "flat subwoofer", "subwoofer"],
  "sub-004": ["kenwood subwoofer", "shallow subwoofer", "subwoofer"],
  "sub-005": ["12 inch subwoofer", "subwoofer"],
  "sub-012": ["8 inch subwoofer", "small subwoofer", "subwoofer"],
  "sub-015": ["10 inch subwoofer", "subwoofer"],
  "sub-016": ["10 inch subwoofer", "subwoofer"],
  "sub-017": ["10 inch subwoofer", "subwoofer"],
  "sub-018": ["15 inch subwoofer", "subwoofer"],
  "sub-019": ["15 inch subwoofer", "subwoofer"],
  "sub-020": ["memphis audio subwoofer", "10 inch subwoofer", "subwoofer"],
  "enc-001": ["subwoofer enclosure", "subwoofer box", "dual subwoofer"],
  "enc-002": ["subwoofer enclosure", "subwoofer box"],
  "enc-003": ["subwoofer box", "subwoofer enclosure"],
  "enc-004": ["subwoofer enclosure", "subwoofer box"],
  "enc-005": ["subwoofer enclosure", "speaker enclosure", "subwoofer box"],
  "enc-006": ["subwoofer box", "subwoofer enclosure"],
  "enc-007": ["subwoofer box", "loaded enclosure", "subwoofer enclosure"],
  "enc-008": ["subwoofer boxes", "subwoofer enclosure", "subwoofer box"],
  "spk-025": ["6x9 speaker", "6x9 car speaker", "car loudspeaker"],
  "spk-026": ["6x9 speaker", "6x9 car speaker", "car loudspeaker"],
  "spk-027": ["car speakers", "car loudspeakers", "loudspeaker"],
  "acc-001": ["rca cable", "cinch cable", "audio cable"],
  "acc-002": ["rca cable", "cinch cable", "audio cable"],
  "acc-003": ["rca cable", "audio cable", "cinch cable"],
  "acc-004": ["audio cables", "rca cable", "cables audio"],
  "acc-005": ["anl fuse holder", "blade fuse holder", "car fuse holder", "maxi fuse"],
  "acc-006": ["anl fuse", "distribution block car audio", "car fuse box", "blade fuses"],
  "acc-007": ["car audio wiring", "power cable", "copper wire cable"],
  "acc-008": ["car audio wiring", "power cable", "cable kit"],
  "acc-009": ["car audio wiring", "amplifier wiring", "power cable"],
  "acc-010": ["dome tweeter", "tweeter", "car tweeter"],
  "acc-011": ["tweeter", "dome tweeter", "car tweeter"],
  "acc-012": ["tweeter", "dome tweeter", "speaker tweeter"],
  "pa-001": ["dj speaker box", "party loudspeaker", "pa loudspeaker", "active speaker box"],
  "pa-002": ["portable loudspeaker", "bluetooth speaker box", "party loudspeaker"],
  "pa-003": ["pa loudspeaker", "active speaker box", "stage monitor speaker", "pa box"],
  "pa-004": ["pa loudspeaker", "speaker column", "tower loudspeaker", "pa box"],
};

const CATEGORY_QUERIES = {
  subwoofers: ["car subwoofer", "subwoofer", "subwoofer driver"],
  amplifiers: ["car audio amplifier", "car amplifier", "audio power amplifier"],
  receivers: [
    "autoradio",
    "car radio",
    "car stereo",
    "2 din",
    "double din radio",
    "car audio receiver",
  ],
  speakers: ["car speaker", "car loudspeaker", "coaxial speaker", "car audio speaker"],
  installation: ["car audio", "audio cable", "car audio wiring"],
};

// Curated Commons categories used as a fallback (and as extra pool).
const CATEGORY_CHAIN = {
  subwoofers: ["Subwoofers"],
  enclosures: ["Loudspeaker enclosures", "Subwoofers"],
  amplifiers: ["Audio power amplifiers"],
  receivers: ["In-car entertainment"],
  speakers: ["Loudspeakers", "Tweeters"],
  pa: ["DJ equipment", "Loudspeakers"],
  cables: ["Audio cables", "RCA connectors"],
  fuses: ["Fuse holders"],
  wiring: ["Audio cables", "Fuse holders"],
  tweeters: ["Tweeters"],
};

function chainKeyFor(product) {
  const id = product.id;
  if (id.startsWith("enc-")) return "enclosures";
  if (id.startsWith("pa-")) return "pa";
  if (id.startsWith("acc-")) {
    if (["acc-001", "acc-002", "acc-003", "acc-004"].includes(id)) return "cables";
    if (["acc-005", "acc-006"].includes(id)) return "fuses";
    if (["acc-007", "acc-008", "acc-009"].includes(id)) return "wiring";
    return "tweeters";
  }
  return product.category;
}

function buildQueries(product) {
  const queries = [];
  const seen = new Set();
  const push = (q) => {
    const key = q.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      queries.push(key);
    }
  };
  (QUERY_OVERRIDES[product.id] || []).forEach(push);
  (CATEGORY_QUERIES[product.category] || []).forEach(push);
  return queries;
}

// Relevance guard: at least one keyword must appear in the candidate's
// title/categories before it is accepted.
function requiredKeywordsFor(product) {
  const id = product.id;
  if (id.startsWith("enc-")) return ["subwoofer", "enclosure", "box", "gehäuse"];
  if (id.startsWith("pa-")) return ["speaker", "lautsprecher", "enceinte", "box"];
  if (id.startsWith("acc-")) {
    if (["acc-001", "acc-002", "acc-003", "acc-004"].includes(id))
      return ["rca", "cable", "cinch", "wire", "kabel"];
    if (["acc-005", "acc-006"].includes(id))
      return ["fuse", "sicherung", "distribution", "block", "holder"];
    if (["acc-007", "acc-008", "acc-009"].includes(id))
      return ["wiring", "wire", "cable", "kit", "amp", "power"];
    return ["tweeter", "hochtöner", "speaker"];
  }
  switch (product.category) {
    case "subwoofers":
      return ["subwoofer", "sub-woofer", "bass speaker", "woofer"];
    case "amplifiers":
      return ["amplifier", "verstärker", "amp", "endstufe"];
    case "receivers":
      return ["stereo", "radio", "head unit", "receiver", "din", "deck", "autoradio", "player"];
    case "speakers":
      return ["speaker", "lautsprecher", "coaxial", "tweeter", "woofer", "enceinte"];
    default:
      return ["audio", "car"];
  }
}

// Hard rejections: words that signal a common Commons search trap.
const EXCLUDE_ALWAYS = [
  "portrait", "painting", "gemälde", "politician", "parliament",
  "speaker of", "schematic", "diagram", "logo", "icon",
];

function excludeKeywordsFor(product) {
  const id = product.id;
  if (id.startsWith("enc-"))
    return ["reflexrohr", "bassreflexrohr", "port tube", "rohr.jpg"];
  if (id.startsWith("pa-")) return ["portrait", "microphone", "mikrofon"];
  if (id.startsWith("acc-")) {
    if (["acc-005", "acc-006"].includes(id))
      return ["fuse wire", "domestic", "house", "lighting circuit"];
    if (["acc-007", "acc-008", "acc-009"].includes(id))
      return ["connector", "iso "];
    return [];
  }
  switch (product.category) {
    case "receivers":
      return ["connector", "cable", "wire", "adapter", "harness", "stecker", "kabel", "iso "];
    case "amplifiers":
      return ["circuit board", "pcb", "platine", "internals", "inside"];
    default:
      return [];
  }
}

function isRelevant(candidate, keywords, exclusions) {
  const hay = `${candidate.title || ""} ${candidate.tags || ""}`.toLowerCase();
  if (EXCLUDE_ALWAYS.some((k) => hay.includes(k))) return false;
  if ((exclusions || []).some((k) => hay.includes(k))) return false;
  return keywords.some((k) => hay.includes(k));
}

// ---------------------------------------------------------------------------
// Wikimedia Commons API
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastApiAt = 0;

async function commonsQuery(extraParams) {
  const wait = Math.max(0, lastApiAt + SEARCH_DELAY_MS - Date.now());
  if (wait) await sleep(wait);
  lastApiAt = Date.now();
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "600",
    ...extraParams,
  });
  let res;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status !== 429 && res.status !== 503) break;
    if (attempt === MAX_RETRIES) break;
    const backoff = 10000 * (attempt + 1); // 10s, 20s, 30s, 40s
    console.log(`  ! HTTP ${res.status}, retrying in ${backoff / 1000}s`);
    await sleep(backoff);
  }
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  lastApiAt = Date.now();
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});
  return pages
    .map((p) => {
      const info = p.imageinfo && p.imageinfo[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      return {
        id: `wm:${p.pageid}`,
        url: info.thumburl || info.url,
        title: (p.title || "").replace(/^File:/, ""),
        creator: (meta.Artist?.value || "unknown").replace(/<[^>]+>/g, "").trim(),
        license: meta.LicenseShortName?.value || "see source",
        licenseUrl: meta.LicenseUrl?.value || "",
        sourceUrl: info.descriptionurl || info.url,
        provider: "wikimedia",
        width: info.width || 0,
        height: info.height || 0,
        tags: (meta.Categories?.value || "").replace(/<[^>]+>/g, ""),
      };
    })
    .filter(Boolean)
    .filter((r) => /\.(jpe?g|png|webp)($|\?)/i.test(r.url))
    .filter((r) => !r.width || r.width >= 450)
    .filter((r) => {
      if (!r.width || !r.height) return true;
      const ar = r.width / r.height;
      return ar > 0.4 && ar < 2.6; // drop panoramas / extreme strips
    });
}

function searchCommons(query) {
  return commonsQuery({
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "30",
  });
}

function categoryCommons(category) {
  return commonsQuery({
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "file",
    gcmlimit: "100",
  });
}

// ---------------------------------------------------------------------------
// Download + process (same convention as tools/download-product-image.mjs)
// ---------------------------------------------------------------------------
function md5File(file) {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

function fetchAndProcess(candidate, productId) {
  const tmp = path.join(PRODUCTS_DIR, `_dl_${productId}`);
  const out = path.join(PRODUCTS_DIR, `${productId}.jpg`);
  try {
    execFileSync(
      "curl",
      ["-sfL", "--max-time", "45", "-A", USER_AGENT, "-o", tmp, candidate.url],
      { stdio: "pipe" },
    );
    execFileSync(
      "sips",
      [
        "-s", "format", "jpeg",
        "-s", "formatOptions", "75",
        "--resampleWidth", "300",
        tmp,
        "--out", out,
      ],
      { stdio: "pipe" },
    );
    const stat = fs.statSync(out);
    if (stat.size < 2500) throw new Error("suspiciously small output");
    return { hash: md5File(out), bytes: stat.size };
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
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

  const usedIds = new Set();
  const usedUrls = new Set();
  const usedHashes = new Set();
  for (const [pid, rec] of Object.entries(state.done)) {
    usedIds.add(rec.id);
    usedUrls.add(rec.url);
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
    const keywords = requiredKeywordsFor(product);
    const exclusions = excludeKeywordsFor(product);
    const chain = CATEGORY_CHAIN[chainKeyFor(product)] || [];
    let placed = false;

    const tryCandidates = (candidates) => {
      let tried = 0;
      for (const candidate of candidates) {
        if (tried >= 10) return false;
        if (usedIds.has(candidate.id) || usedUrls.has(candidate.url)) continue;
        if (!isRelevant(candidate, keywords, exclusions)) continue;
        tried++;
        try {
          const { hash, bytes } = fetchAndProcess(candidate, pid);
          if (usedHashes.has(hash)) continue;
          usedIds.add(candidate.id);
          usedUrls.add(candidate.url);
          usedHashes.add(hash);
          const record = {
            file: `assets/img/products/${pid}.jpg`,
            bytes,
            query: candidate._query || "",
            ...candidate,
          };
          state.done[pid] = record;
          delete state.failed[pid];
          attributions.images[pid] = record;
          fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
          console.log(
            `OK    ${pid}  <- "${candidate.title}" (${(bytes / 1024).toFixed(1)}KB)`,
          );
          return true;
        } catch (err) {
          console.log(`  ~ ${pid}: fetch failed (${err.message.slice(0, 50)})`);
        }
      }
      return false;
    };

    for (const query of queries) {
      let candidates = [];
      try {
        candidates = await searchCommons(query);
        candidates.forEach((c) => (c._query = query));
      } catch (err) {
        console.log(`  ! search "${query}": ${err.message}`);
      }
      if (tryCandidates(candidates)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      for (const category of chain) {
        let candidates = [];
        try {
          candidates = await categoryCommons(category);
          candidates.forEach((c) => (c._query = `category:${category}`));
        } catch (err) {
          console.log(`  ! category "${category}": ${err.message}`);
        }
        if (tryCandidates(candidates)) {
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      state.failed[pid] = "no unique candidate found";
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
