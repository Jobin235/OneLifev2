import http from 'node:http';
import { readFileSync } from 'node:fs';
const path = '/home/user/OneLifev2/apps/mobile/standalone/one-life.html';
http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  res.end(readFileSync(path));
}).listen(5176, '127.0.0.1', () => console.log('up'));
