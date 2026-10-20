import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = nome => readFileSync(new URL('../app/' + nome, import.meta.url), 'utf8');
test('Gestão e apoio usam os componentes do desenho e navegação sem Prestadores', () => {
  for (const pagina of ['imoveis','campos','config','historico']) {
    const html = ler(pagina + '.html');
    assert.ok(/<body class="gi/.test(html));
    assert.ok(/GI\.cabecalho\(/.test(html));
    assert.doesNotMatch(html, /abaPrestadores/);
  }
  const comum = ler('comum.js').split('GI.cabecalho = function')[1].split('GI.ligarNavegacao')[0];
  assert.doesNotMatch(comum, /gi-prestadores/);
});
test('Gestão conserva ações e payload com a apresentação real em claro e escuro', async () => {
  const { testarGestao } = await import('./fidelidade/gestao-variantes.mjs');
  assert.equal(await testarGestao(),10);
});
