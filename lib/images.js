'use strict';
/* Serviço de imagens do ASC DESK (processo principal).
   Capas e logos chegam do servidor em tamanho grande. Aqui elas são baixadas pelo proxy seguro,
   reduzidas (ex.: 320 px de largura) e guardadas em disco. Na segunda vez abrem na hora e usam
   bem menos memória. Se algo falhar, devolve um código de erro e a interface cai para o proxy normal. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OK = /^image\/(jpe?g|pjpeg|png|webp)$/i;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function createImageService({ open, nativeImage, dir, maxBytes = 8 * 1024 * 1024, cacheMax = 200 * 1024 * 1024, busy = () => false, cpuMax = 4 * 1024 * 1024 }) {
  let made = false;
  const flight = new Map();
  const ensure = () => { if (!made) { fs.mkdirSync(dir, { recursive: true }); made = true; } };
  const keyOf = (target, w) => crypto.createHash('sha1').update(target + '|' + w).digest('hex');
  const ok = (buf, type) => new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(buf.length), 'Cache-Control': 'public, max-age=604800' } });
  const fail = (status) => new Response(null, { status: status || 502, headers: { 'Cache-Control': 'no-store' } });

  async function fromDisk(k) {
    for (const e of ['jpg', 'png', 'webp']) {
      const f = path.join(dir, k + '.' + e);
      try {
        const b = await fs.promises.readFile(f);
        const now = new Date(); fs.promises.utimes(f, now, now).catch(() => {}); /* marca como usado recentemente */
        return ok(b, TYPE[e]);
      } catch { /* nao existe */ }
    }
    return null;
  }
  function save(k, ext, buf) {
    const f = path.join(dir, k + '.' + ext);
    fs.promises.writeFile(f + '.tmp', buf).then(() => fs.promises.rename(f + '.tmp', f)).catch(() => {});
  }

  /* O redimensionamento roda no processo principal (o mesmo que leva o vídeo até a tela). Por isso: uma imagem por vez,
     com uma pausa entre elas, para o vídeo e a interface nunca ficarem esperando. */
  let chain = Promise.resolve();
  const cpu = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 25)));
    return run;
  };

  async function work(target, w, k, signal) {
    const r = await open(target, { accept: 'image/*,*/*;q=0.5' }, { signal, image: true });
    if (r.error) return { status: r.error };
    if (r.status !== 200) { r.body.resume(); return { status: r.status >= 400 ? r.status : 502 }; }
    let ct = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (ct === 'image/jpg' || ct === 'image/pjpeg') ct = 'image/jpeg';
    if (!OK.test(ct)) { r.body.destroy(); return { status: 415 }; } /* gif, svg etc.: a interface usa o proxy normal */
    if ((Number(r.headers['content-length']) || 0) > maxBytes) { r.body.destroy(); return { status: 413 }; }
    const chunks = []; let n = 0;
    try {
      for await (const c of r.body) {
        n += c.length;
        if (n > maxBytes) { r.body.destroy(); return { status: 413 }; }
        chunks.push(c);
      }
    } catch { return { status: 502 }; }
    const buf = Buffer.concat(chunks, n);
    /* tocando vídeo, ou imagem enorme: entrega o original sem mexer (não pesa no PC) */
    if (busy() || n > cpuMax) return { buf, type: ct };
    return cpu(() => shrink(buf, ct, w, k));
  }

  function shrink(buf, ct, w, k) {
    let img = null;
    try { img = nativeImage.createFromBuffer(buf); } catch { img = null; }
    if (!img || img.isEmpty()) return { buf, type: ct }; /* formato que nao deu para ler: entrega o original, sem guardar */
    const size = img.getSize();
    if (!size.width || size.width <= w * 1.25) { save(k, EXT[ct], buf); return { buf, type: ct }; } /* ja e pequena */
    const small = img.resize({ width: w, quality: 'good' });
    const jpeg = ct === 'image/jpeg';
    const out = jpeg ? small.toJPEG(82) : small.toPNG(); /* PNG/WebP mantem a transparencia dos logos */
    const type = jpeg ? 'image/jpeg' : 'image/png';
    save(k, jpeg ? 'jpg' : 'png', out);
    return { buf: out, type };
  }

  /* Varios pedidos da mesma imagem (ex.: logo repetido em varios canais) compartilham um unico download.
     O download so e cancelado quando todos desistem (a imagem saiu da tela). */
  async function handle(target, w, signal) {
    ensure();
    const k = keyOf(target, w);
    const d = await fromDisk(k);
    if (d) return d;
    let f = flight.get(k);
    if (!f) {
      const ac = new AbortController();
      f = { ac, n: 0, p: null };
      f.p = work(target, w, k, ac.signal).catch(() => ({ status: 502 })).finally(() => flight.delete(k));
      flight.set(k, f);
    }
    f.n++;
    const off = () => { if (--f.n <= 0) f.ac.abort(); };
    if (signal) { if (signal.aborted) off(); else signal.addEventListener('abort', off, { once: true }); }
    const res = await f.p;
    return res.buf ? ok(res.buf, res.type) : fail(res.status);
  }

  /* Mantem a pasta abaixo do limite apagando as imagens usadas ha mais tempo */
  async function prune() {
    try {
      const names = await fs.promises.readdir(dir);
      const list = []; let total = 0;
      for (const n of names) {
        try { const s = await fs.promises.stat(path.join(dir, n)); list.push({ n, t: s.mtimeMs, s: s.size }); total += s.size; } catch { /* sumiu */ }
      }
      if (total <= cacheMax) return 0;
      list.sort((a, b) => a.t - b.t);
      let del = 0;
      for (const x of list) {
        if (total <= cacheMax * 0.8) break;
        try { await fs.promises.unlink(path.join(dir, x.n)); total -= x.s; del++; } catch { /* ignora */ }
      }
      return del;
    } catch { return 0; }
  }

  return { handle, prune };
}

module.exports = { createImageService };
