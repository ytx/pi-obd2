#!/bin/bash
#
# MapLibre + PMTiles test setup for Raspberry Pi 4
#
# Usage:
#   1. Run this script to download pmtiles CLI and extract Tokyo test data
#   2. Start HTTP server: cd scripts && python3 -m http.server 8080
#   3. Open in Chromium: http://localhost:8080/map-test.html
#
# Check these things on RPi4:
#   - FPS during pan/zoom/rotate (target: 20+ FPS)
#   - Light/Dark theme switch
#   - Auto Rotate smoothness
#   - Memory usage (check with: watch -n1 free -m)
#

set -e
cd "$(dirname "$0")"

# --- Install pmtiles CLI ---
PMTILES_VERSION="1.30.1"
PMTILES_BIN="./pmtiles"

if [ ! -f "$PMTILES_BIN" ]; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64) PLATFORM="Linux_arm64" ;;
    x86_64)  PLATFORM="Linux_x86_64" ;;
    arm*)    PLATFORM="Linux_arm64" ;;  # RPi4 64-bit
    *)       echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac

  echo "Downloading pmtiles CLI v${PMTILES_VERSION} (${PLATFORM})..."
  curl -L "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_${PLATFORM}.tar.gz" -o pmtiles.tar.gz
  tar xzf pmtiles.tar.gz pmtiles
  rm pmtiles.tar.gz
  chmod +x pmtiles
  echo "pmtiles CLI installed: $(./pmtiles --version 2>&1 || echo 'ok')"
else
  echo "pmtiles CLI already exists"
fi

# --- Extract Tokyo area PMTiles ---
# Uses HTTP range requests - does NOT download the entire planet file
# Protomaps daily build (~120GB planet, but we only fetch needed byte ranges)

PMTILES_FILE="tokyo.pmtiles"
if [ ! -f "$PMTILES_FILE" ]; then
  echo ""
  echo "Extracting Tokyo area tiles..."
  echo "  bbox: 139.4,35.5,140.1,35.9 (approx 70x45km)"
  echo "  maxzoom: 14"
  echo "  This may take a few minutes (HTTP range requests to remote server)"
  echo ""

  # Find latest build date (try today, yesterday, etc.)
  BUILD_URL=""
  for DAYS_AGO in 0 1 2 3 4 5 6 7; do
    DATE=$(date -d "-${DAYS_AGO} days" +%Y%m%d 2>/dev/null || date -v-${DAYS_AGO}d +%Y%m%d 2>/dev/null)
    URL="https://build.protomaps.com/${DATE}.pmtiles"
    echo "Trying build: $DATE"
    if curl -s --head "$URL" | grep -q "200\|206"; then
      BUILD_URL="$URL"
      echo "Found: $BUILD_URL"
      break
    fi
  done

  if [ -z "$BUILD_URL" ]; then
    echo "ERROR: Could not find a recent Protomaps build."
    echo "Check https://maps.protomaps.com/builds/ for available dates."
    echo "Then run manually:"
    echo "  ./pmtiles extract <URL> tokyo.pmtiles --bbox=139.4,35.5,140.1,35.9 --maxzoom=14"
    exit 1
  fi

  "$PMTILES_BIN" extract "$BUILD_URL" "$PMTILES_FILE" \
    --bbox=139.4,35.5,140.1,35.9 \
    --maxzoom=14

  echo ""
  echo "Done! File size: $(du -h "$PMTILES_FILE" | cut -f1)"
else
  echo "tokyo.pmtiles already exists ($(du -h "$PMTILES_FILE" | cut -f1))"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "To test:"
echo "  cd scripts"
echo "  python3 -m http.server 8080"
echo "  # Open Chromium: http://localhost:8080/map-test.html"
echo ""
echo "To extract a different region:"
echo "  ./pmtiles extract <BUILD_URL> output.pmtiles --bbox=WEST,SOUTH,EAST,NORTH --maxzoom=14"
echo "  # Use https://bboxfinder.com to find bbox coordinates"
