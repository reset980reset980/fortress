#!/usr/bin/env python3
"""Back up only public asset paths named by the original Fortress client.

Downloads are bounded to eight workers. MP3 is preferred; OGG is fetched only
when the corresponding MP3 cannot be fetched. Environment proxy settings are
preserved. No private endpoint or discovery scan is performed.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError
import hashlib
import json
import time

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = json.loads((ROOT / 'research/asset-inventory.json').read_text())
ORIGIN = INVENTORY['baseUrl']
DESTINATION = ROOT / 'original'


def download(path):
    target = DESTINATION / path.lstrip('/')
    if target.exists() and target.stat().st_size > 0:
        data = target.read_bytes()
        return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'status': 'existing'}
    last_error = ''
    for attempt in range(3):
        try:
            request = Request(ORIGIN + path, headers={'User-Agent': 'Fortress-Public-Asset-Backup/1.0'})
            with urlopen(request, timeout=40) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', '')
                if not data or 'text/html' in content_type:
                    raise ValueError(f'Unexpected public asset body: {content_type}')
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + '.partial')
            temporary.write_bytes(data)
            temporary.replace(target)
            return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'status': 'downloaded'}
        except (URLError, ValueError, TimeoutError, OSError) as error:
            last_error = str(error)
            if '404' in last_error:
                break
            time.sleep(.35 * (attempt + 1))
    return {'path': path, 'status': 'failed', 'error': last_error}


def batch(paths):
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download, path): path for path in paths}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if result['status'] == 'failed':
                print(f"FAIL {result['path']}: {result['error']}", flush=True)
            elif len(results) % 40 == 0:
                print(f'{len(results)}/{len(paths)} assets backed up', flush=True)
    return results


if __name__ == '__main__':
    groups = INVENTORY['paths']
    primary = [path for group, paths in groups.items() if group != 'audio_fallback' for path in paths]
    results = batch(primary)
    fallback = [result['path'][:-4] + '.ogg' for result in results
                if result['status'] == 'failed' and result['path'].endswith('.mp3')]
    if fallback:
        results += batch(fallback)
    backed_up = [result for result in results if result['status'] != 'failed']
    failures = [result for result in results if result['status'] == 'failed'
                and not (result['path'].endswith('.mp3') and any(
                    candidate['path'] == result['path'][:-4] + '.ogg' for candidate in backed_up))]
    report = {'origin': ORIGIN, 'assetCount': len(backed_up),
              'totalBytes': sum(result.get('bytes', 0) for result in backed_up),
              'failures': failures, 'results': sorted(results, key=lambda item: item['path'])}
    (ROOT / 'research/public-asset-backup.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['assetCount', 'totalBytes', 'failures']}, indent=2), flush=True)
    raise SystemExit(1 if failures else 0)
