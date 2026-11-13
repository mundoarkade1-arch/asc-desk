
const $=s=>document.querySelector(s),LS=localStorage,V=$('#v'),G=$('#grid'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jg=(k,d)=>{try{return JSON.parse(LS[k])||d}catch{return d}};
const S={dev:LS.asc_dev,items:[],by:{tv:[],movie:[],series:[]},hasE:0,tab:'home',rails:{},rt:null,cat:'Todos',q:'',epg:{},al:{},fav:[],view:[],pos:0,adOk:''};
let DBP;const db=()=>DBP||(DBP=new Promise((res,rej)=>{const q=indexedDB.open('asc',1);q.onupgradeneeded=()=>q.result.createObjectStore('k');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
const kv=async(m,k,v)=>{const d=await db();return new Promise((res,rej)=>{const o=d.transaction('k',m=='get'?'readonly':'readwrite').objectStore('k'),q=m=='get'?o.get(k):m=='del'?o.delete(k):o.put(v,k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})};
/* fetch com limite de tempo, sem cookies e sem referer */
/* No app (APK) toda rede passa pelo proxy nativo (/__p): streaming direto, sem bloqueio de CORS e sem a ponte pesada do plugin */
const PX=u=>{try{return nat()&&/^https?:\/\//i.test(u)?'/__p?u='+encodeURIComponent(u):u}catch{return u}};
/* Capas e logos passam pelo serviço de imagens do app: chegam reduzidas e ficam em cache no disco */
const PI=(u,w)=>{try{return nat()&&/^https?:\/\//i.test(u)?'/__i?u='+encodeURIComponent(u)+'&w='+w:u}catch{return u}};
const tf=(u,ms=20000)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);return fetch(PX(u),{signal:c.signal,credentials:'omit',referrerPolicy:'no-referrer'}).finally(()=>clearTimeout(t))};
const okU=u=>{try{return /^https?:$/.test(new URL(u).protocol)}catch{return false}};
const sl=u=>/^https?:\/\//i.test(u)?u:'';
/* Tamanho maximo de lista (caracteres/bytes). 250 MB cobre listas enormes (centenas de milhares de itens) e fica abaixo do limite de texto do WebView de 32 bits (~268 milhoes de caracteres). */
const LMAX=2.5e8;
const uid=()=>[...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('');

/* ---------- Cofre: tudo que e sensivel (listas, logins, links, favoritos, progresso) fica CRIPTOGRAFADO (AES-GCM).
   A chave do cofre fica protegida pelo Android Keystore (hardware, quando o aparelho tem). ---------- */
const b64e=u=>btoa(String.fromCharCode(...u)),b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
/* Chamada nativa com limite de tempo: se o Android nao responder, nunca deixa o app esperando para sempre */
const tmo=(p,ms)=>Promise.race([Promise.resolve(p),new Promise((_,rj)=>setTimeout(()=>rj(new Error('timeout')),ms))]);
/* Modo do cofre fica fixo: asc_dm='n' (chave protegida pelo Android Keystore) ou 'w' (chave do WebView). */
let DKP;const dek=()=>DKP||(DKP=(async()=>{const N=plug('Secure');
 const web=async()=>{let k=await kv('get','dek');if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await kv('put','dek',k)}return k};
 if(!(N&&nat())||LS.asc_dm=='w')return web();
 let raw,lost=false;
 if(LS.asc_dk){try{raw=b64d((await tmo(N.unwrap({data:LS.asc_dk}),6000)).data)}
  catch(e){if(e&&e.message=='timeout')throw e;lost=true}}   /* timeout: tenta de novo depois, sem apagar nada */
 if(!raw){/* primeira vez (ou chave do Keystore perdida): cria chave nova */
  try{const r=crypto.getRandomValues(new Uint8Array(32));LS.asc_dk=(await tmo(N.wrap({data:b64e(r)}),6000)).data;LS.asc_dm='n';raw=r}
  catch{if(lost)throw new Error('keystore');LS.removeItem('asc_dk');LS.asc_dm='w';return web()}}   /* Keystore ruim neste aparelho: usa o modo web */
 const k=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);raw.fill(0);return k})().catch(e=>{DKP=null;throw e}));
async function cEnc(str){const k=await dek(),iv=crypto.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(str))),o=new Uint8Array(12+ct.length);o.set(iv);o.set(ct,12);return o.buffer}
async function cDec(buf){try{const k=await dek(),u=new Uint8Array(buf);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12)},k,u.slice(12)))}catch{return null}}
const vs=async(k,v)=>kv('put','v:'+k,await cEnc(JSON.stringify(v)));
const vg=async k=>{try{const b=await kv('get','v:'+k);if(!b)return null;const t=await cDec(b);return t==null?null:JSON.parse(t)}catch{return null}};
const plGet=async id=>{try{const b=await kv('get','pl:'+id);return b?await cDec(b):null}catch{return null}};
let LST={act:'',l:[]};const ST={pos:{},last:{}},PIN={on:false,h:'',s:'',f:0,u:0},PAR={on:false,h:'',s:'',f:0,u:0};
const CL=()=>LST.l.find(x=>x.id==LST.act)||{};
const saveL=()=>vs('lists',LST);
let sst=0;const stNow=()=>{clearTimeout(sst);return vs('state',{fav:S.fav,pos:ST.pos,last:ST.last})},saveState=()=>{clearTimeout(sst);sst=setTimeout(stNow,2000)};
async function loadVault(){const l=await vg('lists');if(l&&Array.isArray(l.l))LST=l;const s=await vg('state');if(s){S.fav=s.fav||[];ST.pos=s.pos||{};ST.last=s.last||{}}const p=await vg('pin');if(p)Object.assign(PIN,p);const q2=await vg('par');if(q2)Object.assign(PAR,q2)}
/* Dados de versoes antigas (texto puro) sao migrados para o cofre e apagados */
async function migrate(){let old;try{old=await kv('get','pl')}catch{}
 if(!LST.l.length&&old){const id=uid();LST.l.push({id,n:'Minha lista',m:LS.asc_xu?'x':LS.asc_url?'m':'f',u:LS.asc_url||'',epg:LS.asc_epg||'',tvg:LS.asc_tvg||'',exp:+LS.asc_exp||0,expm:LS.asc_expm||''});LST.act=id;await kv('put','pl:'+id,await cEnc(old));await saveL()}
 if(old!==undefined)await kv('del','pl');
 if(LS.asc_fav||LS.asc_pos||LS.asc_last){S.fav=jg('asc_fav',[]);ST.pos=jg('asc_pos',{});ST.last=jg('asc_last',{});await stNow()}
 ['asc_url','asc_epg','asc_tvg','asc_exp','asc_expm','asc_renew','asc_xs','asc_xu','asc_xp','asc_fav','asc_pos','asc_last'].forEach(k=>LS.removeItem(k))}
async function wipeAll(){try{const N=plug('Secure');N&&nat()&&await tmo(N.reset(),3000)}catch{}
 try{(await db()).close()}catch{}
 try{await new Promise(r=>{const q=indexedDB.deleteDatabase('asc');q.onsuccess=q.onerror=q.onblocked=()=>r()})}catch{}
 try{LS.clear();sessionStorage.clear()}catch{}
 location.reload()}
const ACN={r:'Azul-gelo',v:'Lavanda',g:'Verde-água',o:'Areia'},ACC=()=>ACN[LS.asc_ac]?LS.asc_ac:'r';
const accApply=()=>document.documentElement.dataset.ac=ACC();accApply();
/* Modo leve: sem animações e sombras pesadas. Liga sozinho em PC com 4 núcleos ou menos / 4 GB ou menos, e dá para mudar em Ajustes */
const liteOn=()=>LS.asc_lite=='1'||(LS.asc_lite!='0'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4));
const liteApply=()=>document.documentElement.classList.toggle('lite',liteOn());liteApply();
const toast=(m,q)=>{document.querySelectorAll('#toast').forEach(x=>x.remove());const t=document.createElement('div');t.id='toast';if(q)t.className='q';t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),q?2200:4000)};
const show=id=>{window.__ascBooted=1;$('#boot').hidden=true;['add','app'].forEach(x=>$('#'+x).hidden=x!=id)};
const bootErr=m=>{if(window.__ascBooted)return console.warn(m);$('#boot').hidden=false;$('#bm').textContent='Erro: '+m;window.__ascRecovery&&window.__ascRecovery()};
addEventListener('unhandledrejection',e=>bootErr((e.reason&&e.reason.message)||e.reason));
addEventListener('error',e=>{if(e.target===window)bootErr(e.message)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- M3U ---------- */
const nz=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const EP=/\bS\d{1,2}\s?E\d{1,3}\b|\bT\d{1,2}\s?E\d{1,3}\b|\b\d{1,2}x\d{2,3}\b|temporada/i;
const kind=i=>{const u=i.u.split('?')[0].toLowerCase(),g=i.g.toLowerCase();
 if(/\/series\//.test(u))return 'series';if(/\/movie\//.test(u))return 'movie';if(/\/live\//.test(u))return 'tv';
 if(/\.(mp4|mkv|avi|mov|wmv|flv|mpg|mpeg|webm)$/.test(u))return EP.test(i.n)||/s[eé]ries?|novelas?|animes?|doramas?|temporada/.test(g)?'series':'movie';
 if(/\.(m3u8|ts)$/.test(u)||/rtmp|rtsp/.test(u))return 'tv';
 if(/canais|canal|24\s?h|ao vivo|live|\btv\b|esporte|abertos|not[ií]cias/.test(g))return 'tv';
 if(EP.test(i.n)||/s[eé]ries?|novelas?|animes?|doramas?/.test(g))return 'series';
 if(/filmes?|movies?|\bvod\b|cine|lan[cç]amentos?/.test(g))return 'movie';return 'tv'};
const title=n=>n.replace(/\s*[-–]?\s*(S|T)\d{1,2}\s?E\d{1,3}.*$|\s*[-–]?\s*\d{1,2}x\d{2,3}.*$/i,'').trim()||n;
const ADG=/(^|[^a-z0-9])(adult[oa]?s?|xxx|porn[oa]?|erotic[oa]s?|sex|sexy|hentai|playboy|18 ?\+|\+ ?18|18plus)($|[^a-z0-9])/,ADN=/(^|[^a-z0-9])(xxx|playboy|sextreme|penthouse|brazzers|hustler|porn[oa]?|hentai|sexy ?hot|\+ ?18|18 ?\+)($|[^a-z0-9])/;
const adCat=g=>ADG.test(nz(g||'')),adItem=i=>adCat(i.g)||ADN.test(nz(i.n||''));
const AT=/([\w-]+)="([^"]*)"/g,AK={'tvg-logo':'l','group-title':'g','tvg-id':'id','tvg-name':'tn','tvg-plot':'p','plot':'p2','tvg-description':'p3','description':'p4'};
async function parse(t){const out=[],tvg=(t.slice(0,2000).match(/(?:url-tvg|x-tvg-url)="([^",]+)/i)||[])[1],L=t.length;let cur=null,pos=0,cnt=0,yT=performance.now();
 while(pos<L){let e=t.indexOf('\n',pos);if(e<0)e=L;const ln=t.slice(pos,e).trim();pos=e+1;
  if((++cnt&511)==0&&performance.now()-yT>10){await sleep(0);yT=performance.now()}
  if(!ln)continue;
  if(ln.startsWith('#EXTINF')){const ci=ln.lastIndexOf(','),a={};let m;AT.lastIndex=0;const hd=ci>0?ln.slice(0,ci):ln;
   while((m=AT.exec(hd))){const k=AK[m[1].toLowerCase()];if(k)a[k]=m[2]}
   cur={n:ln.slice(ci+1).trim()||a.tn||'',l:sl(a.l||''),g:a.g||'Outros',id:a.id||'',p:a.p||a.p2||a.p3||a.p4||''}}
  else if(cur&&/^(https?|rtmp|rtsp):/i.test(ln)){cur.u=ln;cur.t=kind(cur);cur.k=nz(cur.n);cur.ad=adItem(cur)?1:0;out.push(cur);cur=null}}
 return{out,tvg}}
