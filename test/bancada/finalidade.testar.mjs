import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const servidor = criarServidor();
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
try {
  b = await abrirChromium();
  await b.navegar(origem + '/app/imoveis.html?perfil=admin');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Apartamento Demonstração Alfa'));
  assert.deepEqual(await b.avaliar(() => [...document.querySelector('#f-finalidade').options].map(o => [o.value, o.textContent])), [['', 'todas'], ['locacao', 'Locação'], ['venda', 'Venda']]);
  assert.match(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /Locação/);
  await b.preencher('#f-finalidade', 'locacao');
  await b.esperar(() => document.querySelectorAll('#gi-corpo tr').length === 1 && document.querySelector('#gi-corpo').textContent.includes('DEMO-001'));
  assert.match(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /Locação/);
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /DEMO-002|DEMO-003/);
  await b.preencher('#f-finalidade', 'venda');
  await b.esperar(() => document.querySelectorAll('#gi-corpo tr').length === 1 && document.querySelector('#gi-corpo').textContent.includes('DEMO-002'));
  await b.clicar('#b-limpar');
  await b.esperar(() => document.querySelectorAll('#gi-corpo tr').length === 3);
  assert.equal(await b.avaliar(() => document.querySelector('#f-finalidade').value), '');
  process.stdout.write('OK finalidade: opções, filtro server side, descrição real, Limpar restaura Todas\n');

  await b.avaliar(() => {
    window.promessas = [];
    GI.buscarImoveis = filtros => new Promise(resolve => window.promessas.push({ filtros, resolve }));
  });
  await b.preencher('#f-finalidade', 'locacao');
  await b.preencher('#f-finalidade', 'venda');
  assert.deepEqual(await b.avaliar(() => window.promessas.map(p => [p.filtros.finalidade, p.filtros.pagina])), [['locacao', 1], ['venda', 1]]);
  await b.avaliar(() => window.promessas[1].resolve({ itens: [{ internalcode: 'VENDA-NOVA', name: 'Resposta Venda Nova', description: '[Venda] Casa', category: 'Casa > Cidade > Bairro', value: 100 }], total: 1, ms: 1 }));
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Resposta Venda Nova'));
  await b.avaliar(() => window.promessas[0].resolve({ itens: [{ internalcode: 'LOCACAO-ANTIGA', name: 'Resposta Antiga', description: '[Locacao] Casa', category: 'Casa > Cidade > Bairro', value: 100 }], total: 1, ms: 1 }));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.match(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /Resposta Venda Nova/);
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /Resposta Antiga/);
  process.stdout.write('OK finalidade: resposta antiga não sobrescreve seleção mais recente\n');
} finally {
  if (b) await b.fechar();
  await new Promise(resolve => servidor.close(resolve));
}
