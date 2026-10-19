import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { criarPortalChamados } from './bancada/portal-chamados.mjs';

function carregar() {
  const window = { omni: { queueTypes: { WEBCHAT_V2: 26 } }, addEventListener() {} };
  const sandbox = { window, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), sandbox);
  sandbox.GI = window.GI;
  vm.runInNewContext(readFileSync(new URL('../app/manutencao.js', import.meta.url), 'utf8'), sandbox);
  return window.GI;
}
const plain = v => JSON.parse(JSON.stringify(v));
test('hotfix: atendimento normaliza canal, protocolo, fila e instante para o portal', () => {
  const GI = carregar();
  assert.deepEqual(plain(GI.atendimentoPortal({ id: 8801, channel: 26, protocol: 123, queueId: 91, startedAt: 1760000000000 })),
    { chat_id: 8801, canal: 'WebChat', protocolo: '123', fila: 'Fila 91', iniciado_em: '2025-10-09T08:53:20.000Z' });
  assert.equal(GI.atendimentoPortal({ channel: 999 }).canal, 'Atendimento');
  assert.equal(GI.atendimentoPortal({ channel: 'WhatsApp' }).canal, 'WhatsApp');
  for (const startedAt of [null, undefined, '', 'inválido', {}, [], true, Infinity, NaN, 9e20]) {
    assert.equal(GI.atendimentoPortal({ startedAt }).iniciado_em, null, String(startedAt));
  }
  assert.equal(GI.atendimentoPortal({ startedAt: 0 }).iniciado_em, null);
  assert.equal(GI.atendimentoPortal({ startedAt: '2026-10-19T10:00:00-03:00' }).iniciado_em, '2026-10-19T13:00:00.000Z');
  assert.deepEqual(plain(GI.atendimentoPortal({ id: 1, protocol: {}, queueId: {} })),
    { chat_id: 1, canal: 'Atendimento', protocolo: null, fila: null, iniciado_em: null });
});
test('hotfix: erros de abertura têm frases simples sem resposta crua ou status', () => {
  const GI = carregar();
  assert.match(GI.mensagemErro({ status: 422, dados: { campos: { 'atendimento.canal': 'Informe um texto.' } } }), /Canal:/);
  assert.match(GI.mensagemErro({ status: 400, dados: { campos: { titulo: '<img src=x>' } } }), /Título:/);
  for (const status of [400, 401, 403, 409, 422, 500]) assert.doesNotMatch(GI.mensagemErro({ status, message: '<img src=x>', dados: { campos: { desconhecido: 'Informe um texto.' } } }), /<img|Informe um texto|HTTP/);
  for (const status of [undefined, 0, 502, 503, 504]) assert.match(GI.mensagemErro({ status, message: 'Failed to fetch' }), /Não consegui falar com o servidor/);
  assert.match(GI.mensagemErro({ status: 429 }), /Limite de consultas/);
});
test('hotfix: portal da bancada rejeita canal/data numéricos igual ao real, sem gravar', () => {
  const portal = criarPortalChamados({ locacoes: [{ id: 1, contatos: [] }], semFixtures: true });
  const entrada = { locacao_id: 1, titulo: 'Teste sintético', categoria: 'hidraulica', solicitante: { nome: 'Cliente Demonstração' } };
  const api = corpo => portal.responder('POST', '/chamados', new URLSearchParams(), corpo, 'Agente Demonstração');
  assert.deepEqual(api({ ...entrada, atendimento: { chat_id: 8801, canal: 26, iniciado_em: 1760000000000 } }),
    { status: 422, corpo: { erro: 'dados_invalidos', campos: { 'atendimento.canal': 'Informe um texto.', 'atendimento.iniciado_em': 'Informe um texto.' } } });
  const valido = api({ ...entrada, atendimento: { chat_id: 8801, canal: 'WebChat', iniciado_em: '2025-10-09T08:53:20.000Z' } });
  assert.equal(valido.status, 201); assert.equal(valido.corpo.chamado.numero, 1001);
  assert.equal(api({ ...entrada, atendimento: { chat_id: 8801, canal: null, iniciado_em: null } }).status, 201);
});
