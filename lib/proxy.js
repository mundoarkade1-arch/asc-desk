'use strict';
/* Proxy de rede do ASC DESK (roda no processo principal).
   A interface pede app://asc/__p?u=<endereco> e este modulo busca o conteudo direto:
   streaming, Range, redirecionamentos, sem CORS. Travas: so http/https, so GET, nunca o proprio
   computador nem a rede local. A checagem de IP acontece NA CONEXAO (lookup), o que impede DNS rebinding. */
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 15000 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 15000 }),
};

/* Imagens (capas/logos) ficam num grupo à parte e pequeno: nunca tomam as conexões do vídeo */
const imgAgents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 4, maxTotalSockets: 8, keepAliveMsecs: 15000 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 4, maxTotalSockets: 8, keepAliveMsecs: 15000 }),
};

function v4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
function isPrivateIp(ip) {
  if (!ip) return true;
  ip = String(ip).toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+|[\da-f]{1,4}:[\da-f]{1,4})$/);
  if (mapped) {
    if (mapped[1].includes('.')) return v4Private(mapped[1]);
    const [high, low] = mapped[1].split(':').map((part) => parseInt(part, 16));
    return v4Private(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (net.isIPv4(ip)) return v4Private(ip);
  if (net.isIPv6(ip)) {
    const halves = ip.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const parts = halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
      : left;
    if (parts.length === 8 && parts.slice(0, 5).every((part) => parseInt(part, 16) === 0) && parseInt(parts[5], 16) === 0xffff) {
      const high = parseInt(parts[6], 16), low = parseInt(parts[7], 16);
      return v4Private(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  }
  return true;
}

/* Cache curto de DNS: cada canal/trecho novo não precisa perguntar o endereço de novo (ajuda PC e internet lentos).
   O filtro de endereços locais/privados continua sendo aplicado a CADA conexão, mesmo com cache. */
const dnsCache = new Map();
const DNS_TTL = 10 * 60 * 1000;   /* vale por 10 minutos */
const DNS_STALE = 60 * 60 * 1000; /* vencido ate 1 hora: usa o antigo na hora e renova por tras (nunca deixa o video esperando o DNS) */
const dnsWait = new Map();
function dnsFresh(host, cb) {
  let w = dnsWait.get(host);
  if (!w) {
    w = [];
    dnsWait.set(host, w);
    dns.lookup(host, { all: true, verbatim: true }, (err, list) => {
      dnsWait.delete(host);
      if (!err && list && list.length) {
        if (dnsCache.size > 500) dnsCache.delete(dnsCache.keys().next().value);
        dnsCache.set(host, { list, exp: Date.now() + DNS_TTL });
      }
      for (const f of w) f(err, list);
    });
  }
  w.push(cb);
}
function resolveAll(host, cb) {
  const c = dnsCache.get(host);
  if (c) {
    if (c.exp > Date.now()) return cb(null, c.list);
    if (Date.now() - c.exp < DNS_STALE) { dnsFresh(host, () => {}); return cb(null, c.list); }
  }
  dnsFresh(host, cb);
}

function makeLookup(allowPrivate) {
  return (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    resolveAll(host, (err, list) => {
      if (err) return cb(err);
      const ok = (list || []).filter((a) => allowPrivate || !isPrivateIp(a.address));
      if (!ok.length) {
        const e = new Error('blocked'); e.code = 'EBLOCKED'; return cb(e);
      }
      ok.sort((x, y) => x.family - y.family); /* IPv4 primeiro: evita esperar um IPv6 que nao responde */
      if (opts && opts.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
}

/* O Electron manda um nome proprio ("Electron" / "asc-desk"). Muitos servidores IPTV e protecoes (Cloudflare) recusam esse nome.
   Por isso, se vier nome de Electron/do app, usamos o de um Chrome comum. */
function cleanUA(ua) {
  if (!ua || /electron|asc-desk|ascdesk/i.test(ua)) return UA;
  return ua;
}

function pick(h, name) {
  if (!h) return undefined;
  for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
  return undefined;
}

/* Abre o endereco seguindo redirecionamentos (ate 6). Devolve {status, message, headers, finalUrl, body} ou {error:<http>} */
async function open(target, inHeaders, opt = {}) {
  const allowPrivate = !!opt.allowPrivate;
  const timeout = opt.timeout || 15000;
  const lookup = makeLookup(allowPrivate);
  let url;
  try { url = new URL(target); } catch { return { error: 400 }; }
  let retried = false;
  for (let i = 0; i < 7; i++) {
    if (opt.signal && opt.signal.aborted) return { error: 499 };
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 400 };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host) return { error: 400 };
    if (net.isIP(host) && !allowPrivate && isPrivateIp(host)) return { error: 403 };
    const headers = {
      'User-Agent': cleanUA(pick(inHeaders, 'user-agent')),
      'Accept': pick(inHeaders, 'accept') || '*/*',
      'Accept-Encoding': 'identity',
    };
    const rg = pick(inHeaders, 'range');
    if (rg) headers.Range = rg;
    const lib = url.protocol === 'https:' ? https : http;
    let res;
    try {
      res = await new Promise((resolve, reject) => {
        const req = lib.request(url, { method: 'GET', headers, lookup, agent: (opt.image ? imgAgents : agents)[url.protocol] }, (r) => { req.removeAllListeners('timeout'); resolve(r); });
        req.setTimeout(timeout, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
        req.on('error', reject);
        if (opt.signal) opt.signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('abort'), { code: 'EABORT' })), { once: true });
        req.end();
      });
    } catch (e) {
      const code = (e && e.code) || 'ERR';
      if (code === 'EABORT' || (opt.signal && opt.signal.aborted)) return { error: 499, code };
      /* conexao reaproveitada que o servidor ja tinha fechado: tenta de novo uma vez, com conexao nova */
      if (!retried && (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED')) { retried = true; i--; continue; }
      return { error: code === 'EBLOCKED' ? 403 : code === 'ETIMEDOUT' ? 504 : 502, code };
    }
    const sc = res.statusCode;
    if (sc >= 300 && sc < 400 && sc !== 304 && res.headers.location) {
      res.resume();
      try { url = new URL(res.headers.location, url); } catch { return { error: 502 }; }
      continue;
    }
    /* so derruba se o servidor parou de enviar; se foi o app que pausou a leitura (buffer cheio), nao */
    res.setTimeout(45000, () => { if (res.isPaused() || res.readableLength > 0) return; res.destroy(); });
    if (opt.signal) opt.signal.addEventListener('abort', () => res.destroy(), { once: true }); /* fecha o canal antigo na hora (servidores com 1 conexao por login) */
    return { status: sc, message: res.statusMessage || '', headers: res.headers, finalUrl: url.toString(), body: res };
  }
  return { error: 508 };
}

const NOBODY = new Set([101, 204, 205, 304]);
const VOD_AHEAD = 12 * 1024 * 1024; /* filmes e series: le ate 12 MB na frente */
/* Ao vivo (sem tamanho conhecido): guarda até 16 MB na frente (~30 s de vídeo). Se a tela do PC demorar para ler
   (PC fraco ocupado), o servidor continua sendo atendido: servidores IPTV cortam ou pulam dados de quem lê devagar,
   e dado pulado no meio do vídeo vira erro de decodificação. */
const LIVE_AHEAD = 16 * 1024 * 1024;
/* Converte o resultado de open() em Response (API web) para o protocolo do Electron */
function toResponse(r, Readable) {
  const H = {};
  if (r.error) {
    /* X-Err: motivo tecnico da falha (ex.: ECONNRESET, ETIMEDOUT, ENOTFOUND); a tela "Informacoes do canal" mostra */
    return new Response(null, { status: r.error, headers: { 'Cache-Control': 'no-store', 'X-Err': String(r.code || '') } });
  }
  const h = r.headers;
  H['Content-Type'] = h['content-type'] || 'application/octet-stream';
  if (h['content-length']) H['Content-Length'] = h['content-length'];
  if (h['content-range']) H['Content-Range'] = h['content-range'];
  if (h['accept-ranges']) H['Accept-Ranges'] = h['accept-ranges'];
  H['X-Final-Url'] = r.finalUrl; /* o hls.js usa para montar os trechos depois de redirecionamentos */
  const img = /^image\//i.test(H['Content-Type']);
  H['Cache-Control'] = img && r.status === 200 ? 'public, max-age=604800' : 'no-store';
  if (NOBODY.has(r.status)) { r.body.resume(); return new Response(null, { status: r.status === 304 ? 200 : r.status, headers: H }); }
  const status = r.status < 200 || r.status > 599 ? 200 : r.status;
  if (status === 206 || H['Content-Range']) H['Accept-Ranges'] = H['Accept-Ranges'] || 'bytes';
  const len = Number(h['content-length']) || 0;
  const ahead = status === 206 || len > 2e6 ? VOD_AHEAD : LIVE_AHEAD;
  const body = Readable.toWeb(r.body, { strategy: { highWaterMark: ahead, size: (c) => c.byteLength } });
  return new Response(body, { status, statusText: r.message, headers: H });
}

module.exports = { open, toResponse, isPrivateIp, makeLookup, cleanUA };
