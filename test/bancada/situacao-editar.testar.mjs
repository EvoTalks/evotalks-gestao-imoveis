import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { PERMISSOES_PADRAO } from './portal-permissoes.mjs';

const s = criarServidor({ campos: [{ id: 1, rotulo: 'Observação sintética', tipo: 'texto', ativo: true }], permissoes: {
  9999: { ...PERMISSOES_PADRAO, mudar_situacao: true }
}, situacoes: { 'DEMO-002': 'reservado' } });
await new Promise(r => s.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + s.address().port;
let b;
async function abrir(perfil = 'admin') {
  await b.navegar(origem + '/app/imoveis.html?perfil=' + perfil);
  await b.esperar(() => !!document.querySelector('[data-abrir]'));
  await b.clicar('[data-abrir="DEMO-001"]');
  await b.esperar(() => !!document.querySelector('[data-campo="1"]'));
}
try {
  b = await abrirChromium();
  await abrir();
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal-corpo select').getAttribute('data-situacao-editar')), '');
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao-editar]').previousElementSibling.textContent), 'Situação');
  assert.deepEqual(await b.avaliar(() => [...document.querySelector('[data-situacao-editar]').options].map(o => [o.value, o.textContent])), [
    ['disponivel', 'Disponível'], ['reservado', 'Reservado'], ['indisponivel', 'Indisponível']
  ]);
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao-editar]').value), 'disponivel');
  await b.preencher('[data-situacao-editar]', 'reservado');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  let post = await b.avaliar(() => bancada.chamadas.find(c => c.method === 'POST' && /\/imoveis\/DEMO-001\/situacao$/.test(c.caminho)));
  assert.equal(post.autor, 'Agente Demonstração');
  assert.deepEqual(JSON.parse(post.body), { situacao: 'reservado' });
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').value), 'reservado');

  await abrir();
  await b.preencher('[data-situacao-editar]', 'indisponivel');
  await b.preencher('[data-campo="1"]', 'valor junto da situação');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.ok(await b.avaliar(() => bancada.chamadas.some(c => c.method === 'POST' && c.caminho === '/api/ext/valores/DEMO-001')));
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').value), 'indisponivel');

  await abrir();
  await b.preencher('[data-situacao-editar]', 'disponivel');
  await b.preencher('[data-campo="1"]', 'texto mantido após erro');
  await b.avaliar(() => { bancada.falharSituacao = true; });
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('Situação inválida'));
  assert.equal(await b.avaliar(() => document.querySelector('[data-campo="1"]').value), 'texto mantido após erro');
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal').checkVisibility()), true);
  await b.avaliar(() => { bancada.falharSituacao = false; });
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));

  await fetch(origem + '/api/ext/permissoes/9999', { method: 'POST', headers: {
    Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json',
    'X-GI-User-Id': '9999', 'X-GI-User-Type': '0'
  }, body: JSON.stringify({ nome: 'Agente Demonstração', ...PERMISSOES_PADRAO, editar_imoveis: true, mudar_situacao: false }) });
  await abrir('agente');
  assert.equal(await b.avaliar(() => !!document.querySelector('[data-situacao-editar]')), false);
  assert.match(await b.avaliar(() => document.querySelector('[data-situacao-editar-selo]').textContent), /Disponível/);

  await abrir();
  await b.preencher('[data-situacao-editar]', 'reservado');
  await b.clicar('.gi-modal [data-cancelar]');
  assert.match(await b.avaliar(() => document.querySelector('[data-descartar-edicao]').textContent), /Descartar as alterações\?/);
  await b.clicar('[data-descartar-sim]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS situação no Editar: primeiro campo, valor atual, gravação isolada e junto dos campos, autoria, atualização da linha, erro preserva formulário, permissão somente leitura e descarte; FAIL 0\n');
} finally { if (b) await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
