import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function carregar(omni = {}) {
  const window = { addEventListener() {}, omni };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), { window, omni, document: {}, URL, setTimeout });
  return window.GI;
}
test('nome real usa users.list do host uma vez, sem consultar a rota crua', async () => {
  let chamadas = 0, cruas = 0;
  const omni = { users: { list: async () => { chamadas++; return [{ id: 531, name: 'Atendente Teste Cockpit', type: 2, email: 'x@y' }, { id: 9, name: 'Outro', type: 1, email: 'o@y' }]; } }, data: { request: async (...args) => { cruas++; assert.equal(String(args[0]).includes('users'), false); return []; } } };
  const GI = carregar(omni);
  await Promise.all([GI.usuarios(), GI.usuarios()]);
  assert.deepEqual(Array.from(await GI.usuariosOrdenados()), [531, 9]);
  assert.equal(GI.nomeDoUsuario({ id: 531, name: '' }), 'Atendente Teste Cockpit');
  assert.equal(GI.nomeDoUsuario({ id: 531, name: 'Nome da sessão' }), 'Nome da sessão');
  assert.equal(GI.nomeDoUsuario({ id: 532, name: ' ' }), 'Usuário 532');
  assert.equal(chamadas, 1); assert.equal(cruas, 0);
  assert.equal(GI.nomeDoUsuario({ id: 531, fullname: 'Nome completo' }), 'Nome completo');
  for (const falha of [() => { throw Error('fora'); }, () => Promise.reject(Error('fora'))]) {
    const g = carregar({ users: { list: falha } });
    await g.usuarios(); assert.equal(g.nomeDoUsuario({ id: 531 }), 'Usuário 531');
  }
});
test('ordem dos atendentes preserva a ordem original do SDK', async () => {
  const GI = carregar({ users: { list: async () => [
    { id: 9999, name: 'Primeiro', type: 2, email: 'a@b' },
    { id: 9998, name: 'Segundo', type: 2, email: 'b@b' },
    { id: 9997, name: 'Terceiro', type: 2, email: 'c@b' }
  ] } });
  await GI.usuarios();
  assert.deepEqual(Array.from(await GI.usuariosOrdenados()), [9999, 9998, 9997]);
  assert.equal(GI.nomeDoUsuario({ id: 9999 }), 'Primeiro');
  assert.equal(GI.nomeDoUsuario({ id: 1234 }), 'Usuário 1234');
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
test('pessoas: escrita falha preserva escolha pendente e sincroniza quando volta', async () => {
  let escritaOk = false, externo = {};
  const GI = carregar({ storage: {
    get: async () => structuredClone(externo),
    set: async (k, v) => { if (!escritaOk) throw Error('quota'); externo = structuredClone(v); }
  } });
  await GI.pessoas.escolher({ id: 8801 }, { id: 9902, name: 'Pessoa escolhida' });
  await GI.pessoas.ler();
  assert.equal(GI.contatoEfetivo({ id: 8801, contactId: 9901 }), 9902);
  externo[8803] = { contactId: 9904, nome: 'Escolha externa', em: Date.now() };
  await GI.pessoas.ler();
  assert.equal(GI.contatoEfetivo({ id: 8803, contactId: 9901 }), 9904);
  escritaOk = true;
  await GI.pessoas.escolher({ id: 8801 }, { id: 9902, name: 'Pessoa escolhida' });
  await GI.pessoas.ler();
  assert.equal(GI.contatoEfetivo({ id: 8801, contactId: 9901 }), 9902);
  assert.equal(externo[8801].contactId, 9902);
});
test('máscaras de contato descartam HTML e não revelam telefone nem CPF completos', () => {
  const GI = carregar();
  assert.equal(GI.telefoneDiscreto('<img onerror=x>11987654321'), '(11) 9 ••••-4321');
  assert.equal(GI.telefoneDiscreto('123'), '••••');
  assert.equal(GI.mascaraCpf('<img>12345678901'), '***.456.789-**');
  assert.equal(GI.mascaraCpf('<img>'), '—');
});
test('pessoa efetiva sem nome nunca herda nome nem telefone de outro contato', () => {
  const GI = carregar();
  const chat = { id: 8801, contactId: 9901, contact: { name: 'Locatário Demonstração Um', phone: '00000000001' } };
  assert.equal(GI.nomeContato({ id: 9902, name: '', phone: '00000000002' }, chat), '00000000002');
  assert.equal(GI.nomeContato({ id: 9902, name: '', phone: '' }, chat), 'Contato #9902');
  assert.equal(GI.nomeContato({ id: 9901, name: '', phone: '' }, chat), 'Locatário Demonstração Um');
});
test('instâncias mesclam só o chat alterado e releem escolhas e exclusões externas', async () => {
  let mapa = {};
  const storage = {
    get: async () => structuredClone(mapa),
    set: async (k, v) => { mapa = JSON.parse(JSON.stringify(v)); }
  };
  const a = carregar({ storage }), b = carregar({ storage });
  await Promise.all([a.pessoas.ler(), b.pessoas.ler()]);
  await a.pessoas.escolher({ id: 8801 }, { id: 9902, name: 'Pessoa A' });
  await b.pessoas.escolher({ id: 8803 }, { id: 9904, name: 'Pessoa B' });
  assert.equal(mapa[8801]?.contactId, 9902);
  assert.equal(mapa[8803]?.contactId, 9904);
  await a.pessoas.ler();
  assert.equal(a.contatoEfetivo({ id: 8803, contactId: 9901 }), 9904);
  await b.pessoas.escolher({ id: 8801 }, null);
  assert.equal(mapa[8801], undefined);
  assert.equal(mapa[8803].contactId, 9904);
  await a.pessoas.ler();
  assert.equal(a.contatoEfetivo({ id: 8801, contactId: 9901 }), 9901);
  mapa[8802] = { contactId: 9903, em: Date.now() - 8 * 86400000 };
  await a.pessoas.escolher({ id: 8804 }, { id: 9905 });
  assert.equal(mapa[8802], undefined);
  assert.equal(mapa[8803].contactId, 9904);
});
