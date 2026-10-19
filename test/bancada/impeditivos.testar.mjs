import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { testarImpeditivos } from './impeditivos.cenarios.mjs';
const s = criarServidor(); await new Promise(r => s.listen(0, '127.0.0.1', r));
let b;
try { b = await abrirChromium(); await testarImpeditivos(b, 'http://127.0.0.1:' + s.address().port); }
catch (err) { if (b) process.stderr.write(await b.avaliar(() => document.body.innerText) + '\n'); throw err; }
finally { if (b) await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
