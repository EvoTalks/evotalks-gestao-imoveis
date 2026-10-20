import test from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './bancada/servidor.mjs';

test('portal de mentira oferece o contrato HTTP para exercitar as telas', async t => {
  const servidor = criarServidor();
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => { servidor.closeAllConnections(); return new Promise(resolve => servidor.close(resolve)); });
  const origem = 'http://127.0.0.1:' + servidor.address().port;
  async function api(rota, dados, autor = 'Agente Teste Sintético') {
    const r = await fetch(origem + '/api/ext' + rota, { method: dados === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json', 'X-GI-Autor': autor },
      body: dados === undefined ? undefined : JSON.stringify(dados) });
    return { status: r.status, ...(await r.json()) };
  }
  const inquilino = { contato_id: 9901, papel: 'locatario', nome: 'Locatário Teste Sintético' };
  assert.equal((await fetch(origem + '/api/ext/locacoes')).status, 401);
  const html = await (await fetch(origem + '/app/imoveis.html')).text();
  assert.ok(html.indexOf('/test/bancada/omni-stub.js') < html.indexOf('src="comum.js'));
  assert.equal((await fetch(origem + '/app/../README.md')).status, 404);
  const lista = await api('/locacoes');
  assert.equal(lista.total, 3);
  assert.equal(lista.resumo.ativas, 3);
  assert.equal((await api('/locacoes?contrato=vencendo')).total, 2);
  assert.equal((await api('/locacoes?busca=avulso&por_pagina=1')).rows.length, 1);
  assert.equal((await api('/locacoes?origem=imogestao')).total, 0);
  const criado = await api('/locacoes', { imovel_codigo: 'DEMO-001', contatos: [inquilino], inicio: '2026-01-01', fim: '2027-01-01' });
  assert.equal(criado.status, 201);
  assert.equal(criado.locacao.imovel_titulo, 'Apartamento Demonstração Alfa');
  assert.equal(criado.locacao.inicio, '2026-01-01');
  assert.equal((await api('/locacoes', { imovel_codigo: 'DEMO-001', contatos: [inquilino] })).status, 409);
  assert.equal((await api('/locacoes/mapa')).locados['DEMO-001'].locacao_id, criado.locacao.id);
  assert.ok((await api('/contatos/9901/locacoes')).rows.some(l => l.id === criado.locacao.id));
  const id = criado.locacao.id;
  const atualizado = await api('/locacoes/' + id, { contatos: [{ ...inquilino, contato_id: 9902 }], contrato_numero: 'DEMO-C' });
  assert.equal(atualizado.locacao.contatos[0].contato_id, 9902);
  const encerrado = await api('/locacoes/' + id + '/encerrar', { motivo: 'Fim do teste sintético' });
  assert.equal(encerrado.locacao.motivo_encerramento, 'Fim do teste sintético');
  assert.equal((await api('/locacoes/' + id + '/encerrar', {})).status, 409);
  assert.equal((await api('/locacoes/mapa')).locados['DEMO-001'], undefined);
  const detalhe = await api('/locacoes/' + id);
  assert.deepEqual(detalhe.historico.map(h => h.acao), ['criou', 'atualizou', 'encerrou']);
  assert.ok(detalhe.historico.every(h => h.autor === 'Agente Teste Sintético'));
  assert.ok((await api('/locacoes?contrato=encerradas')).rows.some(l => l.id === id));
  assert.equal((await api('/locacoes', { imovel_codigo: 'DEMO-001', contatos: [inquilino] })).status, 201);
  const candidatura = (await api('/locacoes/candidatas')).rows[0];
  const saido = await api('/locacoes', { imovel_codigo: candidatura.codigo, imovel: { titulo: candidatura.titulo }, contatos: [inquilino] });
  assert.equal(saido.status, 201);
  assert.equal((await api('/locacoes/candidatas')).total, 0);
  const avulso = await api('/locacoes', { imovel: { titulo: 'Avulso Teste Sintético' }, contatos: [inquilino] });
  assert.equal(avulso.locacao.imovel_codigo, null);
  assert.equal((await api('/locacoes', { imovel: { titulo: 'Sem locatário' }, contatos: [] })).status, 422);
  assert.equal((await api('/locacoes', { contrato_numero: 'FORCAR-422', contatos: [inquilino] })).status, 422);
});
