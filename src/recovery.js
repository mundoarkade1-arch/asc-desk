(function(){var d=document;function rec(m){if(window.__ascBooted)return;var b=d.getElementById('boot'),t=d.getElementById('bm'),r=d.getElementById('br');if(!b||!t||!r)return;b.hidden=false;if(m)t.textContent=m;else if(t.textContent==='Carregando…')t.textContent='O app demorou para iniciar.';r.hidden=false}
window.__ascRecovery=rec;
setTimeout(function(){rec()},15000);
d.addEventListener('DOMContentLoaded',function(){
 d.getElementById('b1').onclick=function(){location.reload()};
 d.getElementById('b2').onclick=function(){try{localStorage.clear();sessionStorage.clear();localStorage.asc_dm='w'}catch(e){}
  try{var q=indexedDB.deleteDatabase('asc');q.onsuccess=q.onerror=q.onblocked=function(){location.reload()};setTimeout(function(){location.reload()},1500)}catch(e){location.reload()}}})})();
