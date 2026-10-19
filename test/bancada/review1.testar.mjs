import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { testarReview1 } from './review1.cenarios.mjs';
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
let b;
try {
  b = await abrirChromium();
  await testarReview1(b, 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
