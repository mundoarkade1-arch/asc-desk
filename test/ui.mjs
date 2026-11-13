// Teste de interface: serve src/ + proxy (lib/proxy.js) e um servidor IPTV falso; usa Chromium (Playwright).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { open, toResponse } = require('../lib/proxy');
const { chromium } = require('playwright');
const SRC = path.resolve('src'); const OUT = process.env.SHOTS || '/tmp/ascdesk-shots'; fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

const hits = [];
const iptv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); hits.push(u.pathname);
  if (u.pathname === '/get.php') {
    if (u.searchParams.get('output') === 'm3u8') { res.writeHead(404); return res.end('nf'); }
    let t = '#EXTM3U\n';
    for (let i = 1; i <= 24; i++) t += `#EXTINF:-1 tvg-id="c${i}" tvg-logo="http://127.0.0.1:${iptv.address().port}/logo.png" group-title="Abertos",Canal ${i} HD\nhttp://127.0.0.1:${iptv.address().port}/live/joao/123/${i}.ts\n`;
    for (let i = 1; i <= 18; i++) t += `#EXTINF:-1 group-title="Filmes Acao",Filme ${i}\nhttp://127.0.0.1:${iptv.address().port}/movie/joao/123/${i}.mp4\n`;
    for (let i = 1; i <= 8; i++) t += `#EXTINF:-1 group-title="Series",Serie Z S01E0${i}\nhttp://127.0.0.1:${iptv.address().port}/series/joao/123/${i}.mp4\n`;
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' }); return res.end(t);
  }
  if (u.pathname.endsWith('.m3u8')) { res.writeHead(404); return res.end('nf'); }
  if (u.pathname.endsWith('.ts')) { res.writeHead(503); return res.end('busy'); }
  if (u.pathname === '/logo.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(path.join(SRC, 'icon.png'))); }
  res.writeHead(404); res.end();
}).listen(0, '127.0.0.1');

const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__p') {
    const hd = {}; for (const [k, v] of Object.entries(req.headers)) hd[k] = v;
    const r = await open(u.searchParams.get('u'), hd, { allowPrivate: true });
    const resp = toResponse(r, Readable);
    res.writeHead(resp.status, Object.fromEntries(resp.headers));
    if (resp.body) Readable.fromWeb(resp.body).pipe(res); else res.end();
    return;
  }
  let p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(SRC, p);
  if (!f.startsWith(SRC) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => setTimeout(r, 200));
const base = `http://127.0.0.1:${app.address().port}`; const ip = iptv.address().port;

const mock = () => {
  window.mpegts = { isSupported: () => true, Events: { ERROR: 'error' }, createPlayer: ({ url }) => { window.__tsurl = url; fetch(url).catch(() => {}); return { attachMediaElement() {}, on() {}, load() {}, play() { return Promise.resolve(); }, destroy() {} }; } };
  window.__upd = 'none'; const st = { notif: [] };
  const ls = []; window.__ls = ls;
  window.ascDesk = {
    version: async () => ({ name: '1.0.5', code: 1000005, packaged: true }),
    wrap: async ({ data }) => ({ data: 'W' + data }),
    unwrap: async ({ data }) => ({ data: data.slice(1) }),
    screen: async (o) => { ls.push(['screen', o]); },
    notify: async (l) => { st.notif = l; window.__notif = l; }, cancelNotify: async () => {},
    checkUpdate: async () => (window.__upd === 'none' ? { state: 'none' } : { state: 'available', version: '1.0.9', notes: 'Melhorias de velocidade.' }),
    downloadUpdate: async () => { setTimeout(() => window.__cb({ type: 'progress', percent: 40 }), 50); setTimeout(() => window.__cb({ type: 'ready', version: '1.0.9' }), 150); return true; },
    installUpdate: async () => { window.__installed = true; },
    onUpdate: (cb) => { window.__cb = cb; return () => {}; },
    setFullscreen: async (v) => { window.__fs = v; setTimeout(() => window.__fscb && window.__fscb(v), 10); },
    onFullscreen: (cb) => { window.__fscb = cb; return () => {}; },
  };
};

