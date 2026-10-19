import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function carregar(omni = {}) {
  const window = { addEventListener() {}, omni };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), { window, omni, document: {}, URL, setTimeout });
  return window.GI;
}
test('nome real usa a lista uma vez por sessão e reserva legível, nunca id isolado', async () => {
  let chamadas = 0;
  const GI = carregar({ data: { request: async () => { chamadas++; return [{ id: 531, name: 'Atendente Sintético' }]; } } });
  await Promise.all([GI.usuarios(), GI.usuarios()]);
  assert.equal(GI.nomeDoUsuario({ id: 531, name: '' }), 'Atendente Sintético');
  assert.equal(GI.nomeDoUsuario({ id: 531, name: 'Nome da sessão' }), 'Nome da sessão');
  assert.equal(GI.nomeDoUsuario({ id: 532, name: ' ' }), 'Usuário 532');
  assert.equal(chamadas, 1);
  for (const falha of [() => { throw Error('fora'); }, () => Promise.reject(Error('fora'))]) {
    const g = carregar({ data: { request: falha } });
    await g.usuarios(); assert.equal(g.nomeDoUsuario({ id: 531 }), 'Usuário 531');
  }
});
test('pessoas: seleção por atendimento, poda de sete dias e restauração', async () => {
  let salvo;
  const GI = carregar({ storage: {
    get: async () => ({ 8801: { contactId: 9902, nome: 'Pessoa sintética', em: Date.now() }, 8802: { contactId: 9903, nome: 'Antiga', em: Date.now() - 8 * 86400000 } }),
    set: async (k, v) => { assert.equal(k, 'gi-pessoa-v1'); salvo = JSON.parse(JSON.stringify(v)); }
  } });
  await GI.pessoas.ler();
  assert.equal(GI.contatoEfetivo({ id: 8801, contactId: 9901 }), 9902);
  assert.equal(GI.contatoEfetivo({ id: 8802, contactId: 9901 }), 9901);
  assert.equal(GI.contatoEfetivo({ id: 8803, contactId: 9901 }), 9901);
  await GI.pessoas.escolher({ id: 8803 }, { id: 9904, name: 'Outra pessoa' });
  assert.equal(salvo[8803].contactId, 9904); assert.equal(salvo[8802], undefined);
  await GI.pessoas.escolher({ id: 8801 }, null);
  assert.equal(GI.contatoEfetivo({ id: 8801, contactId: 9901 }), 9901);
});
test('pessoas: storage indisponível mantém escolha só na sessão', async () => {
  for (const falha of [() => { throw Error('fora'); }, () => Promise.reject(Error('fora'))]) {
    const GI = carregar({ storage: { get: falha, set: falha } });
    await GI.pessoas.ler(); await GI.pessoas.escolher({ id: 8801 }, { id: 9902, name: '<img>' });
    assert.equal(GI.contatoEfetivo({ id: 8801, contactId: 9901 }), 9902);
  }
});
test('máscaras de contato descartam HTML e não revelam telefone nem CPF completos', () => {
  const GI = carregar();
  assert.equal(GI.telefoneDiscreto('<img onerror=x>11987654321'), '(11) 9 ••••-4321');
  assert.equal(GI.telefoneDiscreto('123'), '••••');
  assert.equal(GI.mascaraCpf('<img>12345678901'), '***.456.789-**');
  assert.equal(GI.mascaraCpf('<img>'), '—');
});
