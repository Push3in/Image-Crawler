#!/bin/sh
# Registers the Atlas bridge with your Chromium-based browsers (Chrome, Dia,
# Arc, Brave, Edge…) so Image Crawler can send images to Atlas.
# Run once:  sh atlas-bridge/install.sh
# Store copy: sh atlas-bridge/install.sh --id <extension id from the store>
# Undo with: sh atlas-bridge/install.sh --uninstall
# Run it again after loading the extension in a new browser, or after
# regenerating the Atlas key.
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
# Installed outside ~/Documents: macOS blocks programs a browser starts from
# reading protected folders (Documents, Desktop, iCloud Drive) by default.
APP="$HOME/Library/Application Support/ImageCrawlerAtlas"
LAUNCHER="$APP/atlas_bridge.command"
LOG="$HOME/Library/Logs/ImageCrawler-Atlas.log"

PYTHON="$(command -v python3 || true)"
if [ -z "$PYTHON" ]; then
  echo "python3 not found. Install it (xcode-select --install) and run this again." >&2
  exit 1
fi

if [ "$1" = "--uninstall" ]; then
  "$PYTHON" -I -B "$SRC/install_hosts.py" "$LAUNCHER" --uninstall
  rm -rf "$APP"
  rm -f "$SRC/atlas_bridge.command" # from older versions
  echo "Removed the Atlas bridge."
  exit 0
fi

mkdir -p "$APP"
cp "$SRC/atlas_bridge.py" "$APP/atlas_bridge.py"
rm -f "$SRC/atlas_bridge.command" # older versions ran it from here

# Browsers start hosts with a minimal environment, so pin the python path.
# Startup and any crash output go to the log.
cat > "$LAUNCHER" <<EOF
#!/bin/sh
echo "\$(date '+%Y-%m-%d %H:%M:%S')  launcher started" >> "$LOG"
exec "$PYTHON" -I -B "$APP/atlas_bridge.py" 2>> "$LOG"
EOF
chmod +x "$LAUNCHER"

# Backup copy of the Atlas key, readable only by you, for when the browser
# isn't allowed to read the library in iCloud Drive.
"$PYTHON" -I -B "$APP/atlas_bridge.py" --cache-token

"$PYTHON" -I -B "$SRC/install_hosts.py" "$LAUNCHER" "$@"
echo "Done. Try Add to Atlas (reload Image Crawler first if you just changed it)."