/* Lista já processada: guardada (criptografada) para o app abrir sem baixar/ler/processar tudo de novo.
   Troque PV se mudar a forma de processar a lista (kind, adItem, nz...) para o cache antigo ser ignorado. */
const PV=1;
async function fastList(id){try{const b=await kv('get','pi:'+id);if(!b)return false;const t=await cDec(b);if(!t)return false;const j=JSON.parse(t);
 if(!j||j.v!=PV||!Array.isArray(j.o)||!j.o.length)return false;CL().tvg=j.t||'';finish(j.o);return true}catch{return false}}
function putParsed(id,out,tvg){if(out.length>3e5)return;setTimeout(function w(){if(!P.hidden){setTimeout(w,15000);return}
 (async()=>{try{if(CL().id!=id)return;await kv('put','pi:'+id,await cEnc(JSON.stringify({v:PV,t:tvg||'',o:out})))}catch{}})()},5000)}
function finish(out){S.items=out;S.by={tv:[],movie:[],series:[]};for(const i of out)S.by[i.t].push(i);S.hasE=0;S._sg=null;S.cat='Todos';S.tab='home';S.epg={};S.al={};XS=null;show('app');nav();render();
 const e=epgUrl();if(e)setTimeout(()=>loadEPG(e),2000);setTimeout(acct,3000);expSync()}
async function useList(text,meta,cached){
 if(text.length>LMAX){$('#st').textContent='Lista grande demais (máximo de cerca de 250 MB).';return false}
 $('#st').textContent='Processando a lista…';const{out,tvg}=await parse(text);if(!out.length){$('#st').textContent='Nenhum canal encontrado. Confira se é uma lista M3U válida.';return false}
 if(meta){const i=LST.l.findIndex(x=>x.id==meta.id);if(i<0)LST.l.push(meta);else Object.assign(LST.l[i],meta);LST.act=meta.id}
 const l=CL();l.tvg=tvg||'';
 if(!cached)await kv('put','pl:'+l.id,await cEnc(text));
 await saveL();
 finish(out);putParsed(l.id,out,tvg);return true}

/* ---------- EPG (XMLTV) ---------- */
const dec=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
const ms=(d,z)=>{const o=z?(z[0]=='-'?-1:1)*(+z.slice(1,3)*60+ +z.slice(3,5))*6e4:0;return Date.UTC(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6,8),+d.slice(8,10),+d.slice(10,12),+d.slice(12,14))-o};
const nk=s=>nz(s).replace(/\b(fhd|uhd|hd|sd|4k|h265|hevc)\b/g,'').replace(/[^a-z0-9]/g,'');
/* Guia: link informado > xmltv.php do servidor (login/senha) > url-tvg da lista */
const xepg=()=>{try{const b=new URL(CL().u||''),u=b.searchParams.get('username'),p=b.searchParams.get('password');if(u&&p)return`${b.origin}/xmltv.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`}catch{}};
const epgUrl=()=>CL().epg||xepg()||CL().tvg||'';
async function loadEPG(url,manual){try{const r=await tf(url,6e4);if(!r.ok)throw 0;
  /* Lê o guia aos pedaços (sem carregar o arquivo inteiro na memória) e guarda só os canais que existem na sua lista */
  let body=r.body;if(/\.gz(\?|$)/i.test(url)&&window.DecompressionStream)body=body.pipeThrough(new DecompressionStream('gzip'));
  const rd=body.pipeThrough(new TextDecoderStream()).getReader();
  const now=Date.now(),lim=now+12*36e5,E={},A={};let buf='',W=null,yT=performance.now();
  const want=()=>W||(W=(()=>{const w=new Set();for(const i of S.by.tv){const id=(i.id||'').toLowerCase();if(id)w.add(id);const a=A[i.n.toLowerCase()]||A[nk(i.n)];if(a)w.add(a)}return w})());
  const RX=/<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>|<programme\s([^>]*)>([\s\S]*?)<\/programme>/g;
  for(;;){const{done,value}=await rd.read();if(value)buf+=value;
   RX.lastIndex=0;let m,end=0,nn=0;
   while((m=RX.exec(buf))){end=RX.lastIndex;
    if(m[1]!=null){const id=dec(m[1]).toLowerCase();A[id]=id;
     for(const n of m[2].matchAll(/<display-name[^>]*>([^<]+)/g)){const d=dec(n[1]).trim();A[d.toLowerCase()]=id;A[nk(d)]=id}}
    else{const a=m[3],ch=a.match(/channel="([^"]*)"/);if(ch){const cid=dec(ch[1]).toLowerCase();
     if(want().has(cid)){const st=a.match(/start="(\d{14})\s?([+-]\d{4})?"/),sp=a.match(/stop="(\d{14})\s?([+-]\d{4})?"/),
      ti=m[4].match(/<title[^>]*>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))/);
      if(st&&sp&&ti){const s=ms(st[1],st[2]),e=ms(sp[1],sp[2]);if(e>=now&&s<=lim)(E[cid]||=[]).push({s,e,t:dec(ti[1]!=null?ti[1]:ti[2]||'').trim()})}}}}
    if(++nn%100==0&&performance.now()-yT>10){await sleep(0);yT=performance.now()}}
   buf=buf.slice(end);if(done)break;await sleep(0)}
  for(const k in E)E[k].sort((a,b)=>a.s-b.s);
  S.epg=E;S.al=A;S.hasE=Object.keys(E).length?1:0;fillNow();if(!P.hidden&&cur&&live())epgBar();
  if(manual)toast(Object.keys(E).length?'Guia atualizado':'O guia veio vazio ou fora do horário.',1)}
 catch{if(manual)toast('Não foi possível carregar o guia de programação (bloqueio do servidor ou link inválido).')}}
function epgOf(it){const l=S.epg[(it.id||'').toLowerCase()]||S.epg[S.al[it.n.toLowerCase()]]||S.epg[S.al[nk(it.n)]];if(!l)return null;const n=Date.now();
 const i=l.findIndex(p=>p.s<=n&&n<p.e);return i<0?null:{p:l[i],nx:l[i+1]}}
const hm=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
function fillNow(from){if(!S.hasE)return;const one=c=>{if(!c.classList.contains('tv'))return;const el=c.querySelector('.now');if(!el)return;const it=itemOf(c),x=it&&epgOf(it);el.textContent=x?x.p.t:''};
 if(from==null)document.querySelectorAll('.card.tv').forEach(one);else for(let k=from;k<G.children.length;k++)one(G.children[k])}

/* ---------- Lista ---------- */
function grp(a){const m=new Map();for(const i of a){const k=i.tt||(i.tt=title(i.n));if(!m.has(k))m.set(k,{n:k,l:i.l,g:i.g,t:'series',eps:[],ad:0});const z=m.get(k);z.eps.push(i);if(i.ad)z.ad=1}return[...m.values()]}
/* Controle parental: com ele ativo, item adulto so aparece dentro da categoria liberada com a senha; na busca nunca aparece */
const vis=i=>!(PAR.on&&i.ad&&!(S.adOk&&i.g==S.adOk)),hidA=i=>!(PAR.on&&i.ad);
const sq=()=>{const q=nz(S.q.trim());return q.length<2?'':q}; /* 1 letra só não busca: evita varrer a lista inteira a cada tecla */
function view(){const q=sq();
 if(S.adOk&&(S.cat!=S.adOk||S.tab=='home'||S.tab=='fav'))S.adOk='';
 if(S.tab=='home'){if(!q)return[];const r=S.items.filter(i=>i.k.includes(q)&&hidA(i));return[...r.filter(i=>i.t!='series'),...grp(r.filter(i=>i.t=='series'))]}
 if(S.tab=='fav'){const FS=new Set(S.fav);let f=[...S.by.tv.filter(i=>FS.has(i.u)),...S.by.movie.filter(i=>FS.has(i.u)),...sgrp().filter(g=>S.fav.includes('S:'+g.n))].filter(vis);if(q)f=f.filter(i=>nz(i.n).includes(q));return f}
 let a=S.by[S.tab]||[];
 if(q)a=a.filter(i=>i.k.includes(q)&&hidA(i));else{if(S.cat!='Todos')a=a.filter(i=>i.g==S.cat);a=a.filter(vis)}
 if(S.tab=='series')a=(q||S.cat!='Todos')?grp(a):sgrp().filter(vis);return a}
