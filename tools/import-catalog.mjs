#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  catalogCounts,
  validateCatalog,
  validateCatalogSchema,
} from "./lib/commerce-validation.mjs";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? "" : args[index + 1] || "";
};
const inputPath = valueFor("--input");
const outputPath = valueFor("--output");
const write = args.includes("--write");
const allowDemo = args.includes("--allow-demo");

if (!inputPath) {
  console.error(
    "Usage: node tools/import-catalog.mjs --input release.json [--output assets/js/commerce/catalog-data.js --write] [--allow-demo]",
  );
  process.exit(2);
}

const raw = await fs.readFile(path.resolve(inputPath), "utf8");
const release = JSON.parse(raw);
const errors = [
  ...(await validateCatalogSchema(release)),
  ...validateCatalog(release),
];
if (release.classification === "demo" && !allowDemo) {
  errors.push("Demo data cannot be imported without the explicit --allow-demo flag.");
}
if (errors.length) {
  console.error(`Catalog import rejected with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const canonical = `${JSON.stringify(release, null, 2)}\n`;
const sha256 = crypto.createHash("sha256").update(canonical).digest("hex");
const counts = catalogCounts(release);
console.log(`Release: ${release.releaseId}`);
console.log(`Classification: ${release.classification}`);
console.log(`Products: ${counts.products}; SKUs: ${counts.variants}`);
console.log(`SHA-256: ${sha256}`);

if (!write) {
  console.log("Dry run only. Add --write and --output after reviewing this report.");
  process.exit(0);
}
if (!outputPath) {
  console.error("--output is required with --write.");
  process.exit(2);
}

const output = path.resolve(outputPath);
const temporary = `${output}.tmp-${process.pid}`;
const browserFile = `(function () {\n  \"use strict\";\n  window.DCA_CATALOG_DATA = Object.freeze(${JSON.stringify(release, null, 2)});\n})();\n`;
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(temporary, browserFile, { encoding: "utf8", mode: 0o644 });
await fs.rename(temporary, output);
console.log(`Wrote validated browser projection: ${output}`);
