import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { testarLoteY } from './lote-y.cenarios.mjs';
import { testarFotos } from './fotos.cenarios.mjs';
import { testarSimplificacao } from './simplificar.cenarios.mjs';
const servidor = criarServidor();
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
try {
  b = await abrirChromium();
  await testarSimplificacao(b, origem);
  await testarFotos(b, origem);
  // Paginação permanece na lista, sem depender da quantidade de fixtures anteriores.
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  await b.avaliar(async () => {
    for (let i = 0; i < 27; i++) await GI.chamadosCriar({ locacao_id: 1, titulo: 'Página sintética ' + i, categoria: 'outros', solicitante: { nome: 'Pessoa Demonstração', contato_id: 9901 } });
  });
  await b.preencher('#f-busca', 'Página sintética'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 25);
  await b.clicar('#b-proxima'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 2);
  await b.clicar('#b-anterior'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 25);
  await b.preencher('#f-porpagina', '50'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 27);
  for (const modo of ['local', 'fora', 'demonstracao']) {
    await b.navegar(origem + '/app/chamados.html?' + (modo === 'demonstracao' ? 'demonstracao=1' : 'modo=' + modo));
    await b.esperar(() => document.querySelector('#b-novo').disabled);
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
    if (modo === 'demonstracao') assert.equal(await b.avaliar(() => bancada.rede.length), 0);
  }
  await testarLoteY(b, origem);
  assert.deepEqual(b.erros, []);
  process.stdout.write('OK paginação 27 resultados; sem portal e demonstração bloqueiam escrita; zero exceções\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve));
}
