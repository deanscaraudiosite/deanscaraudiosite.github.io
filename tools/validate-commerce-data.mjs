#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogCounts,
  loadBrowserDataFile,
  validateCatalog,
  validateCatalogSchema,
  validateFitment,
  validateFitmentSchema,
} from "./lib/commerce-validation.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const catalogPath = path.join(root, "assets/js/commerce/catalog-data.js");
const fitmentPath = path.join(root, "assets/js/commerce/fitment-data.js");

const catalog = await loadBrowserDataFile(catalogPath, "DCA_CATALOG_DATA");
const fitment = await loadBrowserDataFile(fitmentPath, "DCA_FITMENT_DATA");
const errors = [
  ...(await validateCatalogSchema(catalog)),
  ...validateCatalog(catalog),
  ...(await validateFitmentSchema(fitment)),
  ...validateFitment(fitment, catalog),
];

if (errors.length) {
  console.error(`Commerce data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const counts = catalogCounts(catalog);
  const decisions = fitment.rules.reduce(
    (result, rule) => {
      result[rule.decision] += 1;
      return result;
    },
    { compatible: 0, conditional: 0, incompatible: 0 },
  );
  console.log("Commerce data validation passed.");
  console.log(`Catalog: ${counts.products} product families, ${counts.variants} SKUs.`);
  console.log(`Pricing: ${counts.pricedVariants} priced, ${counts.quoteVariants} price-on-request.`);
  console.log(
    `Fitment rules: ${decisions.compatible} compatible, ${decisions.conditional} conditional, ${decisions.incompatible} incompatible.`,
  );
  console.log(`No-match policy: ${fitment.absencePolicy}. Coverage: ${fitment.coverage}.`);
}
