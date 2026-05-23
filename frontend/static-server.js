import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 5173);
const backend = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:5000');
const proxyPrefixes = ['/api', '/auth', '/webhook', '/uploads'];

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const sendFile = (res, filePath) => {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    res.end(data);
  });
};

const proxyRequest = (req, res) => {
  const target = new URL(req.url, backend);
  const proxy = http.request(target, {
    method: req.method,
    headers: {
      ...req.headers,
      host: backend.host
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: 'Backend unavailable' }));
  });

  req.pipe(proxy);
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (proxyPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    proxyRequest(req, res);
    return;
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  let filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || stats.isDirectory()) {
      filePath = path.join(root, 'index.html');
    }
    sendFile(res, filePath);
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`Frontend static server running at http://127.0.0.1:${port}`);
});