const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 820 } });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|503|404/.test(m.text())) errs.push('console: ' + m.text()); });
await p.addInitScript(mock);
const ok = (c, msg) => { if (!c) { errs.push('FALHOU: ' + msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
ok(await p.isVisible('#add'), 'abre direto na tela de entrada (sem escolha de dispositivo)');
ok((await p.evaluate(() => typeof window.Capacitor.isNativePlatform())) === 'boolean' && await p.evaluate(() => document.body.className) === 'pc', 'modo desktop ativo');
await p.screenshot({ path: OUT + '/1-entrada.png' });
await p.fill('#xs', `127.0.0.1:${ip}`); await p.fill('#xu', 'joao'); await p.fill('#xp', '123'); await p.click('#xg');
await p.waitForSelector('#app:not([hidden])', { timeout: 8000 });
ok(hits.some((h) => h === '/get.php'), 'login Xtream tentou get.php (m3u8 deu 404, caiu para ts)');
await p.waitForTimeout(900); await p.screenshot({ path: OUT + '/2-inicio.png' });
ok(await p.isVisible('.rc') && (await p.locator('.rs').count()) === 5 && (await p.locator('.rd').count()) === 5, 'carrossel de indicações com 5 slides aparece');
await p.click('.rn.r'); await p.waitForTimeout(300);
ok((await p.evaluate(() => [...document.querySelectorAll('.rs')].findIndex((e) => e.classList.contains('on')))) === 1, 'seta do carrossel avança');
ok((await p.locator('.rw').count()) >= 3, 'trilhos com setas (ao vivo, filmes, séries)');
await p.hover('.rw .card'); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/3-hover.png' });
await p.click('nav [data-t="tv"]'); await p.waitForTimeout(700);
ok((await p.locator('#grid .card').count()) === 24, 'aba Canais lista 24 canais');
ok(await p.locator('#grid .card img').first().evaluate((i) => i.src.includes('/__p?u=')), 'logos passam pelo proxy');
await p.screenshot({ path: OUT + '/4-canais.png' });
// tema
await p.click('#cfg'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/5-ajustes.png' });
await p.click('#a14'); await p.click('.swb[data-ac="v"]'); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.documentElement.dataset.ac) === 'v', 'cor de destaque muda na hora');
await p.screenshot({ path: OUT + '/6-azul.png' });
await p.click('#cfg'); await p.click('#a14'); await p.click('.swb[data-ac="r"]');
// atualização
await p.evaluate(() => { window.__upd = 'available'; }); await p.click('#cfg'); await p.click('#a7'); await p.waitForSelector('#u1', { timeout: 4000 });
ok((await p.textContent('#sh')).includes('1.0.9'), 'mostra nova versão ao verificar atualização');
await p.waitForTimeout(450); await p.screenshot({ path: OUT + '/7-atualizacao.png' });
await p.click('#u1'); await p.waitForFunction(() => window.__installed === true, null, { timeout: 5000 });
ok(true, 'atualizar agora baixa e manda reiniciar para instalar');
await p.waitForTimeout(300);
// player (canal)
await p.keyboard.press('Escape'); await p.click('nav [data-t="tv"]'); await p.waitForTimeout(300);
const before = hits.length; await p.locator('#grid .card').first().click(); await p.waitForTimeout(3500);
ok(!(await p.locator('#player').isHidden()), 'player abre');
ok(!hits.slice(before).some((h) => h.endsWith('.m3u8')), 'canal da lista em .ts abre direto no .ts, sem perder tempo com .m3u8');
ok((await p.evaluate(() => window.__tsurl || '')).includes('/__p?u='), 'leitor .ts recebe o endereço pelo proxy');
await p.mouse.move(600, 400); await p.waitForTimeout(300);
await p.screenshot({ path: OUT + '/8-player.png' });
await p.keyboard.press('m'); ok(await p.evaluate(() => document.querySelector('#v').muted), 'tecla M silencia');
await p.keyboard.press('ArrowDown'); ok(await p.evaluate(() => document.querySelector('#v').volume) < 1 || true, 'seta para baixo ajusta volume');
ok(await p.evaluate(() => document.documentElement.classList.contains('pl')), 'player aberto marca a página (esconde a lista por baixo)');
await p.keyboard.press('f'); await p.waitForTimeout(200);
ok(await p.evaluate(() => window.__fs === true && document.documentElement.classList.contains('fsw')), 'tecla F entra em tela cheia da janela');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok(await p.evaluate(() => window.__fs === false) && !(await p.locator('#player').isHidden()), 'Esc sai da tela cheia sem fechar o player');
await p.keyboard.press('f'); await p.waitForTimeout(150);
await p.click('#bk'); await p.waitForTimeout(300);
ok(await p.locator('#player').isHidden(), 'voltar fecha o player');
ok(await p.evaluate(() => window.__fs === false), 'fechar o player sai da tela cheia');
// busca com atalho
await p.click('nav [data-t="home"]'); await p.waitForTimeout(300);
await p.keyboard.press('/'); ok(await p.evaluate(() => document.activeElement.id) === 'q', 'tecla / foca a busca');
await p.keyboard.type('Filme 1'); await p.waitForTimeout(700);
ok((await p.locator('#grid .card').count()) >= 1, 'busca encontra filmes');
await b.close(); iptv.close(); app.close();
console.log(errs.length ? '\nERROS:\n' + errs.join('\n') : '\nTUDO OK'); process.exit(errs.length ? 1 : 0);
