const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src/ui');
const files = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
http.createServer((req, res) => {
  const filename = files[new URL(req.url, 'http://localhost').pathname];
  if (!filename) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(path.join(root, filename)).pipe(res);
}).listen(4387, '127.0.0.1', () => console.log('Design preview: http://127.0.0.1:4387 (sample data only)'));
