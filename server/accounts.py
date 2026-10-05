"""Separate loopback account service; persistent SQLite, no third-party runtime."""
import argparse
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import smtplib
import ssl
import subprocess
import threading
import time
from email.message import EmailMessage
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

SCHEMA = json.loads(Path(__file__).with_name('game-schema.json').read_text())
TANKS, MISSIONS = SCHEMA['tanks'], SCHEMA['missions']
PARTS = ['hull', 'attack', 'fuel', 'ammo', 'repair', 'shield']

def number(value, maximum):
    try:
        return max(0, min(maximum, int(value))) if not isinstance(value, bool) else 0
    except (ValueError, TypeError, OverflowError):
        return 0

def clean_profile(value):
    if not isinstance(value, dict) or value.get('version') != 2:
        raise ValueError('호환되는 진행 기록이 아닙니다.')
    collection = list(dict.fromkeys(TANKS[:4] + [t for t in value.get('collection', []) if t in TANKS]))
    tank = value.get('tank') if value.get('tank') in collection else TANKS[0]
    progress = {}
    by_tank = value.get('tankProgress')
    for tid in TANKS:
        raw = (by_tank.get(tid, {}) if isinstance(by_tank, dict) else value if tid == tank else {})
        if not isinstance(raw, dict):
            raw = {}
        levels = raw.get('upgrades') if isinstance(raw.get('upgrades'), dict) else {}
        upgrades = {part: number(levels.get(part), 5) for part in PARTS}
        progress[tid] = {'upgrades': upgrades, 'visualFloor': number(raw.get('visualFloor', max(upgrades.values())), 5)}
    missions = value.get('missions') if isinstance(value.get('missions'), dict) else {}
    mastery = value.get('mastery') if isinstance(value.get('mastery'), dict) else {}
    return {'version': 2, 'credits': number(value.get('credits'), 1000000000), 'tank': tank,
            'collection': collection, 'missions': {m: number(missions[m], 3) for m in MISSIONS if number(missions.get(m), 3)},
            'mastery': {t: number(mastery[t], 100000) for t in TANKS if number(mastery.get(t), 100000)},
            'tankProgress': progress, **progress[tank]}

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    result = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32)
    return salt + ':' + result.hex()

