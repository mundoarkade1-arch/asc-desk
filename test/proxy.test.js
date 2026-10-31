'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { Readable } = require('stream');
const { open, toResponse, isPrivateIp } = require('../lib/proxy');

function server(handler) {
  return new Promise((res) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => res(s)); });
}
const base = (s) => `http://127.0.0.1:${s.address().port}`;

test('isPrivateIp reconhece enderecos locais', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.1.1', '169.254.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1'])
    assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])
    assert.ok(!isPrivateIp(ip), ip);
});

test('bloqueia loopback, rede local e esquemas invalidos', async () => {
  assert.strictEqual((await open('http://127.0.0.1:1/x')).error, 403);
  assert.strictEqual((await open('http://192.168.1.10/x')).error, 403);
  assert.strictEqual((await open('http://[::1]/x')).error, 403);
  assert.strictEqual((await open('file:///etc/passwd')).error, 400);
  assert.strictEqual((await open('ftp://x/y')).error, 400);
  assert.strictEqual((await open('nao e url')).error, 400);
  assert.strictEqual((await open('http://localhost:1/x')).error, 403);
});

test('busca, segue redirecionamento e repassa Range', async () => {
  const s = await server((req, res) => {
    if (req.url === '/r') { res.writeHead(302, { Location: '/final.m3u8' }); return res.end(); }
    if (req.url === '/final.m3u8') {
      assert.strictEqual(req.headers.range, 'bytes=0-4');
      assert.strictEqual(req.headers['accept-encoding'], 'identity');
      res.writeHead(206, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Range': 'bytes 0-4/10' });
      return res.end('hello');
    }
    res.writeHead(404); res.end('nf');
  });
  const r = await open(base(s) + '/r', { Range: 'bytes=0-4', 'User-Agent': 'X' }, { allowPrivate: true });
  assert.strictEqual(r.status, 206);
  assert.ok(r.finalUrl.endsWith('/final.m3u8'));
  const resp = toResponse(r, Readable);
  assert.strictEqual(resp.status, 206);
  assert.strictEqual(resp.headers.get('x-final-url'), r.finalUrl);
  assert.strictEqual(resp.headers.get('content-range'), 'bytes 0-4/10');
  assert.strictEqual(await resp.text(), 'hello');
  const nf = await open(base(s) + '/nao', {}, { allowPrivate: true });
  assert.strictEqual(nf.status, 404);
  assert.strictEqual(toResponse(nf, Readable).status, 404);
  s.close();
});

test('loop de redirecionamento vira 508 e servidor fora do ar vira 502', async () => {
  const s = await server((req, res) => { res.writeHead(302, { Location: '/' }); res.end(); });
  assert.strictEqual((await open(base(s) + '/', {}, { allowPrivate: true })).error, 508);
  const port = s.address().port; s.close();
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual((await open(`http://127.0.0.1:${port}/`, {}, { allowPrivate: true })).error, 502);
});

test('fluxo longo (live) e cancelamento nao travam', async () => {
  let closed = false;
  const s = await server((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp2t' });
    const t = setInterval(() => res.write('x'.repeat(1000)), 5);
    req.on('close', () => { closed = true; clearInterval(t); });
  });
  const r = await open(base(s) + '/live.ts', {}, { allowPrivate: true });
  const reader = toResponse(r, Readable).body.getReader();
  const a = await reader.read();
  assert.ok(a.value.length > 0);
  await reader.cancel();
  await new Promise((r2) => setTimeout(r2, 200));
  assert.ok(closed, 'conexao de origem deve fechar ao cancelar');
  s.close();
});
