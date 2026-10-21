import test from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';

// Instrumentação antes da inicialização, sem qualquer instância real.
function instrumentar() {
  const caso = new URLSearchParams(location.search).get('lote2');
  const ready = omni.ready;
  omni.ready = fn => ready(ctx => {
    fn(ctx);
  });
  const http = omni.http.request;
  omni.http.request = async op => {
    if (caso === 'preenchidos' && op.url.includes('/preenchidos')) return { status: 503, body: '{"erro":"Preenchidos indisponíveis"}' };
    const r = await http(op);
    return r;
  };
}

test('lote 2: regressões no navegador', async t => {
  const servidor = criarServidor();
  servidor.prependListener('request', (req, res) => {
    if (!req.url.startsWith('/app/')) return;
    const end = res.end;
    res.end = function (data, ...args) {
      if (data && req.url.includes('.html')) data = data.toString().replace(/<script src="comum.js(?:\?v=[^"]+)?">/, '<script>(' + instrumentar.toString() + ')();</script>$&');
      return end.call(this, data, ...args);
    };
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  let b;
  try {
    b = await abrirChromium();
    const abrir = (pagina, query = '') => b.navegar('http://127.0.0.1:' + servidor.address().port + '/app/' + pagina + '.html' + query);
    await t.test('16: falha de preenchidos aparece como erro', async () => {
      await abrir('imoveis', '?lote2=preenchidos');
      await b.esperar(() => document.querySelector('#gi-erro').textContent.includes('Preenchidos indisponíveis'));
      assert.doesNotMatch(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /nada ainda/i);
      await b.captura('lote2-preenchidos-erro');
    });
    assert.deepEqual(b.erros, []);
  } finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
});
