#!/bin/sh
# One-line setup for Add to Atlas, for people who installed Image Grab from
# the store and don't have this folder:
#   curl -fsSL https://raw.githubusercontent.com/Push3in/Image-Grab/main/atlas-bridge/get.sh | sh
# Remove again with:
#   curl -fsSL https://raw.githubusercontent.com/Push3in/Image-Grab/main/atlas-bridge/get.sh | sh -s -- --uninstall
# Downloads the helper files to a temporary folder and runs install.sh from there.
set -e

BASE="https://raw.githubusercontent.com/Push3in/Image-Grab/main/atlas-bridge"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the Atlas helper…"
for f in install.sh install_hosts.py atlas_bridge.py; do
  curl -fsSL "$BASE/$f" -o "$TMP/$f"
done

sh "$TMP/install.sh" "$@"
