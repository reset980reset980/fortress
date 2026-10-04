#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 || ! -f "$1" || ! -d "$2" ]]; then
  echo 'Usage: bash tools/restore.sh /path/to/fortress-backup.tar.gz /path/to/static/webroot' >&2
  exit 2
fi
archive=$(realpath -- "$1")
webroot=$(realpath -- "$2")
if [[ "$webroot" == / ]]; then exit 2; fi
if [[ -f "$archive.sha256" ]]; then (cd -- "$(dirname -- "$archive")" && sha256sum -c "$(basename -- "$archive.sha256")"); fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 "$script_dir/validate_backup.py" "$archive"
tar -xzf "$archive" -C "$webroot"
echo 'Previous static build restored. Extra new assets are harmless and were retained.'
