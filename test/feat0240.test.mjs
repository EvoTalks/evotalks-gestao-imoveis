import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function carregar() {
  const contexto = { window: { addEventListener() {} }, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), contexto);
  contexto.GI = contexto.window.GI;
  vm.runInNewContext(readFileSync('app/cockpit.js', 'utf8'), contexto);
  return contexto;
}
const json = v => JSON.parse(JSON.stringify(v));
test('F24 diff envia só campos editados e acesso completo quando uma parte muda', () => {
  const { GI } = carregar();
  const original = { titulo: 'Título', descricao: null, categoria: 'outros', prioridade: 'normal', acesso: { disponibilidade: 'Manhã', chaves: 'Portaria', sem_cliente: true } };
  const atual = { titulo: 'Título', descricao: '', categoria: 'outros', prioridade: 'normal', disponibilidade: 'Manhã', chaves: 'Portaria', sem_cliente: true };
  assert.deepEqual(json(GI.cockpit.diffEdicao(original, atual)), {});
  assert.deepEqual(json(GI.cockpit.diffEdicao(original, { ...atual, titulo: 'Novo título' })), { titulo: 'Novo título' });
  assert.deepEqual(json(GI.cockpit.diffEdicao(original, { ...atual, chaves: '' })), { acesso: { disponibilidade: 'Manhã', chaves: '', sem_cliente: true } });
  assert.deepEqual(json(GI.cockpit.diffEdicao(original, { ...atual, descricao: 'Relato', categoria: 'eletrica', prioridade: 'alta' })), { descricao: 'Relato', categoria: 'eletrica', prioridade: 'alta' });
  assert.deepEqual(json(GI.cockpit.diffEdicao({ ...original, descricao: 'Apagar' }, atual)), { descricao: '' });
});
