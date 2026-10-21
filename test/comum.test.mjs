import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function carregar() {
  const window = { addEventListener() {} };
  const contexto = { window, document: {}, console, URL, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), contexto);
  return { GI: window.GI, contexto };
}

test('cabeçalho só oferece Imóveis, Campos, Histórico e Configurações', () => {
  const { GI } = carregar();
  for (const type of [0, 1, 2]) {
    GI.ctx = () => ({ user: { type } });
    const html = GI.cabecalho('gi-imoveis');
    assert.match(html, /gi-nav-ativo">Imóveis/);
    assert.doesNotMatch(html, /Locados|Chamados|Prestadores/);
    assert.ok(html.indexOf('Imóveis') < html.indexOf('Campos'));
    assert.ok(html.indexOf('Campos') < html.indexOf('Histórico'));
  }
});

test('F19 recado e toast normalizam um único ícone sem alterar os chamadores', () => {
  const { GI, contexto } = carregar();
  const toasts = [];
  const box = { setAttribute() {}, appendChild(el) { this.filhos.push(el); }, focus() {}, filhos: [] };
  contexto.clearTimeout = () => {};
  contexto.setTimeout = () => 1;
  contexto.document = { createElement: () => ({ setAttribute() {} }) };
  contexto.omni = { ui: { toast: (texto, tipo) => { toasts.push({ texto, tipo }); } } };
  for (const [texto, tipo, esperado] of [['✓ salvo', 'sucesso', '✓ salvo'], ['salvo', 'sucesso', '✓ salvo'], ['! falhou', 'erro', '! falhou']]) {
    box.filhos = [];
    GI.recado(texto, tipo, box);
    assert.equal(box.filhos[0].textContent, esperado);
    assert.equal(toasts.at(-1).texto, esperado.slice(2));
  }
});

test('F24 erros do host e status zero nunca expõem texto técnico', () => {
  const { GI } = carregar();
  assert.equal(GI.mensagemErro('Failed to fetch'), 'Não consegui falar com o servidor. Confira sua conexão e tente de novo.');
  for (const erro of ['Http failure response for https://instancia.invalid/extensionsruntime/proxy: 0 Unknown Error', 'Unknown Error', 'ERR_CONNECTION_RESET', 'NetworkError', 'Failed to fetch', 'status 0', 'extensionsruntime', { status: 0 }, { message: 'outro', code: 'ERR_ABORTED' }, { dados: { erro: 'Http failure response' } }]) {
    assert.equal(GI.mensagemErro(typeof erro === 'string' ? { message: erro } : erro), 'Não consegui falar com o servidor. Confira sua conexão e tente de novo.');
  }
});
test('F24 timeout de escrita é 30s, leitura continua em 20s', async () => {
  const { GI, contexto: ctx } = carregar();
  GI.cfg = (k, p) => ({ portalUrl: 'https://portal.invalid', portalToken: 'sintetico-invalido' })[k] || p;
  ctx.window.location = { origin: 'https://extensao.invalid' };
  const ops = [];
  ctx.omni = ctx.window.omni = { http: { request: async op => { ops.push(op); return { status: 200, body: '{}' }; } }, storage: { get: async () => null, set: async () => {} } };
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) await GI.chamarPortal('/imoveis/DEMO-001/situacao', { method });
  assert.deepEqual(ops.map(op => op.timeout), [20000, 30000, 30000, 30000, 30000]);
});

for (const [nome, rejeicao] of [
  ['string', 'Http failure response: 0 Unknown Error'],
  ['null', null],
  ['objeto congelado', Object.freeze({ message: 'Failed to fetch', code: 'ERR_NETWORK' })],
  ['Error congelado', Object.freeze(new Error('NetworkError'))]
]) test('RC12 transporte normaliza rejeição por ' + nome + ' sem TypeError', async () => {
  const { GI, contexto } = carregar();
  GI.cfg = (chave, padrao) => chave === 'portalUrl' ? 'https://portal.invalid' : padrao;
  contexto.window.location = { origin: 'https://extensao.invalid' };
  contexto.omni = contexto.window.omni = { http: { request: () => Promise.reject(rejeicao) } };
  await assert.rejects(() => GI.chamarPortal('/imoveis/DEMO-001/situacao', { corpo: {} }), err => {
    assert.equal(err.name, 'Error');
    assert.equal(err.semResposta, true);
    assert.equal(err.message, 'Não consegui falar com o servidor. Confira sua conexão e tente de novo.');
    assert.equal(GI.mensagemErro(err), err.message);
    return true;
  });
});
