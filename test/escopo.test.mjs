import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const ler = n => readFileSync(new URL('../' + n, import.meta.url), 'utf8');
test('todos os arquivos publicados são alcançados pelas quatro telas e pelo ícone', () => {
  const manifest = JSON.parse(ler('manifest.json'));
  const itens = manifest.contributions.flatMap(c => c.items || []);
  assert.deepEqual(itens.map(i => i.url), ['app/imoveis.html', 'app/campos.html', 'app/historico.html', 'app/config.html']);
  const alcancados = new Set([manifest.icon, ...itens.map(i => i.url)]);
  for (const pagina of itens) {
    for (const m of ler(pagina.url).matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)) {
      alcancados.add('app/' + m[1]);
    }
  }
  assert.deepEqual([...alcancados].sort(), readdirSync(new URL('../app/', import.meta.url)).map(n => 'app/' + n).sort());
  for (const n of ['app/comum.js', ...itens.map(i => i.url)]) {
    assert.doesNotMatch(ler(n), /\/(?:chamados|prestadores|locacoes)(?:['"/?])|gi-os|gi-cockpit|gi-pessoa/);
  }
});
