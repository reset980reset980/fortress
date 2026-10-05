"""Reconcile only the fortress account route, preserving other Caddy config."""
import copy
import json
import time
import urllib.request

ROUTE = {'@id': 'fortress-account-route', 'match': [{'path': ['/api/account/*']}],
         'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:3196'}]}], 'terminal': True}

def add_route(config):
    modified = copy.deepcopy(config)
    found = False
    for server in modified.get('apps', {}).get('http', {}).get('servers', {}).values():
        for route in server.get('routes', []):
            hosts = [h for match in route.get('match', []) for h in match.get('host', [])]
            if 'fortress.xsw.kr' not in hosts:
                continue
            for handler in route.get('handle', []):
                if handler.get('handler') == 'subroute':
                    routes = handler.setdefault('routes', [])
                    if not any(r.get('@id') == ROUTE['@id'] for r in routes):
                        routes.insert(0, copy.deepcopy(ROUTE))
                    found = True
    if not found:
        raise RuntimeError('Expected fortress host route was not found')
    return modified

def reconcile():
    url = 'http://127.0.0.1:2019/config/'
    with urllib.request.urlopen(url, timeout=5) as response:
        config = json.load(response)
        etag = response.headers['Etag']
    updated = add_route(config)
    if updated != config:
        request = urllib.request.Request(url, data=json.dumps(updated).encode(), method='POST',
                                         headers={'Content-Type': 'application/json', 'If-Match': etag})
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()

def maintain_route():
    # Caddyfile remains untouched. Reinstall the additive route after a Caddy restart.
    while True:
        try:
            reconcile()
        except Exception:
            print('Account proxy reconciliation will retry', flush=True)
        time.sleep(15)

if __name__ == '__main__':
    reconcile()
