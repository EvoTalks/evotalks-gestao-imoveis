import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = nome => readFileSync(new URL('../app/' + nome, import.meta.url), 'utf8');
test('Gestão e apoio usam os componentes do desenho e navegação sem Prestadores', () => {
  for (const pagina of ['locados','imoveis','campos','config','historico']) {
    const html = ler(pagina + '.html');
    assert.ok(/<body class="gi/.test(html));
    assert.ok(/GI\.cabecalho\(/.test(html));
    assert.doesNotMatch(html, /abaPrestadores/);
  }
  const comum = ler('comum.js').split('GI.cabecalho = function')[1].split('GI.ligarNavegacao')[0];
  assert.doesNotMatch(comum, /gi-prestadores/);
});
test('Locados preserva nove colunas e apresenta contagens reais de chamados', () => {
  const html = ler('locados.html');
  assert.deepEqual([...html.matchAll(/<th(?: [^>]*)?>([^<]+)<\/th>/g)].map(m => m[1]), ['Imóvel','Locatário','Proprietário','Contrato','Vigência','Aluguel','Origem','Chamados','Funções']);
  assert.ok(/l\.chamados_abertos/.test(html));
  assert.ok(/width:195px/.test(html));
});
test('Marcar mantém busca e validações com resumo e segmentos do desenho', () => {
  const js = ler('locacao.js');
  assert.ok(/class="seg/.test(js));
  assert.ok(/código interno/.test(js));
  assert.ok(/l-busca-imovel/.test(js));
  assert.ok(/GI\.locacoesCriar\(dados\)/.test(js));
  assert.ok(/GI\.locacoesAtualizar\(l.id, dados\)/.test(js));
});
test('Gestão conserva ações e payload com a apresentação real em claro e escuro', async () => {
  const { testarGestao } = await import('./fidelidade/gestao-variantes.mjs');
  assert.equal(await testarGestao(),14);
});
