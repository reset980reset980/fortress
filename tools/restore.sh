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
# This accepts only relative members without traversal and no symlink/hardlink entries.
python3 - "$archive" <<'PY'
import sys,tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1]) as t:
 for m in t.getmembers():
  if m.name.startswith('/') or '..' in PurePosixPath(m.name).parts or m.issym() or m.islnk():
   raise SystemExit('Unsafe backup member: '+m.name)
PY
tar -xzf "$archive" -C "$webroot"
echo 'Previous static build restored. Extra new assets are harmless and were retained.'
