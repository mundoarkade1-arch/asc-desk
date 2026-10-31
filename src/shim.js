/* Ponte entre o app e o Windows. Imita a API de plugins usada no ASC Play (celular),
   mas cada chamada vai para o processo principal do Electron (window.ascDesk, definido no preload). */
(function () {
  'use strict';
  var A = window.ascDesk;
  if (!A) return;
  var P = {
    Secure: {
      wrap: function (d) { return A.wrap(d); },
      unwrap: function (d) { return A.unwrap(d); },
      reset: function () { return Promise.resolve(); },
      screen: function (o) { return A.screen(o); },
      check: function () { return Promise.resolve({ debugger: false, sig: true }); }
    },
    Immersive: {
      set: function () { return Promise.resolve(); },
      orientation: function () { return Promise.resolve(); }
    },
    LocalNotifications: {
      checkPermissions: function () { return Promise.resolve({ display: 'granted' }); },
      requestPermissions: function () { return Promise.resolve({ display: 'granted' }); },
      cancel: function (o) { return A.cancelNotify((o.notifications || []).map(function (n) { return n.id; })); },
      schedule: function (o) {
        return A.notify((o.notifications || []).map(function (n) {
          return { id: n.id, title: n.title, body: n.body, at: +new Date(n.schedule && n.schedule.at) };
        }));
      }
    }
  };
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: P,
    registerPlugin: function (n) { return P[n]; }
  };
})();
