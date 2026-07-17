# Evan Wormhole submissions server

Run with:

```bash
node server.js
```

Set a custom admin password before launching:

```bash
ADMIN_PASSWORD='your-secure-password' python3 server.py
```

The site will submit to `/api/submissions` and the admin page will authenticate against `/api/login`.