const card=(i,k,r)=>`<div class="card ${i.t=='tv'?'tv':''}" tabindex="0" data-i="${k}"${r?` data-r="${r}"`:''}><div class="im"><span class="pi">${esc(i.n[0]||'?')}</span>${i.l?`<img loading="lazy" decoding="async" alt="" src="${esc(PI(i.l,i.t=='tv'?200:320))}">`:''}</div><b>${esc(i.n)}</b>${i.t=='tv'?'<small class="now"></small>':''}</div>`;
const itemOf=c=>c.dataset.r?(S.rails[c.dataset.r]||[])[c.dataset.i]:S.view[c.dataset.i];
function nav(){document.querySelectorAll('nav [data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t==S.tab));
 const dd=S.tab=='tv'||S.tab=='movie'||S.tab=='series';$('#catb').hidden=!dd;$('#cl').textContent=S.cat=='Todos'?'Todas as categorias':S.cat}
function render(){S.view=view();S.pos=0;G.innerHTML='';$('#main').scrollTop=0;
 const ih=S.tab=='home'&&!sq();G.hidden=ih;$('#main').classList.toggle('hm',ih);$('#home').hidden=!ih;if(ih)return home();
 if(!S.view.length)G.innerHTML='<div class="empty">Nada por aqui ainda.</div>';else more()}
function more(){if(S.pos>=S.view.length)return;const e=Math.min(S.pos+(liteOn()?30:60),S.view.length);let h='';for(let k=S.pos;k<e;k++)h+=card(S.view[k],k);S.pos=e;const n0=G.children.length;G.insertAdjacentHTML('beforeend',h);fillNow(n0)}
new IntersectionObserver(e=>e[0].isIntersecting&&more(),{rootMargin:'600px'}).observe($('#more'));

/* ---------- Início: favoritos, ao vivo, filmes e séries ---------- */
const sgrp=()=>S._sg||(S._sg=grp(S.by.series));
function ccNames(){const g=[...new Set(S.by.tv.map(i=>i.g))],sel=LS.asc_cc;
 if(sel&&sel!='auto'&&g.includes(sel))return[sel];
 let m=g.filter(x=>/cliente/i.test(x));if(!m.length)m=g.filter(x=>/jogos?\b|jogo do dia|eventos?|ppv|futebol/i.test(x));return m}
const clientCh=()=>{const n=ccNames(),o=[];for(const i of S.by.tv){if(n.includes(i.g)&&vis(i)){o.push(i);if(o.length>=80)break}}return o};
const favItems=()=>{const FS=new Set(S.fav);return{tv:S.by.tv.filter(i=>FS.has(i.u)&&vis(i)),movie:S.by.movie.filter(i=>FS.has(i.u)&&vis(i)),series:sgrp().filter(g=>FS.has('S:'+g.n)&&vis(g))}};
const vmCard=go=>`<div class="card vm" tabindex="0" data-go="${go}"><svg class="i" style="transform:rotate(-90deg)"><use href="#chev"/></svg>Ver mais</div>`;
const rail=(id,l,go)=>`<div class="rw"><button class="rb l" aria-label="Anterior" tabindex="-1">‹</button><div class="rail">${l.map((x,k)=>card(x,k,id)).join('')}${go?vmCard(go):''}</div><button class="rb r" aria-label="Próximo" tabindex="-1">›</button></div>`;
function home(){const ct=S.items.filter(i=>i.t!='tv'&&vis(i)&&isPart(i.u)).slice(0,20),t=S.by.tv.filter(vis),c=clientCh().slice(0,10),cs=new Set(c),lv=[...c];for(let k=0;k<t.length&&lv.length<20;k++)if(!cs.has(t[k]))lv.push(t[k]);
 const mv=S.by.movie.filter(vis),sg=sgrp().filter(vis),F=favItems(),
 ft=[['tv','Canais'],['movie','Filmes'],['series','Séries']].filter(([k])=>F[k].length);
 S.rails={tv:lv,movie:mv.slice(0,20),series:sg.slice(0,20),ct};ft.forEach(([k])=>S.rails['f'+k]=F[k]);
 let h=reco()+(ct.length?`<section class="sec"><div class="sx"><h2>Continuar assistindo</h2></div>${rail('ct',ct)}</section>`:'');
 h+=ft.length?`<section class="sec"><div class="sx"><h2>Favoritos</h2><button class="chip" data-go="fav">Ver tudo ›</button></div>`+ft.map(([k,n])=>`<div class="sub"><small>${n}</small>${rail('f'+k,F[k])}</div>`).join('')+'</section>'
  :'';
 h+=[['tv','Ao vivo',lv,t.length],['movie','Filmes',S.rails.movie,mv.length],['series','Séries',S.rails.series,sg.length]]
  .map(([k,n,l,tot])=>l.length?`<section class="sec"><div class="sx"><h2>${n}</h2><button class="chip" data-go="${k}">Ver mais ›</button></div>${rail(k,l,tot>l.length?k:'')}</section>`:'').join('');
 $('#home').innerHTML=h;fillNow();rcArm();setTimeout(()=>rcLoad(1),1500)}
/* ---------- Carrossel de indicações: 5 sugestões do dia, tiradas da sua lista ---------- */
const RCT={movie:'Filme',series:'Série',tv:'Ao vivo'};
function pickReco(){let sd=(Math.floor(Date.now()/864e5)*2654435761)%4294967296||1;const rnd=()=>(sd=(sd*1664525+1013904223)%4294967296)/4294967296;
 const sf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const mv=sf(S.by.movie.filter(i=>i.l&&vis(i))),sg=sf(sgrp().filter(i=>i.l&&vis(i))),tv=sf(S.by.tv.filter(i=>i.l&&vis(i))),out=[],seen=new Set();
 const add=i=>{if(!i||out.length>=5)return;const k=nz(title(i.n));if(seen.has(k))return;seen.add(k);out.push(i)};
 for(let k=0;k<3;k++){add(mv[k]);add(sg[k])}
 for(const i of[...mv,...sg,...tv])add(i);
 for(const i of[...S.by.movie,...sgrp(),...S.by.tv])if(vis(i))add(i);
 return out}
function reco(){const L=S.reco=pickReco(),lt=liteOn();S.rc={i:0};if(!L.length)return'';
 const sl=L.map((it,k)=>{const t=it.eps?'series':it.t,tv=t=='tv',sub=[RCT[t],it.g,t=='series'&&it.eps?it.eps.length+(it.eps.length==1?' episódio':' episódios'):''].filter(Boolean).join(' • ');
  const sa=k?'data-s':'src',u6=it.l?esc(PI(it.l,640)):'',im=it.l?(lt?'':`<img class="rbg" alt="" ${sa}="${u6}">`)+`<img class="rpo${tv?' lg':''}" alt="" ${sa}="${u6}">`:`<span class="rpi">${esc(it.n[0]||'?')}</span>`;
  return`<div class="rs${k?'':' on'}">${im}<div class="rtx"><small>Indicação ${k+1} de ${L.length}</small><h1>${esc(it.n)}</h1><p>${esc(sub)}</p><div class="row"><button class="btn p" data-rp="${k}"><svg class="i"><use href="#${tv?'play':'ilist'}"/></svg>${tv?'Assistir ao vivo':'Ver detalhes'}</button></div></div></div>`}).join('');
 return`<section class="rc" id="rc" aria-label="Indicações para você">${sl}<button class="rn l" data-ra="-1" aria-label="Anterior">‹</button><button class="rn r" data-ra="1" aria-label="Próxima">›</button><div class="rdt">${L.map((_,k)=>`<button class="rd${k?'':' on'}" data-rd="${k}" aria-label="Indicação ${k+1}"><i></i></button>`).join('')}</div></section>`}
let rcT;
function rcArm(){clearTimeout(rcT);if(!S.rc||S.rc.hold)return;
 rcT=setTimeout(function t(){if(!S.rc||S.rc.hold||!$('#rc')||$('#home').hidden)return;if(document.hidden||!P.hidden||!$('#sheet').hidden){rcT=setTimeout(t,1000);return}rcGo(S.rc.i+1)},5000)}
function rcHold(on){if(!S.rc)return;S.rc.hold=!!on;const r=$('#rc');r&&r.classList.toggle('hold',!!on);on?clearTimeout(rcT):rcArm()}
const rcLoad=n=>{const L=S.reco||[];if(!L.length)return;const e=document.querySelectorAll('#rc .rs')[((n%L.length)+L.length)%L.length];e&&e.querySelectorAll('img[data-s]').forEach(m=>{m.src=m.dataset.s;m.removeAttribute('data-s')})};
function rcGo(n){const L=S.reco||[];if(!L.length||!S.rc)return;const i=((n%L.length)+L.length)%L.length;S.rc.i=i;rcLoad(i);rcLoad(i+1);
 document.querySelectorAll('#rc .rs').forEach((e,k)=>e.classList.toggle('on',k==i));
 document.querySelectorAll('#rc .rd').forEach((d,k)=>{d.classList.remove('on');if(k==i){void d.offsetWidth;d.classList.add('on')}});rcArm()}
function pickCC(){const g=[...new Set(S.by.tv.map(i=>i.g))];
 sh('<b>Categoria do Canal do cliente</b><button class="btn" data-g="auto">Automático</button>'+g.map(x=>`<button class="btn" data-g="${esc(x)}">${esc(x)}</button>`).join(''));
 $('#sh').onclick=e=>{const b=e.target.closest('[data-g]');if(b){LS.asc_cc=b.dataset.g;$('#sheet').hidden=true;refresh()}}}
const refresh=()=>{if(S.tab=='home'&&!S.q.trim())home();else if(S.tab=='fav')render()};
const H=$('#home');
H.onclick=e=>{if(S.rc&&S.rc.hold&&!e.target.closest('#rc'))rcHold(false);
 const rd=e.target.closest('[data-rd]');if(rd){if(+rd.dataset.rd==S.rc.i)return rcHold(true);rcHold(false);return rcGo(+rd.dataset.rd)}
 const ra=e.target.closest('[data-ra]');if(ra){rcHold(false);return rcGo(S.rc.i+ +ra.dataset.ra)}
 const rp=e.target.closest('[data-rp]');if(rp){const it=(S.reco||[])[rp.dataset.rp];rcHold(true);return it&&openIt(it,[it])}
 if(e.target.closest('#rc .rs'))return rcHold(true);
 const g=e.target.closest('[data-go]');if(g){S.tab=g.dataset.go;S.cat=g.dataset.cat||'Todos';nav();render();return}
 if(e.target.closest('#pickcc'))return pickCC();
 const rb=e.target.closest('.rb');if(rb){const r=rb.parentElement.querySelector('.rail');r.scrollBy({left:(rb.classList.contains('l')?-1:1)*r.clientWidth*.85,behavior:'smooth'});return}
 const c=e.target.closest('.card');if(c){const l=S.rails[c.dataset.r]||[];openIt(l[c.dataset.i],l)}};
H.addEventListener('keydown',e=>{if(e.key=='Enter'&&e.target.classList.contains('card'))e.target.click()});

document.querySelectorAll('nav [data-t]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;S.cat='Todos';nav();render()});
let qt;$('#q').oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{S.q=e.target.value;render()},250)};
/* Clicou em qualquer coisa fora dos resultados da busca: apaga o texto da busca (evita aparecer "nada encontrado" por causa de uma busca esquecida) */
document.addEventListener('click',e=>{if(!S.q&&!$('#q').value)return;if(e.target.closest('#grid,#q,#sheet,#player,#lock,#tip,#toast,#blk'))return;
 clearTimeout(qt);S.q='';$('#q').value='';if(!e.target.closest('nav [data-t],[data-go]'))render()},true);
const openIt=(it,l)=>it&&(it.eps?eps(it):it.t=='tv'?play(it,l.filter(x=>x.t=='tv')):info(it));
G.onclick=e=>{const c=e.target.closest('.card');if(c)openIt(S.view[c.dataset.i],S.view)};
G.addEventListener('keydown',e=>{if(e.key=='Enter'&&e.target.classList.contains('card'))e.target.click()});

/* EPG ao passar o mouse / focar (TV) */
const tip=$('#tip');
function tipOn(e){const c=e.target.closest&&e.target.closest('.card.tv');if(!c)return;const it=itemOf(c);if(!it)return;const x=epgOf(it);
 tip.innerHTML=`<b>${esc(it.n)}</b>`+(x?`<div>${esc(x.p.t)}</div><div class="bar"><i style="width:${Math.min(100,(Date.now()-x.p.s)/(x.p.e-x.p.s)*100)}%"></i></div><small>${hm(x.p.s)} – ${hm(x.p.e)}</small>${x.nx?`<div style="color:var(--m);margin-top:.4em">A seguir: ${esc(x.nx.t)} (${hm(x.nx.s)})</div>`:''}`:'<div style="color:var(--m)">Programação indisponível</div>');
 const r=c.getBoundingClientRect();tip.hidden=false;tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';
 tip.style.top=(r.bottom+tip.offsetHeight+8>innerHeight?Math.max(8,r.top-tip.offsetHeight-8):r.bottom+8)+'px'}
const MN=$('#main');MN.addEventListener('pointerover',e=>e.pointerType=='mouse'&&tipOn(e));MN.addEventListener('focusin',tipOn);
MN.addEventListener('pointerout',()=>tip.hidden=true);MN.addEventListener('focusout',()=>tip.hidden=true);

/* ---------- Sheets ---------- */
const sh=h=>{$('#sh').onclick=null;$('#sh').innerHTML=h;$('#sheet').hidden=false;const f=$('#sh button');f&&f.focus()};
$('#sheet').onclick=e=>{if(e.target.id=='sheet')$('#sheet').hidden=true};
const fav=u=>{const i=S.fav.indexOf(u);i<0?S.fav.push(u):S.fav.splice(i,1);saveState();return i<0};
const xapi=()=>{try{const b=new URL(CL().u||''),u=b.searchParams.get('username'),p=b.searchParams.get('password');if(u&&p)return`${b.origin}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`}catch{}};
let XS;const gs=()=>XS=XS||tf(xapi()+'&action=get_series',6e4).then(r=>r.json()).then(l=>{const m=new Map();for(const x of l)m.set(nz(title(x.name||'')),x);return m}).catch(e=>{XS=null;throw e});
async function meta(it,isS){const A=xapi();if(!A)return;
 try{if(!isS){const id=(it.u.match(/\/movie\/[^/]+\/[^/]+\/(\d+)/)||[])[1];if(!id)return;const i=(await(await tf(A+'&action=get_vod_info&vod_id='+id)).json()).info||{};
   return{p:i.plot||i.description,m:[i.genre,(i.releasedate||'').slice(0,4),i.duration,i.rating&&'★ '+i.rating].filter(Boolean).join(' • ')}}
  const x=(await gs()).get(nz(it.n));return x&&{p:x.plot,m:[x.genre,(x.releaseDate||x.release_date||'').slice(0,4),x.rating&&'★ '+x.rating].filter(Boolean).join(' • ')}}catch{}}
