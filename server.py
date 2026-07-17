import json
import os
import hashlib
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
SUBMISSIONS_FILE = DATA_DIR / 'submissions.json'
DATA_DIR.mkdir(exist_ok=True)
if not SUBMISSIONS_FILE.exists():
    SUBMISSIONS_FILE.write_text('[]', encoding='utf-8')

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'IKeepDreamingIts2026!')
ADMIN_PASSWORD_HASH = hashlib.sha256(ADMIN_PASSWORD.encode('utf-8')).hexdigest()

MIME_TYPES = {
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
}


def read_submissions():
    try:
        return json.loads(SUBMISSIONS_FILE.read_text(encoding='utf-8'))
    except Exception:
        return []


def write_submissions(items):
    SUBMISSIONS_FILE.write_text(json.dumps(items, indent=2), encoding='utf-8')


def hash_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/health':
            self._send_json(200, {'ok': True})
            return

        if parsed.path == '/api/submissions':
            submitted_password = urllib.parse.parse_qs(parsed.query).get('password', [''])[0]
            if hash_text(submitted_password) != ADMIN_PASSWORD_HASH:
                self._send_json(401, {'error': 'Unauthorized'})
                return
            self._send_json(200, read_submissions())
            return

        if parsed.path == '/api/login':
            self._send_json(405, {'error': 'Method not allowed.'})
            return

        file_path = ROOT / parsed.path.lstrip('/')
        if str(parsed.path) == '/':
            file_path = ROOT / 'index.html'

        if file_path.exists() and file_path.is_file():
            content_type = MIME_TYPES.get(file_path.suffix.lower(), 'application/octet-stream')
            body = file_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self._send_json(404, {'error': 'Not found'})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/submissions':
            body = self._read_json_body()
            if not isinstance(body, dict) or 'type' not in body:
                self._send_json(400, {'error': 'Submission type is required.'})
                return

            item = dict(body)
            item['id'] = f"{body['type']}-{os.urandom(4).hex()}"
            item['timestamp'] = self.date_time_string() if False else __import__('datetime').datetime.utcnow().isoformat() + 'Z'
            submissions = read_submissions()
            submissions.append(item)
            write_submissions(submissions)
            self._send_json(200, {'ok': True, 'submission': item})
            return

        if parsed.path == '/api/login':
            body = self._read_json_body()
            submitted_password = body.get('password', '')
            ok = hash_text(submitted_password) == ADMIN_PASSWORD_HASH
            self._send_json(200 if ok else 401, {'ok': ok})
            return

        self._send_json(404, {'error': 'Not found'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/submissions':
            submitted_password = urllib.parse.parse_qs(parsed.query).get('password', [''])[0]
            if hash_text(submitted_password) != ADMIN_PASSWORD_HASH:
                self._send_json(401, {'error': 'Unauthorized'})
                return
            write_submissions([])
            self._send_json(200, {'ok': True})
            return
        self._send_json(404, {'error': 'Not found'})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '3000'))
    host = os.environ.get('HOST', '0.0.0.0')
    server = ThreadingHTTPServer((host, port), Handler)
    print(f'Submission server listening on http://{host}:{port}')
    server.serve_forever()
