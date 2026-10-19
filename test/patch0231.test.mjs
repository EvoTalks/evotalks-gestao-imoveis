import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('F19 recursos locais e manifest entregam o patch 0.23.1 sem cache antigo', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version, '0.23.1');
  for (const nome of readdirSync(new URL('../app/', import.meta.url)).filter(n => n.endsWith('.html'))) {
    const html = readFileSync(new URL('../app/' + nome, import.meta.url), 'utf8');
    for (const versao of html.matchAll(/[?&]v=([^"'&\s>]+)/g)) assert.equal(versao[1], '0.23.1', nome);
  }
});
