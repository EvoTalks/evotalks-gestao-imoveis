import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { testarLote1 } from './lote1.cenarios.mjs';
const servidor = criarServidor(); let b;
try {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  b = await abrirChromium();
  await testarLote1(b, 'http://127.0.0.1:' + servidor.address().port);
} catch (err) {
  if (b) process.stderr.write(JSON.stringify(await b.avaliar(() => ({ texto: document.body.innerText, chamadas: window.bancada && bancada.chamadas }))) + '\n');
  throw err;
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
