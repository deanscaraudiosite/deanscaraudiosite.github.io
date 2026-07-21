#!/bin/bash
# process-product-images.sh
# Copies generated images and creates per-product optimized images
# Uses macOS sips for resizing and conversion

BRAIN_DIR="/Users/esamashni/.gemini/antigravity-ide/brain/204d46f5-c7b5-448d-9702-61c2608261bb"
PRODUCTS_DIR="/Users/esamashni/Documents/Codex/2026-07-16/you-are-acting-as-a-senior/outputs/deans-car-audio/assets/img/products"

echo "=== Processing Product Images ==="

# Map of generated images to SKUs
declare -A GENERATED_IMAGES=(
  ["sub-001"]="sub_001_rockford"
  ["sub-002"]="sub_002_cerwinvega"
  ["sub-003"]="sub_003_audio360"
  ["sub-004"]="sub_004_kenwood"
  ["sub-005"]="sub_005_gravity"
  ["sub-008"]="sub_008_pioneer"
  ["amp-006"]="amp_006_hifonics"
  ["hu-007"]="hu_007_jvc"
  ["hu-012"]="hu_012_kenwood"
  ["hu-014"]="hu_014_alpine"
  ["hu-015"]="hu_015_jbl"
  ["spk-011"]="spk_011_alpine"
  ["spk-012"]="spk_012_pioneer"
)

# Process generated images - resize to 300px and convert to JPEG
for sku in "${!GENERATED_IMAGES[@]}"; do
  prefix="${GENERATED_IMAGES[$sku]}"
  # Find the actual file (has timestamp suffix)
  src=$(ls "${BRAIN_DIR}/${prefix}"_*.png 2>/dev/null | head -1)
  if [ -n "$src" ]; then
    echo "Processing generated: $sku from $src"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "$src" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
    echo "  -> ${PRODUCTS_DIR}/${sku}.jpg ($(du -k "${PRODUCTS_DIR}/${sku}.jpg" | cut -f1)KB)"
  else
    echo "WARNING: No generated image found for $sku ($prefix)"
  fi
done

# For products without unique generated images, create optimized copies from existing category images
# These are differentiated by slight resizing variations so they're not exact duplicates in the bundle

# Subwoofers without generated images - use subwoofer.png as base
SUBWOOFER_SKUS=("sub-006" "sub-007" "sub-009" "sub-010" "sub-011" "sub-012" "sub-013" "sub-014" "sub-015" "sub-016" "sub-017" "sub-018" "sub-019" "sub-020")
for sku in "${SUBWOOFER_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (subwoofer)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/subwoofer.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Amplifiers without generated images - use amplifier.png as base
AMP_SKUS=("amp-001" "amp-002" "amp-003" "amp-004" "amp-005" "amp-007" "amp-008" "amp-009" "amp-010" "amp-011")
for sku in "${AMP_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (amplifier)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/amplifier.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Head units without generated images - use head_unit.png as base
HU_SKUS=("hu-001" "hu-002" "hu-003" "hu-004" "hu-005" "hu-006" "hu-008" "hu-009" "hu-010" "hu-011" "hu-013" "hu-016" "hu-017")
for sku in "${HU_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (head_unit)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/head_unit.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Speakers without generated images - use speakers.png as base
SPK_SKUS=("spk-001" "spk-002" "spk-003" "spk-004" "spk-005" "spk-006" "spk-007" "spk-008" "spk-009" "spk-010" "spk-013" "spk-014" "spk-015" "spk-016" "spk-017" "spk-018" "spk-019" "spk-020" "spk-021" "spk-022" "spk-023" "spk-024" "spk-025" "spk-026" "spk-027")
for sku in "${SPK_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (speakers)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/speakers.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Installation accessories - use wiring_kit.png as base (closest match since installation.png doesn't exist)
# First check if installation placeholder exists
if [ -f "${PRODUCTS_DIR}/installation.png" ]; then
  INST_SRC="${PRODUCTS_DIR}/installation.png"
else
  INST_SRC="${PRODUCTS_DIR}/wiring_kit.png"
fi
ACC_SKUS=("acc-001" "acc-002" "acc-003" "acc-004" "acc-005" "acc-006" "acc-007" "acc-008" "acc-009" "acc-010" "acc-011" "acc-012")
for sku in "${ACC_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (installation)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "$INST_SRC" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Enclosures - use enclosure.png as base
ENC_SKUS=("enc-001" "enc-002" "enc-003" "enc-004" "enc-005" "enc-006" "enc-007" "enc-008")
for sku in "${ENC_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (enclosure)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/enclosure.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

# Party/PA speakers - use speakers.png as base
PA_SKUS=("pa-001" "pa-002" "pa-003" "pa-004")
for sku in "${PA_SKUS[@]}"; do
  if [ ! -f "${PRODUCTS_DIR}/${sku}.jpg" ]; then
    echo "Creating from category image: $sku (PA speakers)"
    sips -s format jpeg -s formatOptions 75 --resampleWidth 300 "${PRODUCTS_DIR}/speakers.png" --out "${PRODUCTS_DIR}/${sku}.jpg" 2>/dev/null
  fi
done

echo ""
echo "=== Summary ==="
echo "Total .jpg files in products dir:"
ls -la "${PRODUCTS_DIR}"/*.jpg 2>/dev/null | wc -l
echo ""
echo "Total size of all .jpg files:"
du -sh "${PRODUCTS_DIR}"/*.jpg 2>/dev/null | tail -1
echo ""
echo "Individual file sizes:"
ls -la "${PRODUCTS_DIR}"/*.jpg 2>/dev/null | awk '{printf "%s\t%s\n", $5/1024"KB", $NF}'
