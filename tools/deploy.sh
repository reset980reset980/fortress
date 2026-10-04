#!/usr/bin/env bash
set -euo pipefail
# Run on the mini PC. Updates static files only; preserves backend/database/config.
if [[ $# -ne 1 || ! -d "$1" ]]; then
  echo 'Usage: bash tools/deploy.sh /absolute/path/to/current/static/webroot' >&2
  exit 2
fi
webroot=$(realpath -- "$1")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=$(dirname -- "$script_dir")
if [[ "$webroot" == / || "$webroot/" == "$source_root/"* || "$source_root/" == "$webroot/"* ]]; then
  echo 'Refusing unsafe or source directory target.' >&2
  exit 2
fi
if [[ ! -f "$webroot/index.html" ]]; then
  echo 'Target must be the existing public static root containing index.html.' >&2
  exit 2
fi
command -v python3 >/dev/null
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$(dirname -- "$webroot")/fortress-backups"
mkdir -p -- "$backup_dir"
archive=$(mktemp "$backup_dir/fortress-$stamp-XXXXXX.tar.gz")
tar --hard-dereference -czf "$archive" -C "$webroot" .
tar -tzf "$archive" >/dev/null
python3 "$script_dir/validate_backup.py" "$archive"
(cd -- "$backup_dir" && sha256sum "$(basename -- "$archive")" > "$(basename -- "$archive").sha256")
for dir in src assets maps sprites audio; do
  if [[ -d "$source_root/$dir" ]]; then mkdir -p -- "$webroot/$dir"; cp -a -- "$source_root/$dir/." "$webroot/$dir/"; fi
done
for dir in src assets maps sprites audio; do
  if [[ -d "$source_root/$dir" ]]; then
    while IFS= read -r -d '' source_path; do
      chmod 755 "$webroot/${source_path#"$source_root/"}"
    done < <(find "$source_root/$dir" -type d -print0)
    while IFS= read -r -d '' source_path; do
      chmod 644 "$webroot/${source_path#"$source_root/"}"
    done < <(find "$source_root/$dir" -type f -print0)
  fi
done
for file in original.html manifest.json sw.js; do
  if [[ -f "$source_root/$file" ]]; then cp -- "$source_root/$file" "$webroot/$file"; fi
done
index_tmp=$(mktemp "$webroot/.fortress-index-XXXXXX.tmp")
cp -- "$source_root/index.html" "$index_tmp"
chmod 644 "$index_tmp"
mv -- "$index_tmp" "$webroot/index.html"
chmod 644 "$webroot/index.html" "$webroot/original.html" "$webroot/manifest.json" "$webroot/sw.js"
echo "Static upgrade complete. Full previous static build: $archive"
echo 'Backend was left running. Verify / and /original.html via the existing domain.'
