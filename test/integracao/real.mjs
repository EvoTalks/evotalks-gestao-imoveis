import { portalExiste, portalDir, criarPortalReal } from './portal-real.mjs';
import { criarServidor } from '../bancada/servidor.mjs';
import { abrirChromium } from '../bancada/chromium.mjs';
import { testarReal } from './real.cenarios.mjs';

if (!portalExiste) {
  process.stdout.write('AVISO: portal real ausente em ' + portalDir + '; integração pulada. Defina PORTAL_DIR.\n');
} else {
  const real = await criarPortalReal();
  const servidor = criarServidor({ portalRealUrl: real.url });
  let b;
  try {
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    b = await abrirChromium();
    await testarReal(b, 'http://127.0.0.1:' + servidor.address().port, real);
    process.stdout.write('Integração real: todos os cenários de ouro passaram.\n');
  } catch (err) {
    if (b) process.stderr.write(JSON.stringify(await b.avaliar(() => ({ texto: document.body.innerText.slice(-10000), chamadas: bancada.chamadas.map(r => [r.method,r.caminho]), erros: window.__xss }))) + '\n');
    throw err;
  } finally {
    if (b) await b.fechar();
    servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); await real.fechar();
  }
}
