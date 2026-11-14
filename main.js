'use strict';
const { app, BrowserWindow, ipcMain, protocol, session, safeStorage, Notification, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { open, toResponse } = require('./lib/proxy');
const { createImageService } = require('./lib/images');

const SRC = path.join(__dirname, 'src');
const SCHEME = 'app';
const ORIGIN = 'app://asc';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

/* Menos travadas em PC fraco: o Windows deixa de "adivinhar" janelas cobertas e pausar o desenho do vídeo */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
/* Opções que precisam valer antes do app abrir (Ajustes > Decodificação por hardware) */
function flagsFile() { return path.join(app.getPath('userData'), 'flags.json'); }
function loadFlags() { try { return JSON.parse(fs.readFileSync(flagsFile(), 'utf8')) || {}; } catch { return {}; } }
const FLAGS = loadFlags();
if (FLAGS.nohw) app.commandLine.appendSwitch('disable-accelerated-video-decode'); /* vídeo decodificado só pelo processador */

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.ascdesk.app');

let win = null;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

/* ---------- Posicao e tamanho da janela ---------- */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && s.w >= 900 && s.h >= 600) return s;
  } catch { /* primeira vez */ }
  return { w: 1280, h: 800 };
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height, max: win.isMaximized() }));
  } catch { /* sem permissao: ignora */ }
}

