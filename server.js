const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const submissionsFile = path.join(dataDir, 'submissions.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(submissionsFile)) {
  fs.writeFileSync(submissionsFile, '[]');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const adminPassword = process.env.ADMIN_PASSWORD || 'IKeepDreamingIts2026!';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || sha256(adminPassword);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          resolve({});
        }
        return;
      }

      const params = new URLSearchParams(body);
      const parsed = {};
      for (const [key, value] of params.entries()) {
        parsed[key] = value;
      }
      resolve(parsed);
    });

    req.on('error', reject);
  });
}

function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(submissionsFile, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeSubmissions(items) {
  fs.writeFileSync(submissionsFile, JSON.stringify(items, null, 2));
}

function isAuthorized(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const submittedPassword = url.searchParams.get('password') || '';
  return sha256(submittedPassword) === adminPasswordHash;
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/submissions') {
    if (req.method === 'GET') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      sendJson(res, 200, readSubmissions());
      return;
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body || typeof body !== 'object' || !body.type) {
        sendJson(res, 400, { error: 'Submission type is required.' });
        return;
      }

      const item = {
        ...body,
        id: `${body.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toISOString(),
      };

      const submissions = readSubmissions();
      submissions.push(item);
      writeSubmissions(submissions);

      sendJson(res, 200, { ok: true, submission: item });
      return;
    }

    if (req.method === 'DELETE') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      writeSubmissions([]);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (pathname === '/api/login') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    const body = await parseBody(req);
    const submittedPassword = body.password || '';
    const ok = sha256(submittedPassword) === adminPasswordHash;
    sendJson(res, ok ? 200 : 401, { ok });
    return;
  }

  const safePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(rootDir, safePath.replace(/^\/+/, ''));

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const extension = path.extname(fullPath).toLowerCase();
    const mimeType = mimeTypes[extension] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  const fallbackPath = path.join(rootDir, 'index.html');
  if (fs.existsSync(fallbackPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fallbackPath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, host, () => {
  console.log(`Submission server listening on http://${host}:${port}`);
});
