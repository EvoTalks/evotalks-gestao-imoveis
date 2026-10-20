/* Telas reais e estados preservados; somente host/portal sintéticos. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { abrirExtensao } from './roteiros.mjs';
import { abrirAmbiente, capturar, SAIDA, principal } from './ambiente.mjs';
import { criarFixturePortal } from './portal.mjs';
import { fixture } from './fixture-desenho.mjs';
import { criarServidor } from '../bancada/servidor.mjs';

export async function testarGestao() {
  let capturas = 0;
  for (const quadro of ['imoveis']) {
    const s = await abrirExtensao(quadro, { largura: 1360, altura: 738 });
    try {
      const b = s.b;
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-tela="gi-prestadores"]')), false);
      if (quadro === 'imoveis') {
        assert.equal(await b.avaliar(() => document.querySelectorAll('[data-situacao]').length), 6);
        assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('.gi-barra select')].map(e => e.id)), ['f-finalidade','f-situacao','f-estado','f-porpagina']);
        assert.equal(await b.avaliar(() => document.querySelector('#b-proxima').disabled), true);
        assert.match(await b.avaliar(() => document.querySelector('#gi-origem').textContent), /6 no total/);
      }
      const cores = [];
      for (const tema of ['light','dark']) {
        await b.cdp('Emulation.setEmulatedMedia', { features:[{ name:'prefers-color-scheme', value:tema }] });
        await capturar(b, s.seletor, path.join(SAIDA,'gestao-variantes',quadro+'-'+tema+'.png')); capturas++;
        cores.push(await b.avaliar(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, s.seletor));
      }
      // 0.26.3: a janela de edição fica clara nos dois temas; as demais telas seguem o tema.
      if (s.seletor.includes('gi-modal')) assert.deepEqual(cores, ['rgb(255, 255, 255)', 'rgb(255, 255, 255)'], quadro + ': modal claro nos dois temas');
      else assert.notEqual(cores[0], cores[1], quadro + ': tema escuro efetivo');
      assert.deepEqual(b.erros, []);
    } finally { await s.fechar(); }
  }
  // Páginas sem quadro herdam a mesma linguagem, mantendo o perfil normal.
  const servidor = criarServidor({ fixture:criarFixturePortal() });
  await new Promise(r => servidor.listen(0,'127.0.0.1',r));
  const b = await abrirAmbiente(fixture);
  try {
    const base = 'http://127.0.0.1:' + servidor.address().port;
    for (const pagina of ['campos','historico','config','imoveis']) {
      await b.viewport(1360,900); await b.navegar(base + '/app/' + pagina + '.html?fixture=desenho');
      await b.esperar(() => !!document.querySelector('#gi-nav .gi-nav-ativo'));
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-tela="gi-prestadores"]')),false);
      assert.equal(await b.avaliar(() => document.body.classList.contains('gi')),true);
      if (pagina === 'imoveis') {
        await b.esperar(() => !!document.querySelector('[data-abrir]'));
        assert.equal(await b.avaliar(() => document.querySelectorAll('[data-locacao]').length),0,'agente continua sem ação administrativa');
      }
      for (const tema of ['light','dark']) {
        await b.cdp('Emulation.setEmulatedMedia', { features:[{ name:'prefers-color-scheme', value:tema }] });
        await capturar(b,'body',path.join(SAIDA,'gestao-variantes',pagina+'-apoio-'+tema+'.png')); capturas++;
      }
    }
    assert.deepEqual(b.erros, []);
  } finally { await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
  return capturas;
}
if (principal(import.meta.url)) process.stdout.write(await testarGestao() + ' capturas: gestão, modal e apoio em claro/escuro; ações e payload preservados; zero exceções.\n');
