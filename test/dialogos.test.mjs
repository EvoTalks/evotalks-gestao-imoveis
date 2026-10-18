import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

function dialogosNativos(codigo) {
  // Mascara comentários e literais para não confundir exemplos em texto com chamadas.
  const executavel = codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ' ');
  return [...executavel.matchAll(/(?<![\w$.])(?:(?:window|globalThis)\s*\.\s*(?:prompt|confirm|alert)\b|(?:prompt|confirm|alert)\s*\()/g)].map(r => r[0]);
}
function scriptsHtml(html) {
  const codigo = html.replace(/<!--[\s\S]*?-->/g, ' ');
  return [...codigo.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(r => r[1]).concat(
    [...codigo.matchAll(/\bon\w+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(r => r[1] || r[2])).join('\n');
}

test('detector reprova diálogo nativo e permite confirmações da extensão e comentários', () => {
  for (const codigo of ['window.prompt("Motivo")', 'prompt ("Motivo")', 'confirm("Cancelar?")', 'window.alert("Erro")', 'window . confirm ("Cancelar")', 'var perguntar = window.prompt;']) {
    assert.equal(dialogosNativos(codigo).length, 1, codigo);
  }
  assert.deepEqual(dialogosNativos('// prompt("ignorar")\n/* alert(1) */ GI.confirmar(); confirmar(); confirmarAcao(); GI.confirm(); omni.ui.confirm(); var texto = "prompt(1) // exemplo";'), []);
  assert.equal(dialogosNativos(scriptsHtml('<button onclick="alert(1)">Teste</button><script>window.prompt("Motivo")</script>')).length, 2);
  assert.deepEqual(dialogosNativos(scriptsHtml('<!-- <script>alert(1)</script> -->')), []);
});

test('app não chama diálogos nativos em JS ou HTML', () => {
  for (const nome of readdirSync(new URL('../app/', import.meta.url)).filter(n => /\.(js|html)$/.test(n))) {
    const codigo = readFileSync(new URL('../app/' + nome, import.meta.url), 'utf8');
    assert.deepEqual(dialogosNativos(nome.endsWith('.html') ? scriptsHtml(codigo) : codigo), [], nome);
  }
});
