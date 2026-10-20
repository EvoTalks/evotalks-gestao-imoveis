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
  for (const [largura, altura] of [[1906,1000], [1400,1000], [1152,1000], [1280,1000], [1366,1000], [1000,1000], [800,883], [1906,600]]) {
    await b.viewport(largura, altura);
    await b.navegar(origem + '/app/imoveis.html?perfil=admin');
    await b.esperar(() => !!document.querySelector('[data-detalhe]'));
    await b.clicar('[data-detalhe]');
    await b.esperar(() => !!document.querySelector('.dv-cabeca'));
    const m = await b.avaliar(() => {
      const el = document.querySelector('.gi-visualizacao'), r = el.getBoundingClientRect();
      return {w:r.width,h:r.height,x:r.x,janela:document.documentElement.clientWidth,galeria:el.querySelector('.dv-galeria,.dv-sem-foto').getBoundingClientRect().height,gw:el.querySelector('.dv-galeria,.dv-sem-foto').getBoundingClientRect().width,
        overflow:el.querySelector('.gi-modal-corpo').scrollWidth > el.querySelector('.gi-modal-corpo').clientWidth,
        lado:el.querySelector('.dv-lado').getBoundingClientRect().width,
        fatos:Array.from(el.querySelectorAll('.dv-fato')).map(f => {
          const r=f.getBoundingClientRect(), i=f.querySelector('.dv-fato-icone').getBoundingClientRect();
          const texto=f.querySelector('div:not(.dv-fato-icone)').getBoundingClientRect();
          return {cabe:f.scrollWidth<=f.clientWidth, separado:texto.left>=i.right, dentro:texto.right<=r.right + 1};
        }),cols:getComputedStyle(el.querySelector('.dv-grade')).gridTemplateColumns};
    });
    assert.ok(Math.abs(m.w - (largura < 900 ? largura - 32 : largura * .8)) <= 1, 'largura dinâmica');
    assert.equal(m.overflow, false, 'sem rolagem horizontal em ' + largura);
    assert.equal(m.fatos.length, 6);
    for (const f of m.fatos) assert.ok(f.cabe && f.separado && f.dentro, 'indicador sem corte ou sobreposição em ' + largura + JSON.stringify(m));
    if (m.cols.split(' ').length === 2) assert.ok(m.lado >= 280, 'lateral legível');
    if (largura === 1000) assert.equal(m.cols.split(' ').length, 1, 'popup estreito em coluna única');
    if (largura >= 900) assert.ok(Math.abs(m.galeria - Math.min(m.gw * 380 / 704, altura * .55)) <= 1, 'proporção real da galeria');
    if (largura >= 900) assert.ok(m.galeria <= altura * .55 + 1, 'galeria até 55vh');
    if (largura === 1906 && altura === 1000) assert.ok(m.galeria > 380, 'galeria cresce com a largura');
    if (largura === 800) assert.equal(m.galeria, 300);
    assert.ok(Math.abs(m.x - (m.janela - m.w) / 2) <= 1, 'centralizado');
    assert.ok(m.h <= altura * .9, 'altura até 90%');
    if (largura === 800) assert.equal(m.cols.split(' ').length, 1);
  }
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS largura: quatro telas 1906/1360px, fidelidade 1360px 0 % de diferença frente ao teto anterior, tabela/filtros, popup 80vw em 1906/1400/1152/1280/1366/1000px centralizado, indicadores sem corte/sobreposição, lateral adaptável, 90vh, galeria proporcional até 55vh e coluna única 800px; FAIL 0\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections();
  await new Promise(r => servidor.close(r));
}
