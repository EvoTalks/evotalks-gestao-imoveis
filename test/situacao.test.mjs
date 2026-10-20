import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { criarServidor } from './bancada/servidor.mjs';
import { criarFixturePortal } from './fidelidade/portal.mjs';
import { criarPortalSituacao } from './bancada/portal-situacao.mjs';

test('situação só usa portal conectado, codifica código e envia corpo do contrato', async () => {
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), { window, document: {}, URL, setTimeout });
  const GI = window.GI, chamadas = [];
  GI.chamarPortal = async (rota, op) => { chamadas.push([rota, op]); return { situacoes: { ABC: 'reservado' } }; };
  for (const modo of ['local', 'portal-fora']) {
    GI.modo = modo;
    await assert.rejects(GI.situacoesMapa(), /^Error: Situação exige o portal conectado$/);
    await assert.rejects(GI.salvarSituacao('ABC', 'reservado'), /Situação exige o portal conectado/);
  }
  assert.equal(chamadas.length, 0);
  GI.modo = 'portal';
  assert.equal((await GI.situacoesMapa()).ABC, 'reservado');
  await GI.salvarSituacao('A/B & C', 'indisponivel');
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas)), [
    ['/imoveis/situacoes', null], ['/imoveis/A%2FB%20%26%20C/situacao', { corpo: { situacao: 'indisponivel' } }]
  ]);
  assert.deepEqual(Array.from(GI.SITUACOES, s => s.valor), ['disponivel', 'reservado', 'indisponivel']);
});

test('portal sintético e fixture validam códigos/situações e preservam autor', async t => {
  for (const fixture of [null, criarFixturePortal()]) {
    const s = criarServidor({ fixture });
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    t.after(() => { s.closeAllConnections(); return new Promise(r => s.close(r)); });
    const url = 'http://127.0.0.1:' + s.address().port + '/api/ext';
    assert.equal((await fetch(url + '/imoveis/situacoes')).status, 401);
    assert.equal((await fetch(url + '/imoveis/ABC/situacao', { method: 'POST', body: '{}' })).status, 401);
    const headers = { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json', 'X-GI-Autor': 'Autor Sintético', 'X-GI-User-Id': '9999', 'X-GI-User-Type': '0' };
    for (const [codigo, situacao, erro] of [['ABC', 'locado', 'situacao_invalida'], ['ABC', '', 'situacao_invalida'], ['ABC', 1, 'situacao_invalida'], ['', 'disponivel', 'codigo_invalido'], ['%20', 'disponivel', 'codigo_invalido'], ['x'.repeat(41), 'reservado', 'codigo_invalido']]) {
      const r = await fetch(url + '/imoveis/' + codigo + '/situacao', { method: 'POST', headers, body: JSON.stringify({ situacao }) });
      assert.equal(r.status, 422); assert.equal((await r.json()).erro, erro);
    }
    for (const situacao of ['reservado', 'indisponivel', 'disponivel']) {
      const r = await fetch(url + '/imoveis/%20A%2FB%20/situacao', { method: 'POST', headers, body: JSON.stringify({ situacao }) });
      assert.equal(r.status, 200);
      const salvo = await r.json();
      assert.equal(salvo.codigo, 'A/B'); assert.equal(salvo.situacao, situacao); assert.equal(salvo.autor, 'Autor Sintético'); assert.ok(Date.parse(salvo.atualizado_em));
      assert.equal((await (await fetch(url + '/imoveis/situacoes', { headers })).json()).situacoes['A/B'], situacao);
    }
  }
});

test('código especial no mapa não herda propriedades do protótipo', () => {
  const p = criarPortalSituacao();
  const r = p.responder('POST', '/imoveis/__proto__/situacao', { situacao: 'reservado' }, 'Autor');
  assert.equal(r.status, 200);
  assert.equal(p.responder('GET', '/imoveis/situacoes').corpo.situacoes.__proto__, 'reservado');
});