def password_matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, nickname TEXT NOT NULL,
              email TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player',
              profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email != '';
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
              expires INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, start INTEGER NOT NULL);
            ''')
        if os.name != 'nt':
            os.chmod(self.path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def seed_admin(self, password, email=''):
        with self.connect() as db:
            if db.execute("SELECT id FROM users WHERE id='admin'").fetchone():
                return False
            profile = clean_profile({'version': 2, 'credits': 1000000})
            db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)',
                       ('admin', '관리자', email.lower(), password_hash(password), 'admin', json.dumps(profile), 0, int(time.time())))
        return True

    def limit(self, key, maximum=10, window=900):
        now = int(time.time())
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM limits WHERE key=?', (key,)).fetchone()
            count = row['count'] + 1 if row and now - row['start'] < window else 1
            start = row['start'] if row and now - row['start'] < window else now
            db.execute('INSERT OR REPLACE INTO limits VALUES(?,?,?)', (key, count, start))
            db.execute('DELETE FROM limits WHERE start<?', (now - 86400,))
        return count <= maximum

class Handler(BaseHTTPRequestHandler):
    server_version = 'FortressAccounts'
    def log_message(self, *args):
        pass  # Credentials, session cookies and reset tokens never enter access logs.

    def reply(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def cookie(self, token='', keep=False):
        suffix = '; Secure' if self.server.secure else ''
        lifetime = '; Max-Age=2592000' if keep else ''
        if not token:
            lifetime = '; Max-Age=0'
        return f'fortress_session={token}; Path=/api/account; HttpOnly; SameSite=Strict{suffix}{lifetime}'

    def user(self, db):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            token = cookies['fortress_session'].value
        except (KeyError, ValueError):
            return None
        return db.execute('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?',
                          (digest(token), int(time.time()))).fetchone()

    def payload(self, user):
        return {'user': {k: user[k] for k in ['id', 'nickname', 'email', 'role']},
                'profile': json.loads(user['profile']), 'revision': user['revision'], 'mailAvailable': self.server.mail_available}

    def do_GET(self):
        if urlparse(self.path).path == '/api/account/health':
            self.reply(200, {'ok': True, 'mailAvailable': self.server.mail_available})
            return
        if urlparse(self.path).path != '/api/account/me':
            return self.reply(404, {'error': '찾을 수 없는 계정 요청입니다.'})
        with self.server.store.connect() as db:
            user = self.user(db)
            self.reply(200, self.payload(user)) if user else self.reply(401, {'error': '로그인이 필요합니다.'})

    def do_POST(self):
        try:
            if self.headers.get('Origin') not in self.server.origins:
                return self.reply(403, {'error': '허용되지 않은 요청입니다.'})
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 100000:
                return self.reply(413, {'error': '요청 크기가 올바르지 않습니다.'})
            if not self.headers.get('Content-Type', '').startswith('application/json'):
                return self.reply(415, {'error': 'JSON 요청이 필요합니다.'})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('요청 형식이 올바르지 않습니다.')
            action = urlparse(self.path).path.removeprefix('/api/account/')
            ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[-1].strip()
            if action in ['login', 'register', 'forgot', 'reset']:
                maximum = 30 if action == 'login' else 8
                if not self.server.store.limit(action + ':' + digest(ip), maximum):
                    return self.reply(429, {'error': '요청이 많습니다. 잠시 후 다시 시도하세요.'})
            with self.server.store.connect() as db:
                if action in ['register', 'login']:
                    uid = str(body.get('id', '')).strip().lower()
                    password = body.get('password')
                    if not re.fullmatch(r'[a-z0-9_.-]{3,24}', uid) or not isinstance(password, str) or not 8 <= len(password) <= 128:
                        raise ValueError('아이디는 영문·숫자 3~24자, 비밀번호는 8~128자로 입력하세요.')
                    if action == 'register':
                        if password != body.get('confirm'):
                            raise ValueError('비밀번호 확인이 일치하지 않습니다.')
                        nickname = str(body.get('nickname', '')).strip()
                        email = str(body.get('email', '')).strip().lower()
                        if not 2 <= len(nickname) <= 24 or not valid_email(email):
                            raise ValueError('닉네임 2~24자와 올바른 이메일을 입력하세요.')
                        if uid == 'admin':
                            return self.reply(409, {'error': '사용할 수 없는 아이디입니다.'})
                        profile = clean_profile({'version': 2})
                        try:
                            db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)',
                                       (uid, nickname, email, password_hash(password), 'player', json.dumps(profile), 0, int(time.time())))
                            db.commit()
                        except sqlite3.IntegrityError:
                            return self.reply(409, {'error': '이미 사용 중인 아이디 또는 이메일입니다.'})
                    user = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
                    dummy = '00' * 16 + ':' + '00' * 32
                    if not password_matches(password, user['password'] if user else dummy) or not user:
                        return self.reply(401, {'error': '아이디 또는 비밀번호가 올바르지 않습니다.'})
                    token = secrets.token_urlsafe(32)
                    keep = body.get('keep') is True
                    now = int(time.time())
                    db.execute('DELETE FROM sessions WHERE expires<?', (now,))
                    db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), uid, now + (2592000 if keep else 43200)))
                    db.commit()
                    self.reply(200, self.payload(user), self.cookie(token, keep))
                    return
                if action == 'forgot':
                    if not self.server.mail_available:
                        return self.reply(503, {'error': '재설정 메일 발송 설정을 준비 중입니다. 관리자에게 문의하세요.'})
                    email = str(body.get('email', '')).strip().lower()
                    if not valid_email(email):
                        raise ValueError('올바른 이메일을 입력하세요.')
                    user = db.execute('SELECT id,email FROM users WHERE email=?', (email,)).fetchone()
                    if user:
                        token = secrets.token_urlsafe(32)
                        db.execute('DELETE FROM resets WHERE user_id=? OR expires<?', (user['id'], int(time.time())))
                        db.execute('INSERT INTO resets VALUES(?,?,?)', (digest(token), user['id'], int(time.time()) + 1800))
                        db.commit()
                        self.server.send_reset(user['email'], token)
                    return self.reply(200, {'message': '가입된 이메일이면 재설정 링크를 보냈습니다. 30분 안에 확인하세요.'})
                if action == 'reset':
                    password = body.get('password')
                    if not isinstance(password, str) or not 8 <= len(password) <= 128 or password != body.get('confirm'):
                        raise ValueError('새 비밀번호와 확인을 8~128자로 동일하게 입력하세요.')
                    db.execute('BEGIN IMMEDIATE')
                    row = db.execute('SELECT * FROM resets WHERE token=? AND expires>?', (digest(str(body.get('token', ''))), int(time.time()))).fetchone()
                    if not row:
                        return self.reply(400, {'error': '재설정 링크가 만료되었거나 사용되었습니다.'})
                    db.execute('UPDATE users SET password=? WHERE id=?', (password_hash(password), row['user_id']))
                    db.execute('DELETE FROM sessions WHERE user_id=?', (row['user_id'],))
                    db.execute('DELETE FROM resets WHERE user_id=?', (row['user_id'],))
                    db.commit()
                    return self.reply(200, {'message': '비밀번호를 변경했습니다. 다시 로그인하세요.'})
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': '로그인이 만료되었습니다. 다시 로그인하세요.'})
                if action == 'logout':
                    cookies = SimpleCookie(self.headers.get('Cookie', ''))
                    db.execute('DELETE FROM sessions WHERE token=?', (digest(cookies['fortress_session'].value),))
                    db.commit()
                    return self.reply(200, {'ok': True}, self.cookie())
                if action == 'profile':
                    profile = clean_profile(body.get('profile'))
                    revision = body.get('revision')
                    if not isinstance(revision, int) or isinstance(revision, bool):
                        raise ValueError('저장 버전이 필요합니다.')
                    result = db.execute('UPDATE users SET profile=?,revision=revision+1 WHERE id=? AND revision=?',
                                        (json.dumps(profile), user['id'], revision))
                    if result.rowcount != 1:
                        return self.reply(409, {'error': '다른 기기에서 기록이 변경되었습니다. 서버 기록을 다시 불러오세요.'})
                    db.commit()
                    return self.reply(200, {'revision': revision + 1})
                if action == 'email':
                    email = str(body.get('email', '')).strip().lower()
                    password = body.get('password', '')
                    if not isinstance(password, str) or len(password) > 128 or not valid_email(email) or not password_matches(password, user['password']):
                        raise ValueError('현재 비밀번호와 올바른 복구 이메일을 입력하세요.')
                    try:
                        db.execute('UPDATE users SET email=? WHERE id=?', (email, user['id']))
                    except sqlite3.IntegrityError:
                        return self.reply(409, {'error': '이미 사용 중인 이메일입니다.'})
                    db.commit()
                    return self.reply(200, {'ok': True})
                self.reply(404, {'error': '찾을 수 없는 계정 요청입니다.'})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply(400, {'error': '입력 내용을 확인하세요.'})
        except Exception:
            self.reply(500, {'error': '계정 서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'})

def valid_email(email):
    return len(email) <= 254 and bool(re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+', email))

def make_server(store, port=3196, secure=True, origins=None, outbox=None):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.store, server.secure = store, secure
    server.origins = origins or ['https://fortress.xsw.kr', 'https://portress.xsw.kr']
    sendmail = os.environ.get('FORTRESS_SENDMAIL', '/usr/sbin/sendmail')
    smtp_host = os.environ.get('FORTRESS_SMTP_HOST', '')
    server.mail_available = bool(outbox or smtp_host or (os.environ.get('FORTRESS_SENDMAIL_ENABLED') == '1' and Path(sendmail).is_file()))
    def send_reset(email, token):
        message = EmailMessage()
        message['From'] = os.environ.get('FORTRESS_MAIL_FROM', 'FORTRESS <noreply@fortress.xsw.kr>')
        message['To'], message['Subject'] = email, 'FORTRESS 비밀번호 재설정'
        # Fragment keeps reset credentials out of proxy access logs and referrers.
        message.set_content('아래 링크에서 비밀번호를 변경하세요. 링크는 30분 동안 한 번만 사용할 수 있습니다.\n'
                            + 'https://fortress.xsw.kr/#reset=' + token)
        if outbox:
            Path(outbox).mkdir(parents=True, exist_ok=True)
            Path(outbox, secrets.token_hex(8) + '.eml').write_bytes(message.as_bytes())
        elif smtp_host:
            port = int(os.environ.get('FORTRESS_SMTP_PORT', '587'))
            connection = smtplib.SMTP_SSL(smtp_host, port, timeout=15, context=ssl.create_default_context()) if port == 465 else smtplib.SMTP(smtp_host, port, timeout=15)
            with connection as smtp:
                if port != 465:
                    smtp.starttls(context=ssl.create_default_context())
                if os.environ.get('FORTRESS_SMTP_USER'):
                    smtp.login(os.environ['FORTRESS_SMTP_USER'], os.environ.get('FORTRESS_SMTP_PASSWORD', ''))
                smtp.send_message(message)
        else:
            subprocess.run([sendmail, '-t', '-oi'], input=message.as_bytes(), check=True, timeout=15)
    server.send_reset = send_reset
    return server

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=os.environ.get('FORTRESS_ACCOUNT_DB', 'accounts.sqlite3'))
    parser.add_argument('--port', type=int, default=3196)
    parser.add_argument('--development', action='store_true')
    parser.add_argument('--outbox')
    parser.add_argument('--seed-admin', action='store_true')
    parser.add_argument('--caddy', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    store = Store(args.db)
    if args.seed_admin:
        import getpass
        store.seed_admin(getpass.getpass('Admin password: '), os.environ.get('FORTRESS_ADMIN_EMAIL', ''))
    else:
        server = make_server(store, args.port, not args.development,
                             ['http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:4174', 'http://127.0.0.1:4194'] if args.development else None, args.outbox)
        if args.caddy:
            from account_routes import maintain_route
            threading.Thread(target=maintain_route, daemon=True).start()
        print('FORTRESS account service ready', flush=True)
        server.serve_forever()
