import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
try {
  b = await abrirChromium();
  for (const largura of [1906, 1360]) {
    await b.viewport(largura, 883);
    for (const tela of ['imoveis', 'campos', 'historico', 'config']) {
      await b.navegar(origem + '/app/' + tela + '.html?perfil=admin');
      await b.esperar(() => !document.body.classList.contains('gi-permissoes-pendentes'));
      const medidas = await b.avaliar(() => ({body:document.body.getBoundingClientRect().width, janela:document.documentElement.clientWidth}));
      assert.ok(Math.abs(medidas.body - medidas.janela) <= 1, tela + ' em ' + largura);
      if (largura === 1360) {
        await b.avaliar(() => document.fonts.ready);
        const atual = await b.cdp('Page.captureScreenshot', {format:'png'});
        // Reaplica o teto anterior no mesmo DOM: em 1360px a imagem deve ser idêntica.
        await b.avaliar(() => { document.body.style.width = 'min(1360px,100%)'; });
        const anterior = await b.cdp('Page.captureScreenshot', {format:'png'});
        assert.equal(atual.data, anterior.data, tela + ': fidelidade 1360px sem diferença');
        await b.avaliar(() => { document.body.style.width = ''; });
      }
      if (tela === 'imoveis' && largura > 1360) {
        for (const seletor of ['table', '.gi-filtros-imoveis']) {
          assert.ok(await b.avaliar(s => document.querySelector(s).getBoundingClientRect().width > 1360, seletor), seletor);
        }
      }
    }
  }
  for (const largura of [1906, 1152, 800]) {
    await b.viewport(largura, 883);
    await b.navegar(origem + '/app/imoveis.html?perfil=admin');
    await b.esperar(() => !!document.querySelector('[data-detalhe]'));
    await b.clicar('[data-detalhe]');
    await b.esperar(() => !!document.querySelector('.dv-cabeca'));
    const m = await b.avaliar(() => {
      const el = document.querySelector('.gi-visualizacao'), r = el.getBoundingClientRect();
      return {w:r.width,h:r.height,x:r.x,janela:document.documentElement.clientWidth,cols:getComputedStyle(el.querySelector('.dv-grade')).gridTemplateColumns};
    });
    assert.equal(m.w, Math.min(1280, largura - 32));
    assert.ok(Math.abs(m.x - (m.janela - m.w) / 2) <= 1, 'centralizado');
    assert.ok(m.h <= 883 * .9, 'altura até 90%');
    if (largura === 800) assert.equal(m.cols.split(' ').length, 1);
  }
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS largura: quatro telas 1906/1360px, fidelidade 1360px 0 % de diferença frente ao teto anterior, tabela/filtros, popup 1280/1120px centralizado, 90vh e coluna única 800px; FAIL 0\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections();
  await new Promise(r => servidor.close(r));
}