/* ---------- Protocolo app://asc : arquivos do app + proxy de rede ---------- */
function serveFile(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/' || p === '') p = '/index.html';
  const full = path.normalize(path.join(SRC, p));
  if (!full.startsWith(SRC + path.sep)) return new Response('forbidden', { status: 403 });
  try {
    const buf = fs.readFileSync(full);
    return new Response(buf, { status: 200, headers: { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
let playing = false; /* a interface avisa quando um vídeo está aberto */
let images = null; /* criado quando o app abre (precisa da pasta de dados do usuário) */
async function handleProtocol(request) {
  const u = new URL(request.url);
  if (u.host !== 'asc') return new Response('forbidden', { status: 403 });
  if (u.pathname === '/__i') {
    /* Capa/logo reduzida e guardada em disco. Se falhar, a interface cai para /__p (original). */
    if (request.method !== 'GET' || !images) return new Response(null, { status: 405 });
    const target = u.searchParams.get('u');
    if (!target) return new Response(null, { status: 400 });
    const w = [200, 320, 640].find((x) => (Number(u.searchParams.get('w')) || 320) <= x) || 640;
    try { return await images.handle(target, w, request.signal); } catch { return new Response(null, { status: 502 }); }
  }
  if (u.pathname === '/__p') {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const target = u.searchParams.get('u');
    if (!target) return new Response(null, { status: 400 });
    const hd = {};
    request.headers.forEach((v, k) => { hd[k] = v; });
    /* Imagens (capas e logos) usam conexões separadas e limitadas: não disputam banda nem conexões com o vídeo */
    const isImg = /image\//i.test(request.headers.get('accept') || '');
    try {
      return toResponse(await open(target, hd, { signal: request.signal, image: isImg }), Readable);
    } catch {
      return new Response(null, { status: 502 });
    }
  }
  return serveFile(u.pathname);
}

/* ---------- Janela ---------- */
function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.w, height: st.h, minWidth: 900, minHeight: 600,
    backgroundColor: '#0F131A', show: false, title: 'ASC DESK',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0F131A', symbolColor: '#FFFFFF', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      devTools: !app.isPackaged, spellcheck: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.on('enter-full-screen', () => win && !win.isDestroyed() && win.webContents.send('win:fs-state', true));
  win.on('leave-full-screen', () => win && !win.isDestroyed() && win.webContents.send('win:fs-state', false));
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) e.preventDefault(); });
  win.loadURL(ORIGIN + '/index.html');
}

/* ---------- Ponte segura com a interface (IPC) ---------- */
const own = (e) => win && e.sender === win.webContents;
function handle(name, fn) {
  ipcMain.handle(name, (e, ...a) => { if (!own(e)) throw new Error('forbidden'); return fn(...a); });
}

handle('app:version', () => {
  const v = app.getVersion();
  const p = v.split('.').map((n) => parseInt(n, 10) || 0);
  return { name: v, code: p[0] * 1e6 + p[1] * 1e3 + p[2], packaged: app.isPackaged };
});

/* Cofre: a chave dos dados e protegida pelo Windows (DPAPI) via safeStorage */
handle('sec:wrap', ({ data }) => {
  if (typeof data !== 'string' || !safeStorage.isEncryptionAvailable()) throw new Error('wrap');
  return { data: safeStorage.encryptString(data).toString('base64') };
});
handle('sec:unwrap', ({ data }) => {
  if (typeof data !== 'string' || !safeStorage.isEncryptionAvailable()) throw new Error('unwrap');
  return { data: safeStorage.decryptString(Buffer.from(data, 'base64')) };
});
/* Tela cheia da janela inteira (mais estável que a tela cheia de elemento HTML numa janela sem moldura) */
handle('win:fs', (on) => { if (win && !win.isDestroyed()) win.setFullScreen(!!on); });
/* Informações para diagnóstico (decodificação de vídeo e placa de vídeo) */
handle('app:gpu', async () => {
  const st = app.getGPUFeatureStatus();
  let gl = '';
  try {
    const i = await Promise.race([app.getGPUInfo('complete'), new Promise((r) => setTimeout(() => r(null), 4000))]);
    gl = (i && i.auxAttributes && i.auxAttributes.glRenderer) || '';
  } catch { /* sem info */ }
  return { video_decode: st.video_decode, gpu_compositing: st.gpu_compositing, gl, nohw: !!FLAGS.nohw, chrome: process.versions.chrome, electron: process.versions.electron };
});
handle('app:hwdec', (on) => {
  const f = loadFlags();
  if (on) delete f.nohw; else f.nohw = true;
  fs.writeFileSync(flagsFile(), JSON.stringify(f));
  app.relaunch();
  app.exit(0);
});
handle('app:playing', (on) => { playing = !!on; });
handle('sec:screen', ({ secure }) => { if (win) win.setContentProtection(!!secure); });

/* Avisos de vencimento (funcionam enquanto o app estiver aberto) */
const timers = new Map();
handle('notify:cancel', (ids) => { for (const id of ids || []) { clearTimeout(timers.get(id)); timers.delete(id); } });
handle('notify:schedule', (list) => {
  for (const n of list || []) {
    const delay = Number(n.at) - Date.now();
    if (!(delay > 0) || delay > 2147483000) continue;
    clearTimeout(timers.get(n.id));
    timers.set(n.id, setTimeout(() => {
      timers.delete(n.id);
      if (Notification.isSupported()) new Notification({ title: String(n.title || 'ASC DESK'), body: String(n.body || '') }).show();
    }, delay));
  }
});

/* ---------- Atualizacao automatica (GitHub Releases) ---------- */
let updater = null;
function send(m) { if (win && !win.isDestroyed()) win.webContents.send('upd:event', m); }
function initUpdater() {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', (i) => send({ type: 'ready', version: i.version }));
    updater.on('error', (e) => send({ type: 'error', message: String((e && e.message) || e).slice(0, 200) }));
  } catch { updater = null; }
}
handle('upd:check', () => new Promise((resolve) => {
  if (!updater) return resolve({ state: 'dev' });
  let done = false;
  const fin = (v) => { if (done) return; done = true; updater.removeListener('update-available', a); updater.removeListener('update-not-available', n); updater.removeListener('error', er); resolve(v); };
  const a = (i) => fin({ state: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : '' });
  const n = () => fin({ state: 'none' });
  const er = (e) => fin({ state: 'error', message: String((e && e.message) || e).slice(0, 200) });
  updater.once('update-available', a); updater.once('update-not-available', n); updater.once('error', er);
  updater.checkForUpdates().catch(er);
  setTimeout(() => fin({ state: 'error', message: 'timeout' }), 30000);
}));
handle('upd:download', () => { if (updater) return updater.downloadUpdate().then(() => true); return false; });
handle('upd:install', () => { if (updater) updater.quitAndInstall(false, true); });

/* ---------- Inicio ---------- */
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  images = createImageService({ open, nativeImage, dir: path.join(app.getPath('userData'), 'imgcache'), busy: () => playing });
  protocol.handle(SCHEME, handleProtocol);
  setTimeout(() => images.prune(), 20000); /* limpeza do cache de imagens, sem atrasar a abertura */
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen' || perm === 'pictureInPicture'));
  ses.setPermissionCheckHandler((wc, perm) => perm === 'fullscreen' || perm === 'pictureInPicture');
  createWindow();
  initUpdater();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('web-contents-created', (_, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
});
void shell;
