# FORTRESS accounts

Independent Python standard-library loopback service on 3196. SQLite account data stays outside both the checkout and static root at `/home/reset980/fortress-data/accounts.sqlite3` (private directory and database). Existing multiplayer service on 3195 remains running. Caddy's local API installs one host-scoped `/api/account/*` route, using ETag concurrency checks; the service restores that additive route after Caddy restarts. The root-owned Caddyfile is unchanged.

Passwords use salted scrypt. Sessions use random 256-bit credentials stored as SHA256 digests and Secure/HttpOnly/SameSite cookies; session-only logins expire after 12 hours, persistent logins after 30 days. Mutations require an allowed Origin and JSON. Login and recovery endpoints are rate limited. Reset credentials are hashed, expire in 30 minutes, are single use, and revoke existing sessions. Reset links use URL fragments to keep credentials out of HTTP logs.

Client saves retain independent per-tank growth and an optimistic server revision. Offline pending saves stay in an account-specific browser cache. Conflicts require explicitly loading the server copy while retaining a local backup. Guest migration preserves the higher wallet and growth values rather than adding duplicate currency. Game progression is still an offline campaign save; it is not an authoritative competitive economy and does not alter multiplayer settlement.

Password saving delegates to the browser password manager; passwords are never written to localStorage. User records do not contain plaintext passwords. The administrator is seeded separately through standard input; credentials never belong in this repository. Initial admin wallet is 1,000,000 PT and repeated seeding never resets an existing account.

Mail delivery requires a working SMTP relay or an explicitly verified sendmail setup. See `mail.env.example`. Merely having sendmail installed does not mark recovery mail as configured. The administrator can set their recovery email in the account dialog after signing in.

Tests: `python -m unittest discover -s server -p test_accounts.py`, `npm test`, and `node tools/account-verify.mjs`. Test reset emails go only to a private temporary outbox. For local UI testing run the account service with `--development --outbox ...`; the preview server forwards `/api/account/*` to 3196.
