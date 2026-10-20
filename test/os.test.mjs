import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = n => readFileSync(new URL('../' + n, import.meta.url), 'utf8');
test('F11: diálogo gi-os acessível aos três perfis e edição compartilhada', () => {
  const m = JSON.parse(ler('manifest.json'));
  const os = m.contributions.find(c => c.id === 'gi-os');
  assert.equal(os, undefined, 'O.S. dormente fora do manifesto');
  assert.match(ler('app/os.html'), /id="b-fechar"/);
  assert.match(ler('app/os.js'), /Voltar ao cockpit/);
  assert.match(ler('app/os.css'), /\.gi-form-inline \.gi-modal-corpo \{[^}]*overflow-y:auto/);
  for (const tela of ['chamados', 'os']) assert.match(ler('app/' + tela + '.html'), /chamado-form\.js\?v=0\.26\.3/);
  for (const nome of ['app/os.js', 'app/painel.js', 'app/chamado-form.js']) assert.doesNotMatch(ler(nome), /\bopenHtml\b|\b(?:prompt|confirm|alert)\s*\(/);
});
