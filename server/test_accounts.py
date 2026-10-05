import http.cookiejar
from email import policy
from email.parser import BytesParser
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from accounts import Store, make_server
from account_routes import add_route, ROUTE

class AccountTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name, 'accounts.db'))
        self.server = make_server(self.store, 0, False, ['http://localhost:4174'], Path(self.temp.name, 'mail'))
        self.base = 'http://127.0.0.1:' + str(self.server.server_port) + '/api/account/'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.clients = [urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())) for _ in range(2)]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def call(self, action, data=None, client=0, origin='http://localhost:4174'):
        request = urllib.request.Request(self.base + action, data=None if data is None else json.dumps(data).encode(),
                                         headers={'Origin': origin, 'Content-Type': 'application/json'})
        try:
            response = self.clients[client].open(request)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.load(response), response.headers

    def register(self, uid='tester', client=0):
        return self.call('register', {'id': uid, 'password': 'test-secret-980!', 'confirm': 'test-secret-980!',
                                     'nickname': '시험기체', 'email': uid + '@example.test', 'keep': True}, client)

    def test_sessions_isolation_revision_and_seed(self):
        self.assertTrue(self.store.seed_admin('seed-test-secret'))
        self.assertFalse(self.store.seed_admin('a-different-secret'))
        code, data, headers = self.register()
        self.assertEqual(code, 200)
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('Max-Age=2592000', headers['Set-Cookie'])
        self.assertNotIn('password', data['user'])
        data['profile']['credits'] = 900
        self.assertEqual(self.call('profile', {'profile': data['profile'], 'revision': 0})[0], 200)
        self.assertEqual(self.call('profile', {'profile': data['profile'], 'revision': 0})[0], 409)
        self.assertEqual(self.register('other', 1)[1]['profile']['credits'], 0)
        self.assertEqual(self.call('me')[1]['profile']['credits'], 900)
        self.call('logout', {})
        self.assertEqual(self.call('me')[0], 401)
        self.assertEqual(self.call('login', {'id': 'admin', 'password': 'seed-test-secret'})[1]['profile']['credits'], 1000000)
        self.assertEqual(self.call('me')[1]['user']['role'], 'admin')
        with self.store.connect() as db:
            stored = db.execute("SELECT password FROM users WHERE id='admin'").fetchone()[0]
            self.assertNotIn('seed-test-secret', stored)

    def test_reset_single_use_revokes_sessions_and_masks_unknown_email(self):
        self.register()
        self.assertEqual(self.call('forgot', {'email': 'tester@example.test'})[0], 200)
        mail = BytesParser(policy=policy.default).parsebytes(next(Path(self.temp.name, 'mail').glob('*.eml')).read_bytes()).get_content()
        token = mail.split('#reset=')[1].split()[0]
        payload = {'token': token, 'password': 'replacement-980!', 'confirm': 'replacement-980!'}
        self.assertEqual(self.call('reset', payload)[0], 200)
        self.assertEqual(self.call('me')[0], 401)
        self.assertEqual(self.call('reset', payload)[0], 400)
        self.assertEqual(self.call('login', {'id': 'tester', 'password': 'test-secret-980!'})[0], 401)
        self.assertEqual(self.call('login', {'id': 'tester', 'password': 'replacement-980!'})[0], 200)
        self.assertEqual(self.call('forgot', {'email': 'unknown@example.test'})[1]['message'],
                         self.call('forgot', {'email': 'tester@example.test'})[1]['message'])

    def test_origin_validation_registration_expiry_and_limits(self):
        self.assertEqual(self.call('login', {}, origin='https://evil.example')[0], 403)
        self.assertEqual(self.call('register', {'id': 'admin', 'password': 'password980', 'confirm': 'password980', 'nickname': '관리자', 'email': 'x@example.test'})[0], 409)
        self.register()
        self.assertEqual(self.register()[0], 409)
        self.assertEqual(self.call('login', {'id': "x' OR '1'='1", 'password': 'password980'})[0], 400)
        with self.store.connect() as db:
            db.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.call('me')[0], 401)
        self.assertTrue(self.store.limit('test-limit', 1))
        self.assertFalse(self.store.limit('test-limit', 1))

    def test_account_proxy_route_is_additive_idempotent_and_host_scoped(self):
        original = {'apps': {'http': {'servers': {'a': {'routes': [
            {'match': [{'host': ['unrelated.test']}], 'handle': [{'handler': 'subroute', 'routes': [{'x': 1}]}]},
            {'match': [{'host': ['fortress.xsw.kr', 'portress.xsw.kr']}], 'handle': [{'handler': 'subroute', 'routes': [{'old-api': 1}, {'static': 2}]}]}
        ]}}}}}
        patched = add_route(original)
        self.assertEqual(add_route(patched), patched)
        routes = patched['apps']['http']['servers']['a']['routes']
        self.assertEqual(routes[0], original['apps']['http']['servers']['a']['routes'][0])
        self.assertEqual(routes[1]['handle'][0]['routes'], [ROUTE, {'old-api': 1}, {'static': 2}])

if __name__ == '__main__':
    unittest.main()
