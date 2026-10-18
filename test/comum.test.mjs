import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function carregar() {
  const window = { addEventListener() {} };
  const contexto = { window, document: {}, console, URL, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), contexto);
  return { GI: window.GI, contexto };
}

test('locações recusam leitura e gravação sem portal, sem recorrer ao storage', async () => {
  const { GI, contexto } = carregar();
  contexto.omni = { storage: { set() { assert.fail('locação no storage'); } } };
  contexto.window.omni = contexto.omni;
  contexto.omni.http = { request() { assert.fail('transporte sem portal'); } };
  for (const modo of ['local', 'portal-fora']) {
    GI.modo = modo;
    for (const chamada of [() => GI.locacoes(), () => GI.locacoesMapa(),
      () => GI.locacoesCandidatas(), () => GI.locacoesObter(1),
      () => GI.locacoesCriar({}), () => GI.locacoesAtualizar(1, {}),
      () => GI.locacoesEncerrar(1, 'teste')]) {
      await assert.rejects(async () => chamada(), /Locados exigem o portal conectado/);
    }
  }
});

test('helpers usam as rotas, queries e corpos do contrato; mapa devolve códigos', async () => {
  const { GI } = carregar();
  GI.modo = 'portal';
  const chamadas = [];
  GI.chamarPortal = async (rota, opcoes) => {
    chamadas.push([rota, opcoes]);
    return { locados: { 'DEMO-01': { locacao_id: 7 } } };
  };
  await GI.locacoes({ busca: 'ação & sol', contrato: 'vencendo', pagina: 2 });
  assert.equal(chamadas[0][0], '/locacoes?busca=a%C3%A7%C3%A3o%20%26%20sol&contrato=vencendo&pagina=2');
  assert.equal((await GI.locacoesMapa())['DEMO-01'].locacao_id, 7);
  await GI.locacoesCandidatas(60);
  await GI.locacoesObter(7);
  await GI.locacoesCriar({ contatos: [] });
  await GI.locacoesAtualizar(7, { contrato_numero: 'DEMO' });
  await GI.locacoesEncerrar(7, 'Fim do teste');
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas.slice(2))), [
    ['/locacoes/candidatas?dias=60', null], ['/locacoes/7', null],
    ['/locacoes', { corpo: { contatos: [] } }],
    ['/locacoes/7', { corpo: { contrato_numero: 'DEMO' } }],
    ['/locacoes/7/encerrar', { corpo: { motivo: 'Fim do teste' } }]
  ]);
});

test('busca de contatos normaliza só os campos permitidos', async () => {
  const { GI, contexto } = carregar();
  contexto.omni = { contacts: { search: async termo => {
    assert.equal(termo, 'Demonstração');
    return [{ id: 9001, name: 'Contato Demonstração', phone: '000000000', email: 'demo@example.invalid', segredo: 'descartar' }];
  } } };
  contexto.window.omni = contexto.omni;
  assert.deepEqual(JSON.parse(JSON.stringify(await GI.buscarContatos('Demonstração'))), [
    { id: 9001, name: 'Contato Demonstração', phone: '000000000', email: 'demo@example.invalid' }
  ]);
});

test('aba Locados segue Imóveis e antecede Campos', () => {
  const { GI } = carregar();
  const html = GI.cabecalho('gi-locados');
  assert.match(html, /gi-nav-ativo">Locados/);
  assert.ok(html.indexOf('Imóveis') < html.indexOf('Locados'));
  assert.ok(html.indexOf('Locados') < html.indexOf('Campos'));
});
