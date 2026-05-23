const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'frontend', 'dist');
const backend = { hostname: 'localhost', port: 5000 };
const port = 5173;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function proxy(req, res) {
  const upstream = http.request({
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: req.headers
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: error.message }));
  });

  req.pipe(upstream);
}

function serve(req, res) {
  if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
    proxy(req, res);
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${port}`);
  const safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(root, 'index.html');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500);
      res.end(error.message);
      return;
    }

    res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(serve).listen(port, '0.0.0.0', () => {
  console.log(`Frontend static server running at http://localhost:${port}`);
});