const hdr=it=>`<div class="dt">${it.l?`<img src="${esc(PI(it.l,320))}" alt="">`:''}<div><b>${esc(it.n)}</b><small style="display:block;color:var(--m)">${esc(it.g)}</small><small id="my" style="color:var(--m)"></small><p class="sy" id="sy">${esc(it.p||'Sem sinopse disponível.')}</p></div></div>`;
async function fillMeta(it,s){const x=await meta(it,s);if(x&&$('#sy')){if(x.p)$('#sy').textContent=x.p;if(x.m)$('#my').textContent=x.m}}
/* progresso: asc_pos[u]={t,d,done}; asc_last[serie]=url do ultimo episodio visto */
const favK=it=>it.t=='series'?'S:'+(it.eps?it.n:title(it.n)):it.u;
const prog=u=>{const p=ST.pos[u];return typeof p=='number'?{t:p,d:0}:p||null};
const fin=p=>!!p&&p.d>0&&p.t/p.d>=.92;
const isPart=u=>{const p=prog(u);return !!p&&p.t>10&&!fin(p)};
const isDone=u=>{const p=prog(u);return !!p&&(!!p.done||fin(p))};
const epn=e=>{const m=e.n.match(/[ST]\d{1,2}\s?E(\d{1,3})/i)||e.n.match(/\d{1,2}x(\d{2,3})/);return m?+m[1]:0};
const seas=e=>+((e.n.match(/[ST](\d{1,2})\s?E/i)||e.n.match(/(\d{1,2})x\d/)||[])[1]||1);
function resume(it,list){const p=prog(it.u);if(!isPart(it.u))return play(it,list,0);
 sh(`<b>${esc(it.n)}</b><button class="btn p" id="r1">Continuar de ${fmt(p.t)}</button><button class="btn" id="r2">Assistir do começo</button>`);
 $('#r1').onclick=()=>{$('#sheet').hidden=true;play(it,list,p.t)};$('#r2').onclick=()=>{$('#sheet').hidden=true;play(it,list,0)}}
function info(it){const p=prog(it.u),rs=isPart(it.u),k=favK(it);
 sh(hdr(it)+(rs?`<button class="btn p" id="i1">Continuar de ${fmt(p.t)}</button><button class="btn" id="i3">Assistir do começo</button>`:`<button class="btn p" id="i1">Assistir</button>`)+`<button class="btn" id="i2">${S.fav.includes(k)?'Remover dos favoritos':'Adicionar aos favoritos'}</button>`);
 $('#i1').onclick=()=>{$('#sheet').hidden=true;play(it,[it],rs?p.t:0)};
 if(rs)$('#i3').onclick=()=>{$('#sheet').hidden=true;play(it,[it],0)};
 $('#i2').onclick=()=>{fav(k);$('#sheet').hidden=true;refresh()};fillMeta(it,0)}
function eps(s){const m={};for(const e of s.eps)(m[seas(e)]||=[]).push(e);
 const ks=Object.keys(m).map(Number).sort((a,b)=>a-b);ks.forEach(k=>m[k].sort((a,b)=>epn(a)-epn(b)));
 const flat=ks.flatMap(k=>m[k]),L=ST.last[s.n];let t=L&&flat.find(e=>e.u==L),nx=null;
 if(t&&isDone(t.u)&&!isPart(t.u)){const j=flat.indexOf(t)+1;if(flat[j]){t=flat[j];nx=t}}
 let cs=t?seas(t):ks[0];const fk=favK(s);
 sh(hdr(s)+`<div class="sbar"><button class="btn" id="sb"><span id="sbt"></span><svg class="i" style="width:1.1em;height:1.1em"><use href="#chev"/></svg></button><button class="btn fv${S.fav.includes(fk)?' on':''}" id="sf"><svg class="i"><use href="#star"/></svg></button></div><div class="sg" id="sl" hidden>${ks.map(k=>`<button class="btn" data-s="${k}">Temporada ${k}</button>`).join('')}</div><div class="eg" id="eg"></div><div class="lg"><span><i style="background:#3C4A5E"></i>Assistido</span><span><i style="background:var(--a1)"></i>Parei aqui</span></div>`);
 const draw=()=>{$('#sbt').textContent='Temporada '+cs;$('#sl').hidden=true;$('#eg').innerHTML=m[cs].map((e,i)=>{const c=isPart(e.u)?'pg':isDone(e.u)?'dn':nx&&e===nx?'nx':'';return`<button class="ep ${c}" data-u="${esc(e.u)}" title="${esc(e.n)}">${epn(e)||i+1}</button>`}).join('')};draw();
 $('#sh').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id=='sb')$('#sl').hidden=!$('#sl').hidden;
  else if(b.id=='sf'){b.classList.toggle('on',fav(fk));refresh()}
  else if(b.dataset.s){cs=+b.dataset.s;draw()}
  else if(b.dataset.u){$('#sheet').hidden=true;resume(flat.find(x=>x.u==b.dataset.u),flat)}};fillMeta(s,1)}
$('#catb').onclick=()=>{const m=new Map();for(const i of (S.by[S.tab]||[])){{let z=m.get(i.g);if(!z)m.set(i.g,z=new Set());z.add(S.tab=='series'?title(i.n):i.u)}}
 const lk=g=>PAR.on&&adCat(g)?'<svg class="i" style="width:1.1em;height:1.1em;margin-right:.4em"><use href="#ilock"/></svg>':'';
 sh('<b>Categorias</b><button class="btn" data-c="Todos">Todas as categorias</button>'+[...m].map(([g,z])=>`<button class="btn" data-c="${esc(g)}">${lk(g)}<span>${esc(g)}</span><small style="margin-left:auto;color:var(--m)">${z.size}</small></button>`).join(''));
 $('#sh').onclick=async e=>{const b=e.target.closest('[data-c]');if(!b)return;const c=b.dataset.c;$('#sheet').hidden=true;
  if(PAR.on&&adCat(c)){if(S.adOk!=c){if(!await parAsk())return;S.adOk=c}}else S.adOk='';
  S.cat=c;nav();render()}};
/* ---------- Ajustes (grade de 3 por linha) ---------- */
const arm=(id,fn)=>{const b=$(id),sp=b.querySelector('span'),t0=sp.textContent;let on=0,tm;b.onclick=()=>{if(on){clearTimeout(tm);fn();return}on=1;b.classList.add('arm');sp.textContent='Toque de novo para confirmar';tm=setTimeout(()=>{on=0;b.classList.remove('arm');sp.textContent=t0},4000)}};
async function aboutSheet(){const v=await ver();
 sh(`<b>ASC DESK</b><small style="color:var(--m)">${v?'Versão '+esc(v.name)+' (código '+esc(v.code)+')':'Versão indisponível.'}</small><p class="sy" style="max-height:none">Player de listas IPTV (M3U e servidor com login). Você cadastra a sua lista: o app não inclui nem fornece canais, filmes ou séries.</p><p class="sy" style="max-height:none">Seus logins e listas ficam criptografados neste aparelho.</p><small style="color:var(--m)">Projeto: ${esc(REPO)}</small>`)}
$('#cfg').onclick=()=>{const e=expAt(),d=e?daysTo(e):0,
 T=(id,ic,l,s,c)=>`<button class="tile${c?' '+c:''}" id="${id}"><svg class="i"><use href="#${ic}"/></svg><span>${l}</span>${s!=null?`<small>${s}</small>`:''}</button>`;
 sh('<b>Ajustes</b><button class="btn p ep2" id="a3"><svg class="i"><use href="#iepg"/></svg>Atualizar guia de programação (EPG)</button><div class="tg">'
  +T('a1','ilist','Gerenciar listas',LST.l.length+(LST.l.length==1?' lista':' listas'))
  +T('a11','ishield','Controle parental',PAR.on?'Ativo':'Desativado')
  +T('a6','ical','Vencimento',e?(d<0?'Vencida':d==0?'Vence hoje':d+(d==1?' dia':' dias')):'Não definido')
  +T('a8','ilock','Bloqueio por PIN',PIN.on?'Ativo':'Desativado')
  +T('a7','iupd','Verificar atualização',null)
  +T('a4','iclr','Limpar favoritos e progresso',null,'dg')
  +T('a9','itrash','Apagar todos os dados',null,'dg')
  +T('a12','iinfo','Sobre o app',null)
  +T('a13','iver','Versão','…')
  +T('a14','ipalette','Cor de destaque',ACN[ACC()])
  +T('a15','iscreen','Modo leve (PC fraco)',liteOn()?'Ligado':'Desligado')
  +T('a5','ifolder','Canal do cliente',null)
  +T('a10','iscreen','Bloquear capturas',LS.asc_sc=='1'?'Ativado':'Desativado')
  +'</div>');
 $('#a3').onclick=()=>{$('#sheet').hidden=true;const u=epgUrl();u?loadEPG(u,1):toast('Sem guia disponível. Entre com servidor e login ou informe um link de EPG.')};
 $('#a1').onclick=lists;$('#a11').onclick=parSheet;$('#a6').onclick=expSheet;$('#a8').onclick=pinSheet;
 $('#a7').onclick=()=>{$('#sheet').hidden=true;checkUpd(true)};
 arm('#a4',()=>{S.fav=[];ST.pos={};ST.last={};saveState();$('#sheet').hidden=true;render();toast('Favoritos e progresso apagados.',1)});
 arm('#a9',wipeAll);
 $('#a12').onclick=aboutSheet;
 ver().then(v=>{const x=$('#a13 small');if(x)x.textContent=v?v.name:'—'});
 $('#a13').onclick=async()=>{const v=await ver();toast(v?'ASC DESK '+v.name+' (código '+v.code+')':'Versão indisponível.',1)};
 $('#a14').onclick=accSheet;
 $('#a15').onclick=()=>{LS.asc_lite=liteOn()?'0':'1';liteApply();$('#sheet').hidden=true;toast(liteOn()?'Modo leve ligado: menos animações e efeitos.':'Modo leve desligado.',1)};
 $('#a5').onclick=pickCC;
 $('#a10').onclick=()=>{LS.asc_sc=LS.asc_sc=='1'?'0':'1';lastSc='';syncScr();$('#sheet').hidden=true;toast(LS.asc_sc=='1'?'Capturas bloqueadas nas telas de login e listas.':'Capturas liberadas.',1)}};

function accSheet(){sh('<b>Cor de destaque</b><div class="sw">'+Object.keys(ACN).map(k=>`<button class="swb${ACC()==k?' on':''}" data-ac="${k}" title="${ACN[k]}" aria-label="${ACN[k]}"></button>`).join('')+'</div><small style="color:var(--m)">A cor muda na hora em todo o app.</small>');
 $('#sh').onclick=e=>{const b=e.target.closest('[data-ac]');if(!b)return;LS.asc_ac=b.dataset.ac;accApply();$('#sheet').hidden=true;toast('Cor: '+ACN[ACC()],1)}}
/* ---------- Gerenciar listas ---------- */
let SS=0;const KN={x:'Servidor e login',m:'Link M3U',f:'Arquivo / texto'};
function lists(){SS=1;
 sh('<b>Gerenciar listas</b>'+(LST.l.length?'':'<small style="color:var(--m)">Nenhuma lista cadastrada.</small>')+LST.l.map(x=>`<button class="btn${x.id==LST.act?' p':''}" data-l="${esc(x.id)}"><span>${esc(x.n)}</span><small style="margin-left:auto">${x.id==LST.act?'Em uso':esc(KN[x.m]||'')}</small></button>`).join('')+'<button class="btn" id="la">+ Adicionar lista</button>');
 $('#sh').onclick=e=>{if(e.target.closest('#la')){$('#sheet').hidden=true;show('add');return}const b=e.target.closest('[data-l]');b&&listOpts(b.dataset.l)}}
function listOpts(id){const x=LST.l.find(y=>y.id==id);if(!x)return;SS=1;
 sh(`<b>${esc(x.n)}</b><small style="color:var(--m)">${esc(KN[x.m]||'')}</small>`+(x.id==LST.act?'':'<button class="btn p" id="o1">Usar esta lista</button>')+(x.u?'<button class="btn" id="o2">Atualizar lista</button>':'')+`<input id="rn" value="${esc(x.n)}" maxlength="40" aria-label="Nome da lista"><button class="btn" id="o4">Salvar nome</button><button class="btn" id="o3">Excluir</button><button class="btn" id="o5">Voltar</button>`);
 $('#sh').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id=='o1'){$('#sheet').hidden=true;useSaved(id)}
  else if(b.id=='o2'){$('#sheet').hidden=true;toast('Atualizando…');try{const c=x.m=='x'&&xcred(x.u);let t;if(c){const z=await xLogin(c.o,c.u,c.p);t=z.text;x.u=z.url}else{const r=await tf(x.u,3e5);if(!r.ok)throw 0;t=await r.text()}if(await useList(t,{id}))toast('Lista atualizada.')}catch{toast('Não consegui atualizar a lista.')}}
  else if(b.id=='o4'){x.n=$('#rn').value.trim().slice(0,40)||x.n;await saveL();lists()}
  else if(b.id=='o3'){if(b.dataset.c)delList(id);else{b.dataset.c=1;b.textContent='Toque de novo para excluir'}}
  else if(b.id=='o5')lists()}}
