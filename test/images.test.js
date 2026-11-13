'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { createImageService } = require('../lib/images');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ascimg-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeImg = (width) => ({
  isEmpty: () => false,
  getSize: () => ({ width, height: width * 1.5 }),
  resize: ({ width: w }) => ({ toJPEG: () => Buffer.from('JPG' + w), toPNG: () => Buffer.from('PNG' + w) }),
});
const nativeImage = (width) => ({ createFromBuffer: () => fakeImg(width) });
const fakeOpen = (counter, { type = 'image/jpeg', len, body = Buffer.alloc(2000, 1), status = 200 } = {}) => async () => {
  counter.n++;
  await wait(20);
  const headers = { 'content-type': type }; if (len != null) headers['content-length'] = String(len);
  return { status, headers, body: Readable.from([body]) };
};

test('reduz imagem grande, guarda em disco e na segunda vez nao baixa de novo', async () => {
  const c = { n: 0 }, dir = tmp();
  const s = createImageService({ open: fakeOpen(c), nativeImage: nativeImage(1200), dir });
  const r1 = await s.handle('http://x/a.jpg', 320);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual(Buffer.from(await r1.arrayBuffer()).toString(), 'JPG320');
  await wait(80);
  const r2 = await s.handle('http://x/a.jpg', 320);
  assert.strictEqual(Buffer.from(await r2.arrayBuffer()).toString(), 'JPG320');
  assert.strictEqual(c.n, 1);
});

test('PNG continua PNG (mantem transparencia)', async () => {
  const c = { n: 0 };
  const s = createImageService({ open: fakeOpen(c, { type: 'image/png' }), nativeImage: nativeImage(900), dir: tmp() });
  const r = await s.handle('http://x/logo.png', 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/png');
  assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'PNG200');
});

test('imagem ja pequena e entregue sem recodificar', async () => {
  const c = { n: 0 }, body = Buffer.from('ORIGINAL');
  const s = createImageService({ open: fakeOpen(c, { body }), nativeImage: nativeImage(300), dir: tmp() });
  const r = await s.handle('http://x/p.jpg', 320);
  assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'ORIGINAL');
});

test('tipo nao suportado e arquivo grande demais devolvem erro (interface cai para o proxy)', async () => {
  const c = { n: 0 };
  const a = createImageService({ open: fakeOpen(c, { type: 'image/svg+xml' }), nativeImage: nativeImage(10), dir: tmp() });
  assert.strictEqual((await a.handle('http://x/a.svg', 320)).status, 415);
  const b = createImageService({ open: fakeOpen(c, { len: 50 * 1024 * 1024 }), nativeImage: nativeImage(10), dir: tmp() });
  assert.strictEqual((await b.handle('http://x/big.jpg', 320)).status, 413);
  const d = createImageService({ open: async () => ({ error: 403 }), nativeImage: nativeImage(10), dir: tmp() });
  assert.strictEqual((await d.handle('http://127.0.0.1/x.jpg', 320)).status, 403);
});

test('pedidos iguais ao mesmo tempo compartilham um unico download', async () => {
  const c = { n: 0 };
  const s = createImageService({ open: fakeOpen(c), nativeImage: nativeImage(1200), dir: tmp() });
  const rs = await Promise.all([1, 2, 3, 4].map(() => s.handle('http://x/same.jpg', 320)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.strictEqual(c.n, 1);
});

test('limpeza apaga as imagens mais antigas quando passa do limite', async () => {
  const dir = tmp();
  const s = createImageService({ open: fakeOpen({ n: 0 }), nativeImage: nativeImage(10), dir, cacheMax: 1000 });
  for (let i = 0; i < 5; i++) {
    const f = path.join(dir, 'k' + i + '.jpg');
    fs.writeFileSync(f, Buffer.alloc(400));
    const t = new Date(Date.now() - (5 - i) * 10000); fs.utimesSync(f, t, t);
  }
  const del = await s.prune();
  assert.ok(del >= 2);
  const left = fs.readdirSync(dir);
  assert.ok(left.includes('k4.jpg') && !left.includes('k0.jpg'));
});
