import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('F24 recursos locais e manifest entregam a versão 0.30.0 sem cache antigo', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version, '0.30.0');
  for (const nome of readdirSync(new URL('../app/', import.meta.url)).filter(n => n.endsWith('.html'))) {
    const html = readFileSync(new URL('../app/' + nome, import.meta.url), 'utf8');
    for (const versao of html.matchAll(/[?&]v=([^"'&\s>]+)/g)) assert.equal(versao[1], /^(painel|os|chamados|prestadores)\.html$/.test(nome) ? '0.26.3' : '0.30.0', nome);
  }
});

test('0.30.0 apresenta a situação como primeiro campo da edição e mantém as permissões', () => {
  const html = readFileSync(new URL('../app/imoveis.html', import.meta.url), 'utf8');
  const edicao = html.slice(html.indexOf('function abrirImovel(codigo)'), html.indexOf('function desenharFormulario(codigo)'));
  assert.ok(edicao.indexOf('id="gi-editar-situacao"') < edicao.indexOf('Informações adicionais'));
  assert.match(html, /data-situacao-editar/);
  assert.match(html, /GI\.pode\('ver_imoveis'\)/);
  assert.match(html, /GI\.salvarSituacao\(codigo, situacaoNova\)/);
});
