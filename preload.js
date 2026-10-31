'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (n, ...a) => ipcRenderer.invoke(n, ...a);
contextBridge.exposeInMainWorld('ascDesk', {
  version: () => call('app:version'),
  wrap: (d) => call('sec:wrap', d),
  unwrap: (d) => call('sec:unwrap', d),
  screen: (o) => call('sec:screen', o),
  notify: (list) => call('notify:schedule', list),
  cancelNotify: (ids) => call('notify:cancel', ids),
  checkUpdate: () => call('upd:check'),
  downloadUpdate: () => call('upd:download'),
  installUpdate: () => call('upd:install'),
  onUpdate: (cb) => { const f = (_e, m) => cb(m); ipcRenderer.on('upd:event', f); return () => ipcRenderer.removeListener('upd:event', f); },
});
