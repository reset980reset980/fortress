#!/usr/bin/env bash
set -euo pipefail
# Run on the mini PC. Updates static files only; preserves backend/database/config.
if [[ $# -ne 1 || ! -d "$1" ]]; then
  echo 'Usage: bash tools/deploy.sh /absolute/path/to/current/static/webroot' >&2
  exit 2
fi
webroot=$(realpath -- "$1")
source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ "$webroot" == / || "$webroot" == "$source_root" ]]; then
  echo 'Refusing unsafe or source directory target.' >&2
  exit 2
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$(dirname -- "$webroot")/fortress-backups"
mkdir -p -- "$backup_dir"
archive="$backup_dir/fortress-$stamp.tar.gz"
tar -czf "$archive" -C "$webroot" .
tar -tzf "$archive" >/dev/null
sha256sum "$archive" > "$archive.sha256"
for dir in src assets maps sprites audio; do
  if [[ -d "$source_root/$dir" ]]; then mkdir -p -- "$webroot/$dir"; cp -a -- "$source_root/$dir/." "$webroot/$dir/"; fi
done
for dir in src assets maps sprites audio; do
  if [[ -d "$webroot/$dir" ]]; then find "$webroot/$dir" -type d -exec chmod 755 {} +; find "$webroot/$dir" -type f -exec chmod 644 {} +; fi
done
for file in original.html manifest.json sw.js; do
  if [[ -f "$source_root/$file" ]]; then cp -- "$source_root/$file" "$webroot/$file"; fi
done
cp -- "$source_root/index.html" "$webroot/.fortress-index-$stamp.tmp"
mv -- "$webroot/.fortress-index-$stamp.tmp" "$webroot/index.html"
chmod 644 "$webroot/index.html" "$webroot/original.html" "$webroot/manifest.json" "$webroot/sw.js"
echo "Static upgrade complete. Full previous static build: $archive"
echo 'Backend was left running. Verify / and /original.html via the existing domain.'
