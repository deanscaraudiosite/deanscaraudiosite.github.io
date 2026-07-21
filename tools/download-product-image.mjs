#!/usr/bin/env node
/**
 * download-product-image.mjs
 * Downloads an image from a URL, resizes to max 300px wide, 
 * compresses to JPEG quality 75 (~20-30KB), and saves to assets/img/products/{sku}.jpg
 * 
 * Usage: node download-product-image.mjs <url> <sku>
 * Example: node download-product-image.mjs "https://example.com/image.jpg" "sub-004"
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRODUCTS_DIR = join(__dirname, '..', 'assets', 'img', 'products');

async function downloadAndOptimize(url, sku) {
  const outputPath = join(PRODUCTS_DIR, `${sku.toLowerCase()}.jpg`);
  const tempPath = join(PRODUCTS_DIR, `_temp_${sku.toLowerCase()}`);
  
  // Ensure output directory exists
  if (!existsSync(PRODUCTS_DIR)) {
    mkdirSync(PRODUCTS_DIR, { recursive: true });
  }
  
  try {
    // Download image
    console.log(`Downloading: ${url}`);
    execSync(`curl -sL -o "${tempPath}" "${url}"`, { timeout: 30000 });
    
    // Get image format and convert to JPEG if needed
    try {
      const formatInfo = execSync(`sips -g format "${tempPath}"`, { encoding: 'utf-8' });
      console.log(`  Format: ${formatInfo.trim().split('\n').pop()}`);
    } catch (e) {
      // sips might not recognize the format, try converting anyway
    }
    
    // Resize to max 300px wide and convert to JPEG
    execSync(`sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${tempPath}" --out "${outputPath}"`, { timeout: 15000 });
    
    // Clean up temp file
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    
    // Report file size
    const { statSync } = await import('fs');
    const stats = statSync(outputPath);
    console.log(`  Saved: ${outputPath} (${(stats.size / 1024).toFixed(1)}KB)`);
    
    return true;
  } catch (err) {
    console.error(`  Error processing ${sku}: ${err.message}`);
    // Clean up temp file on error
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    return false;
  }
}

// CLI usage
const [,, url, sku] = process.argv;
if (url && sku) {
  downloadAndOptimize(url, sku);
} else {
  console.log('Usage: node download-product-image.mjs <url> <sku>');
}

export { downloadAndOptimize };
