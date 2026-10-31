'use strict';
/* Copia bibliotecas de video para src/vendor (roda depois do npm install). O hls.min.js ja vem no repositorio. */
const fs = require('fs');
const path = require('path');
const from = path.join(__dirname, '..', 'node_modules', 'mpegts.js', 'dist', 'mpegts.js');
const to = path.join(__dirname, '..', 'src', 'vendor', 'mpegts.min.js');
fs.mkdirSync(path.dirname(to), { recursive: true });
if (fs.existsSync(from)) { fs.copyFileSync(from, to); console.log('mpegts.js copiado para src/vendor'); }
else console.warn('AVISO: mpegts.js nao encontrado; canais .ts puros nao tocarao.');
