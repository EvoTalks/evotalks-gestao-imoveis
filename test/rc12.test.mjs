import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Exceções legítimas: inspeção de código/rate limit, implementação do tradutor e
// atribuição da mensagem já traduzida ao Error do transporte. Nenhuma escreve na UI.
const excecoes = {
  'painel.js': [/if \(err.status === 429 .*rate.limit/],
  'comum.js': [
    /err = err \|\| \{\}; var d = err.dados/,
    /if \(err.status === 0 \|\| \/Http failure response/,
    /return err.message \|\| 'Não foi possível concluir/,
    /err.message = GI.mensagemErro\(err\)/,
    // Normalização de rejeições primitivas ou imutáveis, antes da tradução.
    /new Error\(String\(err && err.message \|\| err \|\| ''\)\)/
  ]
};
for (const arquivo of readdirSync('app').filter(n => n.endsWith('.js') || ['imoveis.html', 'locados.html', 'config.html', 'campos.html'].includes(n))) {
  test('RC12 erros de tela passam por GI.mensagemErro: ' + arquivo, () => {
    const linhas = readFileSync('app/' + arquivo, 'utf8').split('\n');
    const cruas = linhas.flatMap((linha, i) => /\.message\b/.test(linha) && !(excecoes[arquivo] || []).some(re => re.test(linha)) ? [(i + 1) + ': ' + linha.trim()] : []);
    assert.deepEqual(cruas, [], 'Mensagem de erro sem tradução em ' + arquivo);
  });
}
