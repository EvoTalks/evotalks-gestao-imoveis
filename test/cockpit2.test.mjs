import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function modelo() { const ctx = { GI: {}, Date, Object, JSON }; vm.runInNewContext(readFileSync('app/cockpit.js', 'utf8'), ctx); return ctx.GI.cockpit; }
test('resumo e filtros contam apenas abertos; atendimento prevalece sobre urgência', () => {
  const m = modelo(), rows = [{ id: 1, numero: 1, titulo: 'Pintura', status: 'novo', prioridade: 'normal', atendimento: { chat_id: 88 }, sla: { prazo_solucao_em: '2000-01-01T00:00:00Z' } }, { id: 2, numero: 2, titulo: 'Gás', status: 'aprovacao', prioridade: 'emergencia', aprovacao: { status: 'pendente' }, sla: { pausado: true } }, { id: 3, status: 'concluido', prioridade: 'emergencia' }];
  assert.equal(m.resumo(rows).abertos, 2); assert.equal(m.resumo(rows).atrasados, 1); assert.equal(m.resumo(rows).aguardando, 1); assert.equal(m.resumo(rows).emergencias, 1);
  assert.equal(m.listar(rows, 'todos', '', 88)[0].id, 1); assert.equal(m.listar(rows, 'atrasados', '', 88).length, 1);
  assert.equal(m.listar(rows, 'todos', 'OS-2', 88)[0].id, 2); assert.equal(m.listar(rows, 'todos', 'pintura', 88)[0].id, 1);
});
test('snapshot expira em 10 minutos, limita oito contatos e 60 mil caracteres sem arquivos ou segredo', () => {
  const m = modelo(); let dados = [];
  for (let i = 1; i <= 9; i++) dados = m.guardar(dados, i, { locacoes: [{ id: i }], chamados: [{ id: i, titulo: 'Sintético', token: 'não guardar', anexos: ['arquivo'], imovel: { titulo: 'Casa' } }] }, 1000 + i);
  assert.equal(dados.length, 8); assert.equal(m.ler(dados, 1, 2000), null);
  assert.ok(m.ler(dados, 9, 2000)); assert.equal(m.ler(dados, 9, 601009), null);
  assert.doesNotMatch(JSON.stringify(dados), /token|anexos|arquivo/);
  assert.ok(JSON.stringify(m.guardar(dados, 10, { chamados: [{ titulo: 'x'.repeat(61000) }] }, 2000)).length <= 60000);
});
