import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = { GI: {} };
vm.runInNewContext(readFileSync(new URL('../app/busca.js', import.meta.url), 'utf8'), { window, globalThis: window, String, Number, Object, Math });
const B = window.GI.busca;

test('cômodos omitem nulos e zeros e usam singular', () => {
  assert.equal(B.comodos({ quartos: 3, suites: 1, vagas: 2, area_m2: 120 }), '3 quartos (1 suíte) · 2 vagas · 120 m²');
  assert.equal(B.comodos({ quartos: 1, suites: 0, vagas: 1, area_m2: null }), '1 quarto · 1 vaga');
  assert.equal(B.comodos({ quartos: 2, suites: 2, vagas: null, area_m2: 75.5 }), '2 quartos (2 suítes) · 75,5 m²');
  assert.equal(B.comodos({}), '');
});

test('valor por transação, em centavos', () => {
  assert.equal(B.valor({ transacao: 'Venda', valor_venda: 69000000 }), 'R$ 690.000');
  assert.equal(B.valor({ transacao: 'Locacao', valor_aluguel: 250000, valor_total_mensal: 280000 }), 'R$ 2.500/mês');
  assert.equal(B.valor({ transacao: 'Venda', valor_venda: 123456 }), 'R$ 1.234,56');
  assert.equal(B.valor({ transacao: 'Venda' }), '');
  assert.equal(B.moeda('69000000'), 'R$ 690.000', 'string de bigint do pg');
  assert.equal(B.moeda('abc'), '');
});

test('texto limpo remove HTML, decodifica entidades e preserva quebras', () => {
  assert.equal(B.textoLimpo('<p>Casa &amp; jardim</p><p>Vale &lt;ver&gt;</p>'), 'Casa & jardim\nVale <ver>');
  assert.equal(B.textoLimpo('a<br>b<br/>c &nbsp;&#233;&#x41;'), 'a\nb\nc éA');
  assert.equal(B.textoLimpo('<script>alert(1)</script>ok'), 'ok');
  assert.equal(B.textoLimpo('Descri&ccedil;&atilde;o do im&oacute;vel &Aacute;rea'), 'Descrição do imóvel Área');
  assert.equal(B.textoLimpo(null), '');
});

test('parâmetros enviam só o que foi escolhido e valor em reais', () => {
  assert.equal(B.parametros({ texto: ' ', transacao: '', cidade: '', bairro: '', quartos: '', valor: null }, 1, 20), 'pagina=1&por_pagina=20');
  assert.equal(B.parametros({ texto: 'casa ação', transacao: 'Locacao', cidade: 'Brusque', bairro: 'Águas Claras', quartos: '3', valor: 2500 }, 2, 20),
    'texto=casa%20a%C3%A7%C3%A3o&transacao=Locacao&cidade=Brusque&bairro=%C3%81guas%20Claras&quartos_min=3&valor_max=2500&pagina=2&por_pagina=20');
});

test('máscara de reais e filtros ativos', () => {
  assert.equal(B.mascaraReais('1234567'), '1.234.567');
  assert.equal(B.mascaraReais('R$ 0012'), '12');
  assert.equal(B.reaisDaMascara('1.234'), 1234);
  assert.equal(B.reaisDaMascara(''), null);
  assert.equal(B.filtrosAtivos({ texto: '', valor: null }), false);
  assert.equal(B.filtrosAtivos({ quartos: '2' }), true);
});

test('informação, contagem e situação', () => {
  assert.equal(B.informacao({ tipo: 'Casa', bairro: 'Centro', cidade: 'Brusque', codigo_curto: '0060' }), 'Casa · Centro, Brusque · 0060');
  assert.equal(B.contagem(1), '1 imóvel');
  assert.equal(B.contagem(1234), '1.234 imóveis');
  assert.equal(B.situacao('reservado').rotulo, 'Reservado');
  assert.equal(B.situacao('x'), null);
  assert.equal(B.urlSegura('javascript:1'), '');
});

test('entidade numérica inválida não lança', () => {
  assert.doesNotThrow(() => B.textoLimpo('a &#99999999999; b &#x110000; c'));
  assert.equal(B.textoLimpo('a &#99999999999; b'), 'a &#99999999999; b');
});

test('valor zero conta como não informado', () => {
  assert.equal(B.moeda(0), '');
  assert.equal(B.moeda('0'), '');
  assert.equal(B.valor({ transacao: 'Venda', valor_venda: 0 }), '');
  assert.equal(B.valor({ transacao: 'Locacao', valor_aluguel: 0, valor_total_mensal: 0 }), '');
  assert.equal(B.valor({ transacao: 'Locacao', valor_aluguel: 0, valor_total_mensal: 280000 }), 'R$ 2.800/mês');
});

test('campos internos no formato do portal', () => {
  const r = B.internos([
    { rotulo: 'IPTU', texto: 'R$ 150,00/mês', valor_centavos: 15000, observacao: 'Pago em dia' },
    { rotulo: 'Chave', texto: 'Com o zelador', valor_centavos: null, observacao: null },
    { rotulo: 'Vazio', texto: '', valor_centavos: null, observacao: 'x' },
    { nome: 'Antigo', valor: 'ok' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [
    { nome: 'IPTU', valor: 'R$ 150,00/mês', obs: 'Pago em dia' },
    { nome: 'Chave', valor: 'Com o zelador', obs: '' },
    { nome: 'Antigo', valor: 'ok', obs: '' }
  ]);
  assert.equal(B.internos(null).length, 0);
});

test('anexar página deduplica por código', () => {
  const r = B.mesclar([{ codigo: 'A' }, { codigo: 'B' }], [{ codigo: 'B' }, { codigo: 'C' }]);
  assert.deepEqual(r.itens.map(i => i.codigo), ['A', 'B', 'C']);
  assert.equal(r.entrou, 1);
  assert.equal(B.mesclar([{ codigo: 'A' }], [{ codigo: 'A' }]).entrou, 0);
});

test('cache do detalhe expira em 3 minutos', () => {
  assert.equal(B.cacheFresco({ em: 1000 }, 1000 + 179000), true);
  assert.equal(B.cacheFresco({ em: 1000 }, 1000 + 181000), false);
  assert.equal(B.cacheFresco(undefined, 5), false);
});
