#!/usr/bin/env node
/**
 * update-catalog-images.mjs
 * Updates all imageUrl references in catalog-data.js to use per-product JPG images
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, '..', 'assets', 'js', 'commerce', 'catalog-data.js');

let content = readFileSync(catalogPath, 'utf-8');

// Map of SKU prefixes to their old category image filenames
const categoryMap = {
  'SUB': 'subwoofer.png',
  'AMP': 'amplifier.png',
  'HU': 'head_unit.png',
  'SPK': 'speakers.png',
  'ACC': 'installation.png',
  'ENC': 'enclosure.png',
  'PA': 'speakers.png',
};

// We need to find each variant block and update its imageUrl
// Pattern: sku: "XXX-NNN" followed by imageUrl: "assets/img/products/..."
// Strategy: find each sku line, extract the SKU, then replace the next imageUrl line

const lines = content.split('\n');
let changeCount = 0;

for (let i = 0; i < lines.length; i++) {
  const skuMatch = lines[i].match(/sku:\s*"([^"]+)"/);
  if (skuMatch) {
    const sku = skuMatch[1]; // e.g., "SUB-004"
    const skuLower = sku.toLowerCase(); // e.g., "sub-004"
    const newImageUrl = `assets/img/products/${skuLower}.jpg`;
    
    // Look ahead for the imageUrl line (usually within next 5 lines)
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      const imageMatch = lines[j].match(/^(\s*imageUrl:\s*)"[^"]*"(,?)$/);
      if (imageMatch) {
        const oldLine = lines[j];
        lines[j] = `${imageMatch[1]}"${newImageUrl}"${imageMatch[2]}`;
        if (oldLine !== lines[j]) {
          changeCount++;
          console.log(`  ${sku}: ${oldLine.trim()} -> imageUrl: "${newImageUrl}"`);
        }
        break;
      }
    }
  }
}

writeFileSync(catalogPath, lines.join('\n'), 'utf-8');
console.log(`\nDone! Updated ${changeCount} imageUrl references.`);
