import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.FRONTEND_PORT || 5173);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:5000';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const proxyPrefixes = ['/api', '/auth', '/webhook', '/uploads'];

const sendFile = (res, filePath) => {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
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
  const target = new URL(req.url, backendOrigin);
  const headers = { ...req.headers, host: target.host };

  const proxy = http.request(target, {
    method: req.method,
    headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: error.message }));
  });

  req.pipe(proxy);
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);

  if (proxyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    proxyRequest(req, res);
    return;
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = path.join(distDir, safePath);

  fs.stat(requestedPath, (error, stat) => {
    if (!error && stat.isFile()) {
      sendFile(res, requestedPath);
      return;
    }

    sendFile(res, path.join(distDir, 'index.html'));
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Frontend server running on http://127.0.0.1:${port}`);
  console.log(`Proxying API requests to ${backendOrigin}`);
});
