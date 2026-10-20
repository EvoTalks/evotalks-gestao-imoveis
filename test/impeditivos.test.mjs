import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function carregar() {
  const window = { addEventListener() {}, omni: { queueTypes: { WHATSAPP: 0 } } };
  const ctx = { window, document: {}, URL, setTimeout, clearTimeout };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), ctx); ctx.GI = window.GI;
  vm.runInNewContext(readFileSync('app/manutencao.js', 'utf8'), ctx);
  return ctx.GI;
}
test('F14: segundos Unix, ms e ISO convergem; inválidos e 1970 são desconhecidos', () => {
  const GI = carregar();
  for (const v of [1760000000, 1760000000000, '2025-10-09T05:53:20-03:00']) assert.equal(GI.dataDoChat(v), '2025-10-09T08:53:20.000Z');
  for (const v of [null, undefined, 0, -1, Infinity, NaN, '', 'inválido', true, {}, [], '1970-01-21T12:00:00Z', '2101-01-01T00:00:00Z', '2025-10-09T08:53:20']) assert.equal(GI.dataDoChat(v), null, String(v));
  assert.equal(GI.dataDoChat(1792379596), '2026-10-19T03:13:16.000Z');
  assert.equal(GI.atendimentoPortal({ id: 1, startedAt: 1760000000 }).iniciado_em, '2025-10-09T08:53:20.000Z');
  assert.equal(GI.unirHistoricoAtendimentos([{ id: 1, begintime: 1760000000 }], [])[0].iniciado_em, '2025-10-09T08:53:20.000Z');
  assert.doesNotMatch(GI.atendimentoTexto({ chat_id: 1, canal: 'WhatsApp', fila: 'Fila Sintética', iniciado_em: '1970-01-21T12:00:00Z' }), /1970/);
});
test('F14: encerrado só oferece Reabrir para Triagem', () => {
  const GI = carregar();
  for (const status of ['concluido', 'cancelado']) {
    const mapa = GI.statusDisponiveis(status);
    assert.deepEqual(Object.keys(mapa), [status, 'triagem']); assert.match(mapa.triagem, /Reabrir/);
  }
  assert.deepEqual(Object.keys(GI.statusDisponiveis('novo')), Object.keys(GI.CHAMADO_STATUS));
  assert.match(GI.mensagemErro({ dados: { erro: 'aprovacao_pendente' } }), /Gestão → Aprovação/);
  assert.match(GI.mensagemErro({ dados: { erro: 'chamado_encerrado' } }), /Use Reabrir/);
});
test('F14: abertura habilitada e exceção de gestão idêntica ao hotfix', () => {
  const m = JSON.parse(readFileSync('manifest.json'));
  assert.equal(m.config.find(c => c.key === 'cockpitAbreChamado'), undefined);
  for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores']) assert.equal(m.contributions[0].items.find(c => c.id === id), undefined);
  assert.deepEqual(Array.from(carregar().GESTORES_EXTRA), [531]);
});

test('F14: portal estrito rejeita ISO em 1970/2101 sem gravar', async () => {
  const { criarPortalChamados } = await import('./bancada/portal-chamados.mjs');
  const p = criarPortalChamados({ locacoes: [{ id: 1, contatos: [] }], semFixtures: true });
  for (const iniciado_em of ['1970-01-21T12:00:00Z', '2101-01-01T00:00:00Z']) {
    const r = p.responder('POST', '/chamados', new URLSearchParams(), { locacao_id: 1, titulo: 'Data Sintética F14', categoria: 'outros', solicitante: { nome: 'Cliente Sintético' }, atendimento: { chat_id: 1, iniciado_em } }, 'Agente Sintético');
    assert.equal(r.status, 422); assert.ok(r.corpo.campos['atendimento.iniciado_em']);
  }
});
