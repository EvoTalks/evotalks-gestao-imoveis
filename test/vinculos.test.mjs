import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
test('F10: interface só escolhe atendimento pela lista', () => {
  for (const f of readdirSync('app').filter(f => /\.(js|html)$/.test(f))) {
    assert.equal(/c-chat-id|c-protocolo|c-vincular-manual|c-informar|protocolo ou número/.test(readFileSync('app/' + f, 'utf8')), false, f);
  }
});
test('F10: histórico inclui encerrados, vence em metadados e preserva última do SDK', () => {
  const GI = {}, sandbox = { GI, window: { GI, omni: { queueTypes: { WHATSAPP: 0, WEBCHAT_V2: 47 } } } };
  vm.runInNewContext(readFileSync('app/manutencao.js', 'utf8'), sandbox);
  const rows = GI.unirHistoricoAtendimentos([
    { id: 8801, status: 1, begintime: '2026-10-18T12:00:00Z', origin: 0, protocol: '', qname: 'Fila Sintética' },
    { id: 8899, status: 0, begintime: '2026-10-19T12:00:00Z', origin: 999, protocol: 'DEMO-INVALIDO', endreason: '<img>' }
  ], [{ chat_id: 8801, fila: 'Fila 91', ultima: 'Mensagem sintética', vivo: true }]);
  const abertos = GI.mesclarAtendimentos([[{ id: 8888, contactId: 9901, status: 'open', channel: 47, startedAt: Date.parse('2026-10-21T12:00:00Z') }]], 9901, []);
  assert.equal(abertos[0].iniciado_em, '2026-10-21T12:00:00.000Z'); assert.equal(abertos[0].canal, 'WebChat');
  assert.equal(GI.unirHistoricoAtendimentos([], abertos)[0].chat_id, 8888);
  assert.equal(GI.canalAtendimento(47), 'WebChat'); assert.equal(GI.canalAtendimento(4), 'Atendimento');
  assert.equal(GI.canalAtendimento('__proto__'), 'Atendimento'); assert.equal(GI.canalAtendimento('constructor'), 'Atendimento');
  assert.equal(rows.length, 2); assert.equal(rows[0].chat_id, 8899); assert.equal(rows[0].vivo, false);
  assert.equal(rows[0].canal, 'Atendimento'); assert.equal(rows[0].motivo, '<img>');
  assert.equal(rows[1].protocolo, null); assert.equal(rows[1].fila, 'Fila Sintética'); assert.equal(rows[1].ultima, 'Mensagem sintética');
});
