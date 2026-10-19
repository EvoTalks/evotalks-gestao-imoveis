import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = n => readFileSync(new URL('../' + n, import.meta.url), 'utf8');
test('F11: diálogo gi-os acessível aos três perfis e edição compartilhada', () => {
  const m = JSON.parse(ler('manifest.json'));
  const os = m.contributions.find(c => c.id === 'gi-os');
  assert.ok(os, 'contribuição gi-os ausente');
  assert.equal(os.type, 'chatMenu'); assert.equal(os.url, 'app/os.html');
  assert.deepEqual(os.visibility.userTypes, [0, 1, 2]);
  assert.deepEqual(os.presentation, { mode: 'dialog', size: 'xl' });
  for (const tela of ['chamados', 'os']) assert.match(ler('app/' + tela + '.html'), /chamado-form\.js\?v=0\.23\.1/);
  for (const nome of ['app/os.js', 'app/painel.js', 'app/chamado-form.js']) assert.doesNotMatch(ler(nome), /\bopenHtml\b|\b(?:prompt|confirm|alert)\s*\(/);
});
