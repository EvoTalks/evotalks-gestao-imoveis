import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { criarPortalPermissoes, PERMISSOES_PADRAO } from './bancada/portal-permissoes.mjs';
import { criarServidor } from './bancada/servidor.mjs';

function carregar() {
  const window = { addEventListener() {} };
  const contexto = { window, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), contexto);
  return { GI: window.GI, contexto };
}
test('permissões locais liberam tudo e portal usa seu padrão, cache e abas', async () => {
  const { GI } = carregar();
  assert.equal((await GI.permissoes()).permissoes.ver_imoveis, true);
  GI.modo = 'portal';
  let leituras = 0;
  GI.chamarPortal = async rota => {
    assert.equal(rota, '/permissoes/eu'); leituras++;
    return { administrador: false, padrao: {}, permissoes: { ver_imoveis: true, editar_imoveis: true } };
  };
  await Promise.all([GI.permissoes(), GI.permissoes()]);
  assert.equal(leituras, 1);
  assert.equal(GI.pode('editar_imoveis'), true);
  assert.equal(GI.pode('mudar_situacao'), true);
  const html = GI.cabecalho('gi-imoveis');
  assert.match(html, /Imóveis/);
  assert.doesNotMatch(html, /Campos|Histórico|Configurações/);
});
test('403 de permissão explica a operação recusada', () => {
  const { GI } = carregar();
  assert.equal(GI.mensagemErro({ status: 403, dados: { erro: 'sem_permissao', permissao: 'mudar_situacao' } }), 'Você não tem permissão para mudar a situação.');
  assert.equal(GI.mensagemErro({ status: 403, dados: { erro: 'sem_permissao' } }), 'Você não tem permissão para esta operação.');
});
test('stub aplica padrão, admin, validação, releitura e barreiras sem afetar leituras', async () => {
  const s = criarServidor();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const origem = 'http://127.0.0.1:' + s.address().port + '/api/ext';
  async function api(rota, type = 2, body) {
    const r = await fetch(origem + rota, { headers: { Authorization: 'Bearer bancada-sintetica', 'X-GI-User-Id': '9998', 'X-GI-User-Type': String(type), 'Content-Type': 'application/json' }, method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  }
  try {
    const padrao = (await api('/permissoes/eu')).body.permissoes;
    assert.equal(padrao.editar_imoveis, true);
    assert.equal(padrao.mudar_situacao, true);
    assert.equal((await api('/permissoes')).status, 403);
    assert.equal((await api('/campos')).status, 200);
    for (const [rota, body] of [['/campos', {}], ['/campos/padrao', {}], ['/historico'], ['/config']]) assert.equal((await api(rota, 2, body)).status, 403, rota);
    assert.equal((await api('/permissoes/9998', 0, { nome: 'Agente' })).status, 422);
    const salvo = await api('/permissoes/9998', 0, { nome: 'Agente', ...padrao, mudar_situacao: true, editar_imoveis: false });
    assert.equal(salvo.status, 200);
    assert.equal(salvo.body.atualizado_por, 'extensao');
    assert.equal((await api('/permissoes/eu')).body.permissoes.mudar_situacao, true);
    assert.equal((await api('/valores/DEMO-001', 2, { entradas: [] })).status, 403);
    assert.equal((await api('/imoveis/DEMO-001/situacao', 2, { situacao: 'reservado' })).status, 200);
    assert.ok(Object.values((await api('/permissoes/eu', 0)).body.permissoes).every(Boolean));
  } finally { s.closeAllConnections(); await new Promise(r => s.close(r)); }
});

test('identidade declarada preserva tipo zero e id em fetch e proxy', async () => {
  for (const mesmaOrigem of [false, true]) {
    for (const tipo of [0, 1, 2, undefined]) {
      const { GI, contexto } = carregar();
      GI.definirModo = async () => { GI.modo = 'local'; };
      GI.mostrarModo = GI.mostrarDemonstracao = GI.ajustarAltura = () => {};
      const usuario = { id: 9998, name: 'Usuário Sintético', type: tipo };
      let headers;
      contexto.omni = contexto.window.omni = {
        ready: fn => fn({ user: usuario }),
        http: { request: async op => { headers = op.headers; return { status: 200, body: '{}' }; } }
      };
      await new Promise(resolve => GI.pronto(resolve));
      GI.cfg = (k, p) => k === 'portalUrl' ? 'https://portal.invalid' : p;
      contexto.window.location = { origin: mesmaOrigem ? 'https://portal.invalid' : 'https://extensao.invalid' };
      contexto.fetch = async (url, op) => { headers = op.headers; return { ok: true, status: 200, text: async () => '{}' }; };
      await GI.chamarPortal('/permissoes/eu');
      assert.equal(headers['X-GI-User-Id'], '9998');
      assert.equal(headers['X-GI-User-Type'], tipo === undefined ? '4' : String(tipo));
    }
  }
});

test('falha de consulta não libera acesso nem fica permanentemente em cache', async () => {
  const { GI } = carregar(); GI.modo = 'portal';
  GI.chamarPortal = async () => { throw new Error('Falha sintética'); };
  await assert.rejects(GI.permissoes(), /Falha sintética/);
  assert.equal(GI.pode('ver_imoveis'), false);
  GI.chamarPortal = async () => ({ permissoes: { ver_imoveis: true }, padrao: {} });
  await GI.permissoes();
  assert.equal(GI.pode('ver_imoveis'), true);
});


test('stub conserva padrão sem identidade válida e registra histórico só ao mudar', () => {
  const p = criarPortalPermissoes();
  const headers = { 'x-gi-user-id': '9999', 'x-gi-user-type': '0', 'x-gi-autor': 'Administrador Sintético' };
  const dados = { nome: 'Agente', ...PERMISSOES_PADRAO };
  for (const id of [undefined, '', '-1', 'abc', '2147483648']) {
    const r = p.responder('GET', '/permissoes/eu', {}, { ...headers, 'x-gi-user-id': id }).corpo;
    assert.deepEqual(r.permissoes, { ...PERMISSOES_PADRAO, mudar_situacao: true });
    assert.equal(r.administrador, false);
  }
  for (const corpo of [null, [], {}, { ...dados, nome: 2 }, { ...dados, ver_imoveis: 1 }]) assert.equal(p.responder('POST', '/permissoes/9998', corpo, headers).status, 422);
  assert.equal(p.responder('POST', '/permissoes/9998', dados, { ...headers, 'x-gi-user-type': '2' }).status, 403);
  p.responder('POST', '/permissoes/9998', dados, headers);
  p.responder('POST', '/permissoes/9998', dados, headers);
  assert.equal(p.historico.length, 1);
  p.responder('POST', '/permissoes/9998', { ...dados, ver_historico: true }, headers);
  assert.equal(p.historico.length, 2);
});
