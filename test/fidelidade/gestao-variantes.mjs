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
  for (const quadro of ['locados','imoveis','marcar']) {
    const s = await abrirExtensao(quadro, { largura: quadro === 'marcar' ? 900 : 1360, altura: quadro === 'marcar' ? 709 : quadro === 'locados' ? 890 : 738 });
    try {
      const b = s.b;
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-tela="gi-prestadores"]')), false);
      if (quadro === 'locados') {
        assert.equal(await b.avaliar(() => document.querySelectorAll('th').length), 9);
        assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo td:nth-child(8) .gi-chip').length), 6);
        assert.match(await b.avaliar(() => document.querySelector('#gi-resumo').textContent), /10 chamados abertos/);
      }
      if (quadro === 'imoveis') {
        assert.equal(await b.avaliar(() => document.querySelectorAll('[data-locacao]').length), 6);
        assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('.gi-barra select')].map(e => e.id)), ['f-finalidade','f-situacao','f-estado','f-porpagina']);
        assert.equal(await b.avaliar(() => document.querySelector('#b-proxima').disabled), true);
        assert.match(await b.avaliar(() => document.querySelector('#gi-origem').textContent), /6 no total/);
      }
      if (quadro === 'marcar') {
        assert.equal(await b.avaliar(() => document.querySelector('#l-catalogo').hidden), true);
        assert.equal(await b.avaliar(() => document.querySelector('#l-locatario').value), 'Carla Menezes · (47) 9 ••••-1234');
        assert.equal(await b.avaliar(() => document.querySelector('#l-aluguel').value), '1.850,00');
        assert.equal(await b.avaliar(() => Math.ceil(document.querySelector('.gi-modal').getBoundingClientRect().width)), 900);
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
      if (quadro === 'marcar') {
        await b.clicar('[data-modo="catalogo"]');
        assert.equal(await b.avaliar(() => document.querySelector('#l-catalogo').hidden), false);
        await b.clicar('[data-modo="fora"]');
        assert.equal(await b.avaliar(() => document.querySelector('#l-fora').hidden), false);
        await b.clicar('[data-modo="catalogo"]');
        await b.avaliar(() => { GI.locacoesCriar = dados => { bancada.gravacaoLocal = dados; return Promise.resolve({ locacao:{ id:999,...dados } }); }; });
        await b.clicar('.gi-modal [data-ok]');
        await b.esperar(() => !document.querySelector('.gi-modal'));
        const payload = await b.avaliar(() => bancada.gravacaoLocal);
        assert.equal(payload.imovel_codigo,'5350412');
        assert.equal(payload.valor_aluguel_centavos,185000);
        assert.equal(payload.inicio,'2026-04-01'); assert.equal(payload.fim,'2027-03-31');
        assert.equal(payload.contatos[0].contato_id,103); assert.equal(payload.garantia,'fiador');
      }
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
