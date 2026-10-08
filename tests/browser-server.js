import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = await realpath(path.join(root, 'src'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', manifest.content_security_policy.extension_pages);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1:4177').pathname);
    const file = await realpath(path.resolve(root, `.${pathname}`));
    const type = types.get(path.extname(file));
    if (!file.startsWith(sourceRoot + path.sep) || !type) {
      response.writeHead(403).end();
      return;
    }
    const contents = await readFile(file);
    response.writeHead(200, { 'Content-Type': type });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(4177, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
