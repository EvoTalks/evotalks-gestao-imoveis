import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function carregar() {
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), { window, document: {}, URL, setTimeout });
  return window.GI;
}
test('detalhe lê a rota única com código escapado e normaliza campos e centavos', async () => {
  const GI = carregar(), chamadas = [];
  GI.modo = 'portal';
  GI.chamarPortal = async rota => { chamadas.push(rota); return { imovel: { titulo: 'Sintético' }, valores: [
    { campo_id: 1, valor_centavos: '12345', observacao: 'mensal', recorrencia: 'mensal' },
    { campo_id: 2, valor_num: '0' }, { campo_id: 3, valor_texto: 'nao' }, { campo_id: 4, valor_texto: null },
    { campo_id: 5, valor_texto: null, observacao: 'consultar' }
  ] }; };
  const r = await GI.detalheDoImovel('A/B & C');
  assert.deepEqual(chamadas, ['/imovel/A%2FB%20%26%20C']);
  assert.equal(r.imovel.titulo, 'Sintético');
  assert.equal(r.valores[1].valor, 123.45);
  assert.equal(r.valores[2].valor, 0);
  assert.equal(r.valores[3].valor, 'nao');
  assert.equal(r.valores[4], undefined);
  assert.equal(r.valores[5].obs, 'consultar');
});
test('detalhe sem portal ou resposta inválida rejeita para o fallback da tela', async () => {
  const GI = carregar();
  for (const modo of ['local', 'portal-fora']) {
    GI.modo = modo;
    await assert.rejects(GI.detalheDoImovel('ABC'), /Dados do site indisponíveis agora/);
  }
  GI.modo = 'portal';
  for (const resposta of [null, {}, { imovel: null }, { imovel: {}, valores: 'inválido' }]) {
    GI.chamarPortal = async () => resposta;
    await assert.rejects(GI.detalheDoImovel('ABC'), /Dados do site indisponíveis agora/);
  }
  GI.chamarPortal = async () => { throw new Error('HTTP 404'); };
  await assert.rejects(GI.detalheDoImovel('ABC'), /404/);
});
