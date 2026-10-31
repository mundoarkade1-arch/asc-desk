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
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return v4Private(m[1]);
  if (net.isIPv4(ip)) return v4Private(ip);
  if (net.isIPv6(ip)) {
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  }
  return true;
}

function makeLookup(allowPrivate) {
  return (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    dns.lookup(host, { all: true, verbatim: true }, (err, list) => {
      if (err) return cb(err);
      const ok = (list || []).filter((a) => allowPrivate || !isPrivateIp(a.address));
      if (!ok.length) {
        const e = new Error('blocked'); e.code = 'EBLOCKED'; return cb(e);
      }
      if (opts && opts.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
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
  for (let i = 0; i < 7; i++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 400 };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host) return { error: 400 };
    if (net.isIP(host) && !allowPrivate && isPrivateIp(host)) return { error: 403 };
    const headers = {
      'User-Agent': pick(inHeaders, 'user-agent') || UA,
      'Accept': pick(inHeaders, 'accept') || '*/*',
      'Accept-Encoding': 'identity',
    };
    const rg = pick(inHeaders, 'range');
    if (rg) headers.Range = rg;
    const lib = url.protocol === 'https:' ? https : http;
    let res;
    try {
      res = await new Promise((resolve, reject) => {
        const req = lib.request(url, { method: 'GET', headers, lookup, agent: agents[url.protocol] }, resolve);
        req.setTimeout(timeout, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
        req.on('error', reject);
        if (opt.signal) opt.signal.addEventListener('abort', () => req.destroy(), { once: true });
        req.end();
      });
    } catch (e) {
      return { error: e && e.code === 'EBLOCKED' ? 403 : e && e.code === 'ETIMEDOUT' ? 504 : 502 };
    }
    const sc = res.statusCode;
    if (sc >= 300 && sc < 400 && sc !== 304 && res.headers.location) {
      res.resume();
      try { url = new URL(res.headers.location, url); } catch { return { error: 502 }; }
      continue;
    }
    res.setTimeout(45000, () => res.destroy());
    return { status: sc, message: res.statusMessage || '', headers: res.headers, finalUrl: url.toString(), body: res };
  }
  return { error: 508 };
}

const NOBODY = new Set([101, 204, 205, 304]);
/* Converte o resultado de open() em Response (API web) para o protocolo do Electron */
function toResponse(r, Readable) {
  const H = {};
  if (r.error) {
    return new Response(null, { status: r.error, headers: { 'Cache-Control': 'no-store' } });
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
  return new Response(Readable.toWeb(r.body), { status, statusText: r.message, headers: H });
}

module.exports = { open, toResponse, isPrivateIp, makeLookup };
