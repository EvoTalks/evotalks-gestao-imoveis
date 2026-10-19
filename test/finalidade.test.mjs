import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function carregar() {
  const window = { addEventListener() {} };
  const sandbox = { window, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), sandbox);
  return { GI: window.GI, sandbox };
}
const produto = (description, name = '') => ({ description, name, internalcode: name, category: 'Tipo > Cidade > Bairro', value: 100 });

test('finalidade reconhece prefixos reais e aliases sem acento', () => {
  const { GI } = carregar();
  for (const [description, expected] of [
    ['[Venda] Apartamento', 'venda'], ['[Locacao] Terreno', 'locacao'], ['[Locação] Casa', 'locacao'],
    ['[ALUGUEL] Casa', 'locacao'], ['  [VENDA] Casa', 'venda'], ['Casa [Venda]', ''], ['', ''], [null, '']
  ]) assert.equal(GI.finalidadeDoImovel({ description }), expected);
});

test('consulta no servidor aplica finalidade no nível provado e não usa and', async () => {
  for (const [filtros, esperado] of [
    [{ finalidade: 'locacao' }, { description: { startsWith: '[Locacao]' } }],
    [{ finalidade: 'venda', termo: 'terreno', bairro: 'Bairro' }, { description: { startsWith: '[Venda]' } }]
  ]) {
    const { GI, sandbox } = carregar(); let recurso;
    GI.cfg = (_k, padrao) => padrao;
    sandbox.omni = { data: { request: async r => { recurso = r; return { products: [] }; } } };
    sandbox.window.omni = sandbox.omni;
    await GI.buscarImoveis(filtros);
    const url = new URL('http://local/' + recurso);
    const where = JSON.parse(url.searchParams.get('where'));
    assert.equal(where.and, undefined);
    if (filtros.termo) {
      assert.ok(Array.isArray(where.or));
      assert.ok(where.or.every(clause => JSON.stringify(clause.description) === JSON.stringify(esperado.description)));
    } else assert.deepEqual(JSON.parse(JSON.stringify(where.description)), esperado.description);
  }
});

test('fallback local filtra finalidade antes de paginar', async () => {
  const { GI, sandbox } = carregar(); let first = true;
  GI.cfg = (_k, padrao) => padrao;
  sandbox.omni = { data: { request: async resource => {
    if (resource.includes('?where=')) throw new Error('where recusado');
    if (first) { first = false; return { products: [produto('[Locacao] Terreno', 'L1'), produto('[Venda] Casa', 'V1')] }; }
    return { products: [] };
  } } };
  sandbox.window.omni = sandbox.omni;
  const resultado = await GI.buscarImoveis({ finalidade: 'locacao', porPagina: 25 });
  assert.deepEqual(Array.from(resultado.itens, p => p.internalcode), ['L1']);
  assert.equal(resultado.total, 1);
});

test('tela oferece seletor Finalidade, faz consulta na troca e limpa para todas', () => {
  const html = readFileSync(new URL('../app/imoveis.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="f-finalidade">Finalidade<\/label>[\s\S]*?<select id="f-finalidade">\s*<option value="">todas<\/option><option value="locacao">Locação<\/option><option value="venda">Venda<\/option>/);
  assert.match(html, /estado\.finalidade = el\('f-finalidade'\)\.value; estado\.pagina = 1;\s*carregar\(\)/);
  assert.match(html, /el\('f-finalidade'\)\.value = ''/);
  assert.match(html, /finalidade: estado\.finalidade/);
});
