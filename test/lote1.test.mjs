import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function carregar() {
  const window = { addEventListener() {}, omni: { queueTypes: { WHATSAPP: 0, WEBCHAT: 3 } } };
  const ctx = { window, document: {}, URL, console, setTimeout, clearTimeout, omni: window.omni };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), ctx); ctx.GI = window.GI;
  return { GI: ctx.GI, ctx };
}
const plain = v => JSON.parse(JSON.stringify(v));
test('lote 1: autoria aceita cabeçalho Latin1 sem controles nem codificação', () => {
  const { GI } = carregar();
  assert.equal(GI.autorCabecalho('  Agente “Teste” 😀\r\n ç  '), 'Agente ?Teste? ?? ç');
});
test('lote 1: reais com ponto decimal ou milhar brasileiro', () => {
  const { GI } = carregar();
  for (const v of ['1.500,00', '1500,00', '1500.00', 'R$ 1.500,00']) assert.equal(GI.valorReais(v), 150000);
  assert.equal(GI.paraNumero('1500.00'), 1500);
  for (const v of ['1.50,00', 'x', '-2', '1,234', '<img>']) assert.throws(() => GI.valorReais(v), /Informe o valor em reais, por exemplo 1.500,00/);
});
test('lote 1: erro HTTP e campo desconhecido nunca chegam crus à interface', () => {
  const { GI } = carregar();
  assert.doesNotMatch(GI.mensagemErro({ status: 500, dados: { erro: 'HTTP 500' } }), /HTTP|500/);
  assert.equal(GI.mensagemErro({ status: 400, dados: { campos: { desconhecido: 'Informe um texto.' } } }), 'Não foi possível concluir. Confira os dados e tente de novo.');
});
