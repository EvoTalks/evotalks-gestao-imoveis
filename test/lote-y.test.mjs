import test from 'node:test';
import { PERMISSOES_PADRAO } from './bancada/portal-permissoes.mjs';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';
import { testarLoteY } from './bancada/lote-y.cenarios.mjs';
test('lote Y: regressões reais no navegador', async t => {
  const s = criarServidor({ permissoes: { 9999: { ...PERMISSOES_PADRAO, ver_configuracoes: true } } }); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const b = await abrirChromium();
  try {
    await b.navegar('http://127.0.0.1:' + s.address().port + '/app/chamados.html');
    await testarLoteY(b, 'http://127.0.0.1:' + s.address().port, (nome, fn) => t.test(nome, fn));
  } finally { await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
});