async function useSaved(id){LST.act=id;await saveL();if(await fastList(id))return;const t=await plGet(id);if(t)await useList(t,null,1);else{S.items=[];show('add');toast('Essa lista está sem dados. Adicione de novo.')}}
async function delList(id){const was=LST.act==id;LST.l=LST.l.filter(y=>y.id!=id);kv('del','pl:'+id).catch(()=>{});kv('del','pi:'+id).catch(()=>{});if(was)LST.act=LST.l[0]?LST.l[0].id:'';await saveL();
 if(!was)return lists();$('#sheet').hidden=true;if(LST.act)useSaved(LST.act);else{S.items=[];S._sg=null;show('add')}}

/* ---------- Orientação / tela cheia ---------- */
const CP=(window.Capacitor&&Capacitor.Plugins)||{};
let IM=CP.Immersive;try{if(!IM&&window.Capacitor&&Capacitor.registerPlugin)IM=Capacitor.registerPlugin('Immersive')}catch{}
const ori2=o=>{try{if(CP.ScreenOrientation)CP.ScreenOrientation.lock({orientation:o}).catch(()=>{});else if(screen.orientation&&screen.orientation.lock){const q=screen.orientation.lock(o);q&&q.catch&&q.catch(()=>{})}}catch{}};
const ori=o=>{if(!IM)return ori2(o);try{Promise.resolve(IM.orientation({mode:o})).catch(()=>ori2(o))}catch{ori2(o)}};
/* Tela cheia: no Windows usa a janela inteira (IPC); no navegador cai para a tela cheia HTML */
const ADW=window.ascDesk,hasWfs=!!(ADW&&ADW.setFullscreen);let wfs=false;
const fs=h=>{try{if(h){const e=document.documentElement;e.requestFullscreen&&e.requestFullscreen().catch(()=>{})}else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch{}};
const bars=h=>{if(!IM){try{if(CP.StatusBar)h?CP.StatusBar.hide():CP.StatusBar.show()}catch{}return fs(h)}try{Promise.resolve(IM.set({on:h})).catch(()=>{})}catch{}};
/* ---------- Player ---------- */
let hls,cur,zap=[],ht,dr=0,lt=0;const P=$('#player'),sk=$('#sk');
const fmt=t=>{if(!isFinite(t))return'0:00';t=Math.floor(t);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),q=String(t%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${q}`:`${m}:${q}`};
const ic=(id,n)=>$(id).querySelector('use').setAttribute('href','#'+n);
const live=()=>cur&&cur.t=='tv',spin=on=>$('#sp').hidden=!on;
let dgT=0;const dbg=m=>{if(Date.now()-dgT<2500)return;dgT=Date.now();toast(m)};
function ui(){P.classList.remove('h');clearTimeout(ht);ht=setTimeout(()=>!V.paused&&!dr&&P.classList.add('h'),3500)}
function epgBar(){const E=$('#epg'),lv=live(),x=lv?epgOf(cur):null;$('#pe').textContent=cur.g||'';E.hidden=!lv;if(!lv)return;
 E.innerHTML=x?`<div class="n">Agora: ${esc(x.p.t)} <span style="font-weight:400">• ${hm(x.p.s)}–${hm(x.p.e)}</span></div><div class="bar"><i style="width:${Math.min(100,Math.max(0,(Date.now()-x.p.s)/(x.p.e-x.p.s)*100))}%"></i></div>`+(x.nx?`<div class="x">A seguir: ${esc(x.nx.t)} • ${hm(x.nx.s)}</div>`:''):'<div class="x">Programação indisponível</div>'}
function saveP(done){if(!cur||live())return;const d=V.duration||0,t=V.currentTime;if(!isFinite(d)||!d)return;const p=ST.pos,o=p[cur.u];p[cur.u]={t,d,done:!!(done||t/d>=.92||(o&&typeof o=='object'&&o.done))};saveState()}
/* Buffer sob medida: abre rápido (começa no 1º trecho) e guarda ~20-30s à frente para não travar */
const HC=(lv,f)=>({xhrSetup:(x,u)=>{x.open('GET',PX(u),true)},enableWorker:true,lowLatencyMode:false,startFragPrefetch:true,capLevelToPlayerSize:true,testBandwidth:false,progressive:false,
 capLevelOnFPSDrop:true,maxBufferLength:lv?15:30,maxMaxBufferLength:lv?30:60,maxBufferSize:lv?30e6:60e6,backBufferLength:lv?5:20,
 liveSyncDurationCount:lv?3:3,liveMaxLatencyDurationCount:lv?10:Infinity,maxBufferHole:.6,nudgeMaxRetry:8,
 manifestLoadingTimeOut:f?5000:10000,manifestLoadingMaxRetry:f?0:2,manifestLoadingRetryDelay:300,
 levelLoadingTimeOut:f?5000:8000,levelLoadingMaxRetry:f?1:4,levelLoadingRetryDelay:500,
 fragLoadingTimeOut:f?8000:15000,fragLoadingMaxRetry:f?2:6,fragLoadingRetryDelay:400,fragLoadingMaxRetryTimeout:6000,
 abrEwmaDefaultEstimate:3e6,abrBandWidthFactor:.8,abrBandWidthUpFactor:.6});
let PLC;const pld=()=>PLC||(PLC=(()=>{const B=Hls.DefaultConfig.loader;return class extends B{load(c,g,cb){const ok=cb.onSuccess;
  super.load(c,g,Object.assign({},cb,{onSuccess:(r,st,x,n)=>{try{if(r&&n&&n.getResponseHeader){r.url=n.getResponseHeader('X-Final-Url')||c.url}}catch{}return ok(r,st,x,n)}}))}}})());
let mp=null,MLP,mpW=false;/* mpW: leitor .ts em thread separada (mais leve para a tela). Se falhar antes de tocar 2 vezes seguidas, volta ao modo antigo sozinho */
const wFail=()=>{if(mpW&&LS.asc_wok!='1'){const n=(+LS.asc_nwc||0)+1;LS.asc_nwc=String(n);if(n>=2)LS.asc_nw='1'}};
const TSU=/\.ts(\?|$)/i,mpOff=()=>{if(mp){try{mp.destroy()}catch{}mp=null}mpW=false},
ML=()=>window.mpegts?Promise.resolve():(MLP=MLP||new Promise(r=>{const s=document.createElement('script');s.src='vendor/mpegts.min.js';s.onload=s.onerror=()=>r();document.head.append(s)}));
let viaNat=false,hlsLv=false,HLP,gen=0,wd=null,lastT=-1,lastBe=0,stuck=0,rc=0,started=false,UP=false;
const HL=()=>window.Hls?Promise.resolve():(HLP=HLP||new Promise(r=>{const s=document.createElement('script');s.src='vendor/hls.min.js';s.onload=s.onerror=()=>r();document.head.append(s)}));
const qualityLevels=player=>{const levels=new Map();(player&&player.levels||[]).forEach((level,index)=>{const height=Number(level.height);if(!height)return;const previous=levels.get(height);if(!previous||Number(level.bitrate)>Number(previous.bitrate))levels.set(height,{height,index,bitrate:Number(level.bitrate)||0})});return[...levels.values()].sort((a,b)=>a.height-b.height)};
function qualityApply(player=hls){const button=$('#quality'),levels=qualityLevels(player);if(!player||levels.length<2){button.hidden=true;if(player)player.currentLevel=-1;return}
 const wanted=LS.asc_quality||'auto';button.hidden=false;if(wanted=='auto'){player.currentLevel=-1;button.textContent='Auto';button.setAttribute('aria-label','Qualidade: automática');return}
 const target=Number(wanted),choice=levels.filter(x=>x.height<=target).pop()||levels[0];player.currentLevel=choice.index;button.textContent=choice.height+'p';button.setAttribute('aria-label','Qualidade: '+choice.height+'p')}
function qualityMenu(){if(!hls)return;const levels=qualityLevels(hls);if(levels.length<2)return;ui();const preferred=LS.asc_quality||'auto',current=preferred=='auto'?'auto':String((levels.filter(x=>x.height<=Number(preferred)).pop()||levels[0]).height);
 sh('<b>Qualidade do vídeo</b><button class="btn'+(current=='auto'?' p':'')+'" data-q="auto">Automática</button>'+levels.slice().reverse().map(x=>`<button class="btn${current==String(x.height)?' p':''}" data-q="${x.height}">${x.height}p</button>`).join(''));
 $('#sh').onclick=e=>{const option=e.target.closest('[data-q]');if(!option)return;LS.asc_quality=option.dataset.q;qualityApply();$('#sheet').hidden=true;$('#quality').focus();ui()}}
/* Canais Xtream: o mesmo canal pode existir como .m3u8 e/ou .ts. Guardamos as variantes e passamos para a próxima se o servidor responder 404/403 */
const XL=/^(https?:\/\/[^/]+\/(?:live\/)?[^/]+\/[^/]+\/\d+)(\.m3u8|\.ts)?(\?.*)?$/i;
let CAND=[],ci=0;
const fmK=u=>{try{return new URL(u).host}catch{return''}};
const cands=u=>{const m=u.match(XL);if(!m)return[u];const b=m[1],q=m[3]||'',a=[b+'.m3u8'+q,b+'.ts'+q],w=jg('asc_fm',{})[fmK(u)]||(m[2]||'').slice(1).toLowerCase();return w=='ts'?a.reverse():a};
const nextCand=()=>{if(ci+1>=CAND.length)return false;ci++;spin(true);src(cur.u,0,1,false);return true};
function src(u,at,fresh,forceNat){const g=++gen;if(live())u=CAND[ci]||u;UP=false;viaNat=!!forceNat;
 const nativ=()=>{viaNat=true;V.src=PX(u);if(at>0)V.addEventListener('loadedmetadata',()=>{try{V.currentTime=at}catch{}},{once:true});V.play().catch(()=>{})};
 if(hls&&!fresh&&!forceNat&&hlsLv&&live()&&!(at>0)){try{hls.stopLoad();hls.loadSource(u);hls.startLoad(-1);return}catch{}}
 if(hls){hls.destroy();hls=null}mpOff();
 /* Canal .ts (fluxo MPEG-TS puro): o Android não toca direto, então usamos o leitor mpegts.js */
 if(live()&&TSU.test(u)){viaNat=true;ML().then(()=>{if(g!=gen)return;
   if(window.mpegts&&mpegts.isSupported()){const p=mp=mpegts.createPlayer({type:'mpegts',isLive:true,url:/^https?:\/\//i.test(u)&&nat()?location.origin+PX(u):u},{enableWorker:mpW=!LS.asc_nw,enableStashBuffer:true,stashInitialSize:128,liveBufferLatencyChasing:false,autoCleanupSourceBuffer:true,autoCleanupMaxBackwardDuration:30,autoCleanupMinBackwardDuration:12});
    p.attachMediaElement(V);p.on(mpegts.Events.ERROR,(t,d,i)=>{if(p!=mp)return;const cd=i&&i.code;if(!started)wFail();if(!started&&[401,403,404,410].includes(cd)&&nextCand())return;dbg('Canal .ts: '+d+(cd?' (HTTP '+cd+')':'')+(i&&i.msg?' '+String(i.msg).slice(0,70):''));setTimeout(()=>{if(p==mp&&!P.hidden&&cur)recover()},800)});
    p.load();Promise.resolve(p.play()).catch(()=>{})}
   else dbg('Este canal só existe em .ts e o leitor não carregou.')});return}
 HL().then(()=>{if(g!=gen)return;
  if(!window.Hls)dbg('hls.js não carregou');
  if(!forceNat&&window.Hls&&Hls.isSupported()&&!/\.(mp4|mkv|avi|mov)(\?|$)/i.test(u)){
   hlsLv=live();let LD={};try{if(nat())LD={loader:pld()}}catch{}
   const h=hls=new Hls(Object.assign(HC(hlsLv,hlsLv&&!started&&CAND.length>1),LD,at>0?{startPosition:at}:{}));h.loadSource(u);h.attachMedia(V);
    h.on(Hls.Events.MANIFEST_PARSED,()=>{qualityApply(h);V.play().catch(()=>{})});
   h.on(Hls.Events.ERROR,(_,d)=>{if(h!=hls)return;const cd=d.response&&d.response.code,bad=d.fatal||d.details=='manifestLoadError'||d.details=='manifestLoadTimeOut';
    if(live()&&!started&&d.details!='manifestParsingError'&&(d.fatal||[401,403,404,410].includes(cd))&&nextCand())return;
    if(bad)dbg('Canal '+((CAND[ci]||'').match(/\.(m3u8|ts)(\?|$)/i)||[,'?'])[1]+': '+d.details+(cd?' (HTTP '+cd+')':''));if(!d.fatal)return;
    if(d.details=='manifestParsingError'){h.destroy();hls=null;if(live()&&!started&&nextCand())return;nativ();return}
    spin(true);
    if(d.type=='mediaError')h.recoverMediaError();
    else setTimeout(()=>{if(h==hls&&!P.hidden)h.startLoad(-1)},1500)})
  }else nativ()})}
/* Vigia: se a imagem parar, a bolinha fica girando e o app tenta voltar sozinho (ao vivo: sem desistir) */
function wdOn(){wdOff();lastT=-1;lastBe=0;stuck=0;rc=0;started=false;wd=setInterval(tick,1000)}
function wdOff(){clearInterval(wd);wd=null}
function tick(){if(P.hidden||!cur)return;if(UP&&V.paused)return;
 if(V.paused)V.play().catch(()=>{});
 const t=V.currentTime,adv=Math.abs(t-lastT)>.25;lastT=t;
 if(!live()&&V.buffered.length){const be=V.buffered.end(V.buffered.length-1);if(be>lastBe+.25)stuck=0;lastBe=be}
 if(V.seeking||dr){stuck=0;return}
 if(adv&&V.readyState>=2){started=true;if(mpW&&mp&&LS.asc_wok!='1')LS.asc_wok='1';if(live()&&CAND.length>1){const e=/\.ts(\?|$)/i.test(CAND[ci]||'')?'ts':'m3u8',k=fmK(cur.u),o=jg('asc_fm',{});if(o[k]!=e){o[k]=e;try{LS.asc_fm=JSON.stringify(o)}catch{}}}stuck=0;rc=0;spin(false);return}
 stuck++;if(stuck>=2)spin(true);
 for(let i=0;i<V.buffered.length;i++){const s=V.buffered.start(i);if(s>t&&s-t<3){try{V.currentTime=s+.05}catch{}break}}
 if(live()&&!started&&stuck==15)toast('Este canal está demorando para abrir…');
 if(stuck>=(started?(live()?10:25):(live()?14:30)))recover()}
function recover(){if(P.hidden||!cur)return;stuck=0;const n=++rc;
 if(live()&&!started){wFail();spin(true);if(viaNat&&CAND.length>1)ci=(ci+1)%CAND.length;src(cur.u,0,1,!viaNat);return}
 if(!live()&&n>6){wdOff();gen++;if(hls){hls.destroy();hls=null}spin(false);toast('Não foi possível reproduzir. O servidor pode estar fora do ar ou o formato não é compatível.');return}
 spin(true);
 if(hls&&n%3){if(n%3==1)hls.startLoad(-1);else hls.recoverMediaError();V.play().catch(()=>{});return}
 src(cur.u,live()?0:V.currentTime,1,viaNat&&live())}
addEventListener('online',()=>{if(!P.hidden&&cur){rc=0;recover()}});
function play(it,list,from){V.preload='auto';cur=it;CAND=it.t=='tv'?cands(it.u):[it.u];ci=0;zap=list&&list.length?list:[it];ori('landscape');bars(true);if(P.hidden)history.pushState({p:1},'');P.hidden=false;$('#quality').hidden=true;const tv=live();
 $('#pt').textContent=it.n;ic('#pv',tv?'sprev':'rw10');ic('#nx',tv?'snext':'fw10');ic('#pp','pause');$('#lv').hidden=!tv;UP=false;$('#sk').hidden=tv;$('#tm').hidden=tv;
 $('#pr').style.width=$('#bf').style.width='0';$('#th').style.left='0';$('#t1').textContent=$('#t2').textContent='0:00';
 $('#pf').classList.toggle('on',S.fav.includes(favK(it)));spin(true);src(it.u);wdOn();epgBar();ui();
 if(it.t=='series'){ST.last[title(it.n)]=it.u;saveState()}
 if(from>0&&!tv)V.addEventListener('loadedmetadata',()=>V.currentTime=from,{once:true});
 if(document.activeElement)document.activeElement.blur()}
const step=d=>{if(live()){const i=(zap.indexOf(cur)+d+zap.length)%zap.length;play(zap[i],zap)}else V.currentTime=Math.max(0,Math.min(V.duration||1e9,V.currentTime+10*d))};
const tog=()=>V.paused?(UP=false,V.play().catch(()=>{})):(UP=true,V.pause());
$('#pv').onclick=()=>step(-1);$('#nx').onclick=()=>step(1);$('#pp').onclick=tog;
$('#pf').onclick=()=>$('#pf').classList.toggle('on',fav(favK(cur)));
V.onplay=()=>{UP=false;ic('#pp','pause')};V.onpause=()=>{UP=true;ic('#pp','play');ui()};
V.onloadstart=V.onwaiting=()=>spin(true);V.onplaying=V.oncanplay=()=>spin(false);
V.onended=()=>{if(!live()){saveP(1);const i=zap.indexOf(cur);if(zap[i+1])play(zap[i+1],zap)}};
V.onerror=()=>{if(P.hidden||!cur)return;dbg('Erro do vídeo (código '+(V.error&&V.error.code)+')');spin(true);setTimeout(()=>{if(!P.hidden&&cur)recover()},1500)};
V.onprogress=()=>{if(V.duration&&V.buffered.length)$('#bf').style.width=V.buffered.end(V.buffered.length-1)/V.duration*100+'%'};
let sv=0;V.ontimeupdate=()=>{if(!cur||live())return;const d=V.duration||0,t=V.currentTime;
 if(!dr){$('#pr').style.width=$('#th').style.left=d?t/d*100+'%':'0';$('#t1').textContent=fmt(t)}$('#t2').textContent=fmt(d);
 if(Date.now()-sv>5e3){sv=Date.now();saveP()}};
const seekTo=e=>{const r=sk.getBoundingClientRect(),f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));$('#pr').style.width=$('#th').style.left=f*100+'%';$('#t1').textContent=fmt(f*(V.duration||0));return f};
sk.onpointerdown=e=>{dr=1;sk.setPointerCapture(e.pointerId);seekTo(e);ui()};
sk.onpointermove=e=>{if(dr){seekTo(e);ui()}};
sk.onpointerup=e=>{if(dr){const f=seekTo(e);dr=0;if(V.duration)V.currentTime=f*V.duration;ui()}};
const close=pop=>{if(hasWfs&&wfs)ADW.setFullscreen(false);saveP();wdOff();gen++;ori(S.dev=='tv'?'landscape':'portrait');bars(false);if(hls){hls.destroy();hls=null}mpOff();UP=true;V.pause();V.removeAttribute('src');V.load();P.hidden=true;spin(false);if(S.tab=='fav'||S.tab=='home')render();if(pop!==1&&history.state&&history.state.p)history.back()};
$('#bk').onclick=()=>close();
const vol=$('#vol'),isFs=()=>hasWfs?wfs:document.fullscreenElement===P;
$('#quality').onclick=qualityMenu;
const volUi=()=>{vol.value=V.muted?0:V.volume;vol.style.setProperty('--v',(V.muted?0:V.volume)*100+'%');ic('#mu',V.muted||V.volume==0?'imute':'ivol');LS.asc_vol=String(V.volume)};
V.onvolumechange=volUi;V.volume=isFinite(+LS.asc_vol)&&LS.asc_vol!=null&&LS.asc_vol!==''?Math.min(1,Math.max(0,+LS.asc_vol)):1;volUi();
vol.oninput=()=>{V.muted=false;V.volume=+vol.value};
$('#mu').onclick=()=>{V.muted=!V.muted};
const setVol=d=>{V.muted=false;V.volume=Math.min(1,Math.max(0,Math.round((V.volume+d)*100)/100));ui();toast('Volume '+Math.round(V.volume*100)+'%',1)};
const togFs=()=>{try{if(hasWfs)ADW.setFullscreen(!wfs);else isFs()?document.exitFullscreen():P.requestFullscreen()}catch{}};
$('#fs').onclick=togFs;
const fsUi=()=>{ic('#fs',isFs()?'ifsx':'ifs');document.documentElement.classList.toggle('fsw',isFs())};
document.addEventListener('fullscreenchange',fsUi);if(hasWfs)ADW.onFullscreen(v=>{wfs=!!v;fsUi()});
/* a classe 'pl' (player aberto) é colocada pelo JS: mais leve que o seletor :has() no CSS */
new MutationObserver(()=>document.documentElement.classList.toggle('pl',!P.hidden)).observe(P,{attributes:true,attributeFilter:['hidden']});
$('#pip').onclick=async()=>{try{document.pictureInPictureElement?await document.exitPictureInPicture():await V.requestPictureInPicture()}catch{toast('Imagem sobre imagem indisponível para este vídeo.',1)}};
V.onclick=()=>{clearTimeout(ck);ck=setTimeout(tog,230)};V.ondblclick=()=>{clearTimeout(ck);togFs()};let ck;
P.addEventListener('pointermove',e=>{if(e.pointerType=='mouse')ui()});
P.addEventListener('wheel',e=>{e.preventDefault();setVol(e.deltaY<0?.05:-.05)},{passive:false});
setInterval(()=>{if(!P.hidden&&cur&&live())epgBar()},3e4);
addEventListener('popstate',()=>{if(!P.hidden)close(1)});
const fitSet=m=>{V.style.objectFit=m;$('#fit').classList.toggle('on',m=='cover');LS.asc_fit=m};
$('#fit').onclick=()=>fitSet(V.style.objectFit=='cover'?'contain':'cover');fitSet(LS.asc_fit=='cover'?'cover':'contain');
P.addEventListener('pointerdown',e=>{if(e.pointerType=='mouse')return ui();if(e.target.closest('button,#sk,#vol'))return ui();const n=Date.now(),x=e.clientX/innerWidth;
 if(!live()&&n-lt<300&&(x<.35||x>.65)){step(x<.5?-1:1);ui();lt=0;return}lt=n;P.classList.contains('h')?ui():P.classList.add('h')});

/* ---------- Controle remoto (D-pad) ---------- */
const BACK=['Escape','Backspace','GoBack','BrowserBack'];
addEventListener('keydown',e=>{const k=e.key;
 if(!LK.hidden){if(/^\d$/.test(k)){e.preventDefault();pinKey(k)}else if(k=='Backspace'){e.preventDefault();pinKey('x')}else if((k=='Escape'||k=='GoBack'||k=='BrowserBack'||e.keyCode==4)&&pinCan){e.preventDefault();pinCancel()}else if(S.dev=='tv'&&k.startsWith('Arrow'))nvg(e,LK);return}
 if(!P.hidden){const hid=P.classList.contains('h'),onb=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#player button');ui();
  if(!$('#sheet').hidden&&BACK.includes(k)){e.preventDefault();$('#sheet').hidden=true;$('#quality').focus();return}
  if(k=='Escape'&&isFs()){if(hasWfs){e.preventDefault();togFs()}return}
  if(BACK.includes(k)||e.keyCode==4){e.preventDefault();return close()}
  if(k=='f'||k=='F'||k=='F11'){e.preventDefault();return togFs()}
  if(k=='m'||k=='M'){e.preventDefault();V.muted=!V.muted;return}
  if(k=='p'||k=='P'){$('#pip').click();return}
  if(k=='ArrowUp'||k=='ArrowDown'){e.preventDefault();return setVol(k=='ArrowUp'?.05:-.05)}
  if(k=='ArrowLeft'||k=='ArrowRight'){e.preventDefault();if(!live())step(k=='ArrowRight'?1:-1);return}
  if(k==' '||k=='MediaPlayPause'){e.preventDefault();return tog()}
  if(k=='ChannelUp'||k=='PageUp'){if(live())step(1);return}if(k=='ChannelDown'||k=='PageDown'){if(live())step(-1);return}
  if(S.dev=='tv'&&k.startsWith('Arrow')){e.preventDefault();
   if(hid){if(live()&&(k=='ArrowUp'||k=='ArrowDown'))step(k=='ArrowUp'?1:-1);else if(!live()&&(k=='ArrowLeft'||k=='ArrowRight'))step(k=='ArrowRight'?1:-1)}else nvg(e,P)}
  else if(k=='Enter'&&!onb){e.preventDefault();tog()}
  return}
 if(!$('#sheet').hidden&&BACK.includes(k)){$('#sheet').hidden=true;return}
 if((k=='/'||(k=='f'&&e.ctrlKey))&&!/INPUT|TEXTAREA/.test((e.target||{}).tagName||'')&&!$('#app').hidden){e.preventDefault();$('#q').focus();$('#q').select();return}
 if(S.dev=='tv'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k))nvg(e,$('#sheet').hidden?document.body:$('#sheet'))});
function nvg(e,root){if(e.target.tagName=='INPUT'&&['ArrowLeft','ArrowRight'].includes(e.key)&&e.target.value)return;
 const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key],a=document.activeElement,
 ls=[...root.querySelectorAll('button,input,textarea,.card,label[tabindex]')].filter(x=>x.offsetParent&&!x.closest('[hidden]')&&(root!==document.body||!x.closest('#player,#sheet')));
 if(!a||!ls.includes(a)){e.preventDefault();return ls[0]&&ls[0].focus()}
 const r=a.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best,bs=1e9;
 for(const x of ls){if(x===a)continue;const q=x.getBoundingClientRect(),dx=q.left+q.width/2-cx,dy=q.top+q.height/2-cy,pr=dx*d[0]+dy*d[1];if(pr<=1)continue;const pp=Math.abs(dx*d[1])+Math.abs(dy*d[0]),s=pr+pp*2.5;if(s<bs){bs=s;best=x}}
 e.preventDefault();if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'})}}

/* ---------- Atualização, vencimento e lembretes ---------- */
const REPO='mundoarkade1-arch/asc-desk';
const AD=window.ascDesk;
const plug=n=>{try{return CP[n]||(window.Capacitor&&Capacitor.registerPlugin&&Capacitor.registerPlugin(n))}catch{}};
const nat=()=>{try{return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())}catch{return false}};
const dmy=t=>new Date(t).toLocaleDateString('pt-BR'),daysTo=t=>Math.ceil((t-Date.now())/864e5);
const isoD=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
let VER=null;
async function ver(){if(VER)return VER;if(!AD)return null;try{VER=await AD.version()}catch{}return VER}
/* Atualização: o app consulta as Releases do GitHub. Você escolhe baixar; no fim ele reinicia e instala. */
let updBusy=false;
const updSheet=(j,v)=>{sh(`<b>Nova versão ${esc(j.version||'')}</b>${j.notes?`<p class="sy" style="max-height:8em">${esc(j.notes)}</p>`:''}<small id="up" style="color:var(--m)">Você está na versão ${esc(v?v.name:'')}. Seus dados e listas são mantidos.</small><div class="bar" id="upb" hidden><i style="width:0"></i></div><button class="btn p" id="u1">Atualizar agora</button><button class="btn" id="u2">Depois</button>`);
 $('#u2').onclick=()=>$('#sheet').hidden=true;
 $('#u1').onclick=async()=>{const up=$('#up'),b=$('#u1');b.disabled=true;$('#upb').hidden=false;up.textContent='Baixando…';
  try{await AD.downloadUpdate()}catch{up.textContent='Falha ao baixar a atualização. Tente de novo mais tarde.';b.disabled=false}}};
if(AD)AD.onUpdate(m=>{const up=$('#up');
 if(m.type=='progress'&&up){up.textContent='Baixando… '+m.percent+'%';const i=document.querySelector('#upb i');if(i)i.style.width=m.percent+'%'}
 else if(m.type=='ready'){if(up){up.textContent='Pronto! O app vai reiniciar para instalar.';}setTimeout(()=>AD.installUpdate(),1200)}
 else if(m.type=='error'&&up){up.textContent='Falha ao atualizar. Tente de novo mais tarde.';const b=$('#u1');if(b)b.disabled=false}});
async function checkUpd(manual){if(updBusy)return;const v=await ver();
 if(!v||!v.packaged){if(manual)toast(v?'A atualização funciona no app instalado (não no modo de desenvolvimento).':'Atualização indisponível.');return}
 updBusy=true;
 try{const j=await AD.checkUpdate();
  if(j.state=='available')updSheet(j,v);
  else if(manual)toast(j.state=='none'?'Você já está na versão mais recente ('+v.name+').':'Não consegui verificar atualizações.')}
 catch{if(manual)toast('Não consegui verificar atualizações.')}
 finally{updBusy=false}}
setInterval(()=>checkUpd(),4*36e5);
/* Vencimento: Xtream informa exp_date; em lista M3U a data é digitada. Só aviso (banner + notificação), sem renovação. */
const expAt=()=>+CL().exp||0;
async function acct(){const A=xapi();if(!A)return;
 try{const r=await tf(A);if(!r.ok)return;const j=JSON.parse(await r.text()),u=j&&j.user_info;if(!u)return;
  const e=+u.exp_date,l=CL();if(e>0)l.exp=e*1e3;else delete l.exp;delete l.expm;await saveL();expSync()}catch{}}
function expSync(){bn();sched()}
function bn(){const b=$('#exp'),e=expAt();if(!e){b.hidden=true;return}const d=daysTo(e);if(d>7){b.hidden=true;return}
 b.hidden=false;b.className=d<=0?'bad':'';
 $('#et').textContent=d<0?`Sua lista venceu em ${dmy(e)}.`:d==0?'Sua lista vence hoje!':`Sua lista vence em ${d} dia${d>1?'s':''} (${dmy(e)}).`}
$('#ex').onclick=()=>$('#exp').hidden=true;
function expSheet(){const e=expAt(),x=!!xapi(),d=e?daysTo(e):0;
 sh(`<b>Vencimento</b><small style="color:var(--m)">${e?`Sua lista vence em ${dmy(e)} (${d<0?'vencida':d+' dia'+(d==1?'':'s')}).`:x?'O servidor não informou data de vencimento.':'Informe a data para receber os avisos.'}</small>`
  +(x?'':`<small style="color:var(--m)">Data de vencimento</small><input type="date" id="ed" value="${e?isoD(e):''}"><button class="btn p" id="es">Salvar</button>`)
  +'<small style="color:var(--m)">Você recebe uma notificação 7, 3 e 1 dia antes e no dia do vencimento.</small>');
 const es=$('#es');if(es)es.onclick=async()=>{const l=CL(),v=$('#ed').value;
  if(v){l.exp=new Date(v+'T23:59:00').getTime();l.expm='1'}else{delete l.exp;delete l.expm}
  await saveL();$('#sheet').hidden=true;expSync();toast('Salvo.')}}
/* Notificações no celular: 7, 3 e 1 dia antes e no dia, às 9h (funcionam com o app fechado) */
async function sched(){const N=plug('LocalNotifications');if(!N||!nat())return;const e=expAt();
 try{await N.cancel({notifications:[9001,9002,9003,9004].map(id=>({id}))});if(!e)return;
  let p=await N.checkPermissions();if(p.display=='prompt'||p.display=='prompt-with-rationale')p=await N.requestPermissions();if(p.display!='granted')return;
  const L2=[[7,9001,'vence em 7 dias'],[3,9002,'vence em 3 dias'],[1,9003,'vence amanhã'],[0,9004,'vence hoje']],out=[],nm=CL().n||'';
  for(const[d,id,t]of L2){const a=new Date(e);a.setDate(a.getDate()-d);a.setHours(9,0,0,0);if(a.getTime()>e)a.setTime(e-36e5);
   if(a.getTime()>Date.now())out.push({id,title:'ASC DESK',body:`Sua lista${nm?' "'+nm+'"':''} ${t} (${dmy(e)}).`,schedule:{at:a,allowWhileIdle:true}})}
  if(out.length)await N.schedule({notifications:out})}catch{}}

/* ---------- Segurança: PIN, tela protegida, ambiente ---------- */
const LK=$('#lock');let pinRes=null,pinBuf='',pinLen=0,pinCan=false;const pinCancel=()=>{const r=pinRes;pinRes=null;r&&r(null)};
const SCN=()=>{const N=plug('Secure');return N&&nat()?N:null};
let lastSc='';const syncScr=()=>{const N=SCN();if(!N)return;const s=!LK.hidden||(LS.asc_sc=='1'&&(!$('#add').hidden||SS)),k=s+'|'+PIN.on;if(k==lastSc)return;lastSc=k;N.screen({secure:!!s,hideRecents:PIN.on}).catch(()=>{})};
['add','sheet','lock'].forEach(id=>new MutationObserver(()=>{if($('#sheet').hidden)SS=0;syncScr()}).observe($('#'+id),{attributes:true,attributeFilter:['hidden']}));
async function pbk(pin,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return b64e(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},k,256)))}
function pinDraw(){$('#ld').textContent='●'.repeat(pinBuf.length)+'○'.repeat(Math.max(0,4-pinBuf.length))}
function askPin(t,o={}){return new Promise(r=>{pinBuf='';pinRes=r;pinLen=o.len||0;pinCan=!!o.cancel;$('#lt').textContent=t;$('#lm').textContent=o.msg||'';$('#lc').hidden=!o.cancel;window.__ascBooted=1;pinDraw();LK.hidden=false;const f=LK.querySelector('[data-k="1"]');f&&f.focus()})}
const pinEnd=()=>{LK.hidden=true;pinRes=null;pinBuf=''};
function pinKey(k){if(!pinRes)return;
 if(k=='x')pinBuf=pinBuf.slice(0,-1);
 else if(k=='ok'){if(pinBuf.length>=(pinLen||4)){const r=pinRes;pinRes=null;r(pinBuf);return}$('#lm').textContent=pinLen?'Use '+pinLen+' números.':'Use de 4 a 6 dígitos.'}
 else if(pinBuf.length<(pinLen||6)){pinBuf+=k;if(pinLen&&pinBuf.length==pinLen){const r=pinRes;pinRes=null;r(pinBuf);return}}
 pinDraw()}
LK.onclick=e=>{const b=e.target.closest('[data-k]');if(b)return pinKey(b.dataset.k);
 if(e.target.closest('#lc'))pinCancel();};
async function verify(p,O=PIN,key='pin'){if(Date.now()<O.u)return false;const ok=await pbk(p,b64d(O.s))==O.h;
 if(ok){if(O.f||O.u){O.f=0;O.u=0;await vs(key,O)}}
 else{O.f++;if(O.f>=5)O.u=Date.now()+Math.min(36e5,3e4*2**(O.f-5));await vs(key,O)}return ok}
const wait=(O=PIN)=>`Muitas tentativas. Aguarde ${Math.ceil((O.u-Date.now())/1e3)}s.`;
async function unlockLoop(){let m='';for(;;){const p=await askPin('Digite o PIN',{msg:m});
 if(Date.now()<PIN.u){m=wait();continue}
 if(await verify(p)){pinEnd();return}m=Date.now()<PIN.u?wait():'PIN incorreto.'}}
async function chkPin(O=PIN,key='pin',title='Digite o PIN atual',len=0){try{let m='';for(;;){const p=await askPin(title,{cancel:1,len,msg:m});if(!p)return false;if(await verify(p,O,key))return true;m=Date.now()<O.u?wait(O):(len?'Senha incorreta.':'PIN incorreto.')}}finally{pinEnd()}}
async function setPin(){try{const a=await askPin('Crie um PIN (4 a 6 dígitos)',{cancel:1});if(!a)return;const b=await askPin('Repita o PIN',{cancel:1});if(!b)return;
 if(a!=b)return toast('Os PINs não conferem.');const s=crypto.getRandomValues(new Uint8Array(16));
 Object.assign(PIN,{on:true,s:b64e(s),h:await pbk(a,s),f:0,u:0});await vs('pin',PIN);lastSc='';syncScr();toast('PIN ativado.')}finally{pinEnd()}}
function pinSheet(){sh(`<b>Bloqueio por PIN</b><small style="color:var(--m)">${PIN.on?'Ativo: o app pede o PIN ao abrir e ao voltar depois de 30 segundos fora. Também esconde o app na lista de recentes. O PIN bloqueia o acesso ao app; a criptografia dos dados é feita pelo cofre do aparelho.':'Desativado. Bloqueie o acesso ao app com um PIN de 4 a 6 dígitos.'}</small>`+(PIN.on?'<button class="btn" id="p2">Trocar PIN</button><button class="btn" id="p3">Desativar PIN</button>':'<button class="btn p" id="p1">Ativar PIN</button>'));
 const go=(id,f)=>{const b=$(id);b&&(b.onclick=()=>{$('#sheet').hidden=true;f()})};
 go('#p1',setPin);go('#p2',async()=>{if(await chkPin())setPin()});
 go('#p3',async()=>{if(await chkPin()){Object.assign(PIN,{on:false,h:'',s:'',f:0,u:0});await vs('pin',PIN);lastSc='';syncScr();toast('PIN desativado.')}})}
/* ---------- Controle parental: senha de 4 números para liberar categorias adultas ---------- */
const parAsk=()=>chkPin(PAR,'par','Senha do controle parental',4);
function parRefresh(){S.adOk='';if(PAR.on&&adCat(S.cat))S.cat='Todos';nav();render()}
function parBack(){if(!P.hidden&&cur&&!vis(cur))close();if(PAR.on&&adCat(S.cat)&&S.tab!='home'&&S.tab!='fav'){S.cat='Todos';nav();render()}}
async function setPar(){try{const a=await askPin('Crie a senha do controle parental (4 números)',{cancel:1,len:4});if(!a)return;const b=await askPin('Repita a senha',{cancel:1,len:4});if(!b)return;
 if(a!=b)return toast('As senhas não conferem.');const s=crypto.getRandomValues(new Uint8Array(16));
 Object.assign(PAR,{on:true,s:b64e(s),h:await pbk(a,s),f:0,u:0});await vs('par',PAR);parRefresh();toast('Controle parental ativado.',1)}finally{pinEnd()}}
function parSheet(){const n=new Set(S.items.filter(i=>adCat(i.g)).map(i=>i.g)).size;
 sh(`<b>Controle parental</b><small style="color:var(--m)">${PAR.on?'Ativo: categorias adultas pedem a senha de 4 números. Conteúdo adulto não aparece na busca, no início nem nos favoritos.':'Desativado. Ative para bloquear as categorias adultas com uma senha de 4 números.'}</small>`
  +(S.items.length?`<small style="color:var(--m)">${n?n+' categoria'+(n>1?'s adultas detectadas':' adulta detectada')+' nesta lista.':'Nenhuma categoria adulta detectada nesta lista.'}</small>`:'')
  +(PAR.on?'<button class="btn" id="c2">Trocar senha</button><button class="btn" id="c3">Desativar controle parental</button>':'<button class="btn p" id="c1">Ativar controle parental</button>'));
 const go=(id,f)=>{const b=$(id);b&&(b.onclick=()=>{$('#sheet').hidden=true;f()})};
 go('#c1',setPar);go('#c2',async()=>{if(await parAsk())setPar()});
 go('#c3',async()=>{if(await parAsk()){Object.assign(PAR,{on:false,h:'',s:'',f:0,u:0});await vs('par',PAR);parRefresh();toast('Controle parental desativado.',1)}})}
let hideAt=0;
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)S.adOk='';else if(PAR.on)parBack();
 if(document.hidden){stNow().catch(()=>{});if(PIN.on){hideAt=Date.now();$('#cover').hidden=false}}
 else if(PIN.on){$('#cover').hidden=true;if(Date.now()-hideAt>3e4&&!pinRes){if(!P.hidden)close();$('#sheet').hidden=true;unlockLoop()}}});
/* Bloqueia o app se houver depurador conectado ('env') ou se o APK nao esta assinado com o certificado oficial ('sig'). Vazio = tudo certo. */
async function envOk(){const N=SCN();if(!N)return '';try{const r=await tmo(N.check(),3000);return r.debugger?'env':r.sig===false?'sig':''}catch{return ''}}

/* ---------- Início ---------- */
function setDev(d){S.dev=d;document.body.className='pc'}
async function boot(){const l=CL();if(l.id&&await fastList(l.id))return true;const t=l.id&&await plGet(l.id);if(t)return useList(t,null,1);$('#ac').hidden=!LST.l.length;show('add')}
const lname=d=>($('#ln').value.trim()||d).slice(0,40);
const doneAdd=()=>{['xs','xu','xp','u','e','ta','ln'].forEach(i=>$('#'+i).value='');$('#st').textContent=''};
$('#ac').onclick=()=>S.items.length?show('app'):lists();
$('#go').onclick=async()=>{const u=$('#u').value.trim(),e=$('#e').value.trim(),st=$('#st');
 if(!okU(u))return st.textContent='Cole um link válido (http:// ou https://).';if(e&&!okU(e))return st.textContent='Link do EPG inválido.';st.textContent='Carregando…';
 try{const r=await tf(u,3e5);if(!r.ok)throw 0;if(await useList(await r.text(),{id:uid(),n:lname(new URL(u).host),m:'m',u,epg:e}))doneAdd()}
 catch{st.textContent='Não consegui baixar o link (o servidor recusou ou o link está errado). Confira o link ou use “Abrir arquivo” ou “Colar texto”.'}};
$('#f').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>LMAX)return $('#st').textContent='Arquivo grande demais (máximo de cerca de 250 MB).';
 const ep=$('#e').value.trim();if(await useList(await f.text(),{id:uid(),n:lname((f.name||'Arquivo').slice(0,40)),m:'f',u:'',epg:okU(ep)?ep:''}))doneAdd()};
$('#fl').onkeydown=e=>e.key=='Enter'&&$('#f').click();
const mode=m=>{$('#xt').hidden=m!='x';$('#ml').hidden=m!='m';$('#m1').classList.toggle('p',m=='x');$('#m2').classList.toggle('p',m=='m');$('#st').textContent='';LS.asc_mode=m};
$('#m1').onclick=()=>mode('x');$('#m2').onclick=()=>mode('m');mode(LS.asc_mode=='m'?'m':'x');
const xcred=u=>{try{const b=new URL(u),n=b.searchParams.get('username'),p=b.searchParams.get('password');return n&&p?{o:b.origin,u:n,p}:null}catch{return null}};
const clean=t=>String(t==null?'':t).replace(/[\r\n"]+/g,' ').trim();
/* Último recurso (painel sem get.php / 404): monta a lista de canais e filmes pela API do servidor */
async function apiList(o,u,p){const A=`${o}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`,
  j=async a=>{const r=await tf(A+a,6e4);if(!r.ok)throw 0;return r.json()},
  nm=async a=>{try{const l=await j(a),m={};for(const c of l||[])m[c.category_id]=c.category_name;return m}catch{return{}}};
 const au=await j('');if(!au||!au.user_info||au.user_info.auth==0)throw 0;
 const[cl,cv]=await Promise.all([nm('&action=get_live_categories'),nm('&action=get_vod_categories')]);
 const[lv,vd]=await Promise.all([j('&action=get_live_streams').catch(()=>[]),j('&action=get_vod_streams').catch(()=>[])]);
 const out=['#EXTM3U'],ln=(x,g,url)=>out.push(`#EXTINF:-1 tvg-id="${clean(x.epg_channel_id)}" tvg-logo="${clean(x.stream_icon)}" group-title="${clean(g)}",${clean(x.name)}`,url);
 for(const x of lv||[])ln(x,cl[x.category_id]||'Canais',`${o}/live/${encodeURIComponent(u)}/${encodeURIComponent(p)}/${x.stream_id}.m3u8`);
 for(const x of vd||[])ln(x,cv[x.category_id]||'Filmes',`${o}/movie/${encodeURIComponent(u)}/${encodeURIComponent(p)}/${x.stream_id}.${clean(x.container_extension)||'mp4'}`);
 if(out.length<2)throw 0;return out.join('\n')}
/* Tenta os formatos mais comuns de get.php; cada servidor aceita um */
async function xLogin(o,u,p){const b=`${o}/get.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&type=m3u_plus`;
 for(const q of ['&output=m3u8','&output=ts','']){try{const r=await tf(b+q,3e5);if(r.ok){const t=await r.text();if(/#EXTINF/i.test(t.slice(0,2e5)))return{url:b+q,text:t}}}catch{}}
 return{url:b+'&output=m3u8',text:await apiList(o,u,p)}}
$('#xg').onclick=async()=>{const st=$('#st'),u=$('#xu').value.trim(),p=$('#xp').value.trim();let s=$('#xs').value.trim();
 if(!s||!u||!p)return st.textContent='Preencha servidor, login e senha.';
 if(!/^https?:\/\//i.test(s))s='http://'+s;let o;try{o=new URL(s).origin}catch{return st.textContent='Endereço do servidor inválido.'}
 st.textContent='Entrando…';
 try{const x=await xLogin(o,u,p);if(await useList(x.text,{id:uid(),n:lname(new URL(o).host),m:'x',u:x.url,epg:''}))doneAdd()}
 catch{st.textContent='Não consegui entrar. Confira servidor, login e senha (ou a conexão).'}};
$('#pa').onclick=()=>{const t=$('#ta');if(t.hidden){t.hidden=false;t.focus();$('#pa').textContent='Carregar texto colado'}else{const ep=$('#e').value.trim();useList(t.value,{id:uid(),n:lname('Lista colada'),m:'f',u:'',epg:okU(ep)?ep:''}).then(ok=>ok&&doneAdd())}};
(async()=>{try{
 const bad=await Promise.race([envOk(),sleep(4000).then(()=>'')]);
 if(bad){window.__ascBooted=1;$('#boot').hidden=true;
  if(bad=='sig'){$('#bt').textContent='App não reconhecido';$('#bp').textContent='Esta cópia do app não está assinada pelo desenvolvedor original. Baixe a versão oficial e instale de novo.'}
  $('#blk').hidden=false;return}
 try{await tmo(dek(),9000)}catch(e){window.__ascRecovery&&window.__ascRecovery('Não consegui abrir o cofre seguro deste aparelho.');return}
 try{await loadVault();await migrate()}catch(e){console.warn(e)}
 syncScr();
 if(PIN.on)await unlockLoop();
 setDev('pc');await boot()
 setTimeout(()=>{try{HL()}catch{}},1500);setTimeout(()=>checkUpd(),5000)
}catch(e){bootErr((e&&e.message)||e)}})();
addEventListener('error',e=>{const t=e.target;if(t&&t.tagName=='IMG'){const m=/\/__i\?u=([^&]+)/.exec(t.getAttribute('src')||'');if(m&&!t.dataset.fb){t.dataset.fb='1';t.src='/__p?u='+m[1];return}t.remove()}},true);
try{const A=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.App;A&&A.addListener('backButton',()=>{if(!LK.hidden){if(pinCan)pinCancel();else A.exitApp()}else if(!P.hidden)close();else if(!$('#sheet').hidden)$('#sheet').hidden=true;else A.exitApp()})}catch{}
