import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';

const paginas = ['imoveis', 'campos', 'historico', 'config'];
const titulos = ['Imóveis', 'Campos', 'Histórico', 'Configurações'];
const plain = v => JSON.parse(JSON.stringify(v));
function carregar(omni = {}) {
  const window = { addEventListener() {}, omni, location: { origin: 'https://extensao.invalid' } };
  const contexto = { window, omni, document: {}, URL, setTimeout, clearTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), contexto);
  return { GI: window.GI, contexto };
}
function transporte(mesmaOrigem = false) {
  const chamadas = [];
  let status = 200, resposta = { ok: true };
  const { GI, contexto } = carregar({ http: { request: async op => {
    chamadas.push(op); return { status, body: JSON.stringify(resposta) };
  } } });
  GI.cfg = (k, padrao) => ({ portalUrl: 'https://portal.invalid///', portalToken: ' token-sintetico ' })[k] ?? padrao;
  if (mesmaOrigem) contexto.window.location.origin = 'https://portal.invalid';
  contexto.fetch = async (url, op) => {
    chamadas.push({ url, ...op });
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(resposta) };
  };
  return { GI, contexto, chamadas, responder(s, r) { status = s; resposta = r; } };
}

test('ativos: cota bloqueia a 31ª chamada antes de enviar e libera aos 60s', async () => {
  const { GI, chamadas } = transporte();
  let agora = 0;
  GI.cotaPortal = GI.criarCotaPortal(() => agora);
  for (let i = 0; i < 30; i++) await GI.chamarPortal('/info');
  assert.equal(GI.cotaPortal.restantes(), 0);
  await assert.rejects(() => GI.chamarPortal('/info'), e => e.status === 429 && e.code === 'rate_limited');
  assert.equal(chamadas.length, 30);
  agora = 59999;
  await assert.rejects(() => GI.chamarPortal('/info'));
  assert.equal(chamadas.length, 30);
  agora = 60000;
  await GI.chamarPortal('/info');
  assert.equal(chamadas.length, 31);
  assert.equal(GI.cotaPortal.restantes(), 29);
});

test('ativos: erros simples, campos ativos, códigos e falhas de rede', () => {
  const { GI } = carregar();
  assert.match(GI.mensagemErro({ status: 400, dados: { campos: { titulo: '<img src=x>' } } }), /^Título:/);
  assert.match(GI.mensagemErro({ status: 422, dados: { erro: 'dados_invalidos', campos: { titulo: 'Informe um texto.', 'campo.descricao': 'Informe um texto.' } } }), /Título:.*Descrição:/);
  for (const status of [400, 401, 403, 409, 422, 500]) assert.doesNotMatch(GI.mensagemErro({ status, message: '<img src=x>', dados: { campos: { desconhecido: 'Informe um texto.' } } }), /<img|Informe um texto|HTTP/);
  for (const status of [undefined, 0, 502, 503, 504]) assert.match(GI.mensagemErro({ status, message: 'Failed to fetch' }), /Não consegui falar com o servidor/);
  assert.equal(GI.mensagemErro({ code: 'timeout' }), 'Não consegui falar com o servidor. Confira sua conexão e tente de novo.');
  assert.match(GI.mensagemErro({ status: 429 }), /Limite de consultas/);
  assert.equal(GI.mensagemErro({ dados: { erro: 'situacao_invalida' } }), 'Situação inválida.');
  for (const codigo of ['nao_encontrado', 'api_desabilitada', 'falha_interna', 'codigo_invalido', 'rate_limited', 'rate_limit']) {
    const mensagem = GI.mensagemErro({ dados: { erro: codigo } });
    assert.ok(mensagem.length > 20);
    assert.ok(!mensagem.includes(codigo));
    assert.doesNotMatch(mensagem, /HTTP|Informe um texto/);
  }
});

test('ativos: manifest 0.33.3 monta só quatro telas e cabeçalho segue sua ordem', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(m.version, '0.33.3');
  assert.equal(m.contributions.length, 1);
  assert.deepEqual(m.contributions[0].items.map(i => i.id), paginas.map(p => 'gi-' + p));
  assert.deepEqual(m.contributions[0].items.map(i => i.url), paginas.map(p => 'app/' + p + '.html'));
  for (const item of m.contributions[0].items) {
    assert.ok(existsSync(new URL('../' + item.url, import.meta.url)));
    assert.equal(item.visibility, undefined);
  }
  const { GI } = carregar();
  for (const pagina of paginas) {
    const nav = GI.cabecalho('gi-' + pagina);
    assert.doesNotMatch(nav, /Manutenção|Chamados|Locados|Prestadores/i);
    for (let i = 1; i < titulos.length; i++) assert.ok(nav.indexOf(titulos[i - 1]) < nav.indexOf(titulos[i]));
    assert.equal((nav.match(/gi-nav-ativo/g) || []).length, 1);
  }
});

for (const mesmaOrigem of [false, true]) test('ativos: transporte preserva rotas, métodos, payloads e erros via ' + (mesmaOrigem ? 'fetch' : 'SDK'), async () => {
  const { GI, chamadas, responder } = transporte(mesmaOrigem);
  for (const [rota, method, corpo] of [
    ['/info', 'GET', undefined], ['/campos', 'POST', { rotulo: 'Observação', tipo: 'texto' }],
    ['/campos/1', 'PUT', { ativo: false }], ['/imoveis/DEMO-001/valores', 'PATCH', { observacao: null }],
    ['/campos/1', 'DELETE', undefined]
  ]) {
    assert.deepEqual(plain(await GI.chamarPortal(rota, { method, ...(corpo === undefined ? {} : { corpo }) })), { ok: true });
    const op = chamadas.at(-1);
    assert.equal(op.url, 'https://portal.invalid/api/ext' + rota);
    assert.equal(op.method, method);
    assert.equal(op.body, corpo === undefined ? undefined : JSON.stringify(corpo));
    assert.equal(op.headers.Authorization, 'Bearer token-sintetico');
    assert.equal(op.headers['Content-Type'], corpo === undefined ? undefined : 'application/json');
  }
  await GI.chamarPortal('/imoveis/DEMO-001/situacao', { corpo: { situacao: 'reservado' } });
  assert.equal(chamadas.at(-1).method, 'POST');
  responder(422, { erro: 'dados_invalidos', campos: { titulo: 'Informe um texto.' } });
  await assert.rejects(() => GI.chamarPortal('/campos', { corpo: {} }), e => e.status === 422 && /Título:/.test(e.message));
});

test('ativos: helpers de situação e capas preservam query e corpo sem portal', async () => {
  const { GI, contexto } = carregar({ storage: { get() { assert.fail('storage indevido'); }, set() { assert.fail('storage indevido'); } } });
  const chamadas = [];
  GI.chamarPortal = async (rota, op) => { chamadas.push([rota, op]); return { situacoes: { 'DEMO-001': 'reservado' }, capas: { 'DEMO-001': 'capa.jpg' } }; };
  for (const modo of ['local', 'portal-fora', 'demonstracao']) {
    GI.modo = modo;
    await assert.rejects(() => GI.situacoesMapa(), /portal conectado/);
    await assert.rejects(() => GI.salvarSituacao('DEMO-001', 'reservado'), /portal conectado/);
    assert.deepEqual(plain(await GI.capasImoveis(['DEMO-001'])), {});
  }
  assert.equal(chamadas.length, 0);
  GI.modo = 'portal';
  assert.deepEqual(plain(await GI.situacoesMapa()), { 'DEMO-001': 'reservado' });
  await GI.salvarSituacao('ação & sol', 'reservado');
  assert.deepEqual(plain(chamadas.at(-1)), ['/imoveis/a%C3%A7%C3%A3o%20%26%20sol/situacao', { corpo: { situacao: 'reservado' } }]);
  assert.deepEqual(plain(await GI.capasImoveis(['DEMO-001', 'ação & sol'])), { 'DEMO-001': 'capa.jpg' });
  assert.equal(chamadas.at(-1)[0], '/imoveis/capas?codigos=DEMO-001%2Ca%C3%A7%C3%A3o%20%26%20sol');
  assert.equal(contexto.window.GI, GI);
});

test('ativos: definirModo distingue local, portal e portal-fora sem fallback de storage', async () => {
  const { GI, contexto, chamadas, responder } = transporte();
  contexto.omni.storage = { get() { assert.fail('fallback indevido'); }, set() { assert.fail('escrita indevida'); } };
  assert.equal(await GI.definirModo(), 'portal');
  assert.equal(GI.modo, 'portal');
  assert.equal(chamadas.at(-1).url, 'https://portal.invalid/api/ext/info');
  responder(503, { erro: 'falha_interna' });
  assert.equal(await GI.definirModo(), 'portal-fora');
  assert.ok(GI.portalErro);
  for (const fn of [() => GI.campos(), () => GI.valores(), () => GI.salvarCampos([]), () => GI.salvarValores({})]) await assert.rejects(fn, /Nada foi gravado/);
  GI.cfg = (k, padrao) => padrao;
  const antes = chamadas.length;
  assert.equal(await GI.definirModo(), 'local');
  assert.equal(GI.modo, 'local');
  assert.equal(chamadas.length, antes);
});

test('ativos: isoPortal mantém tipagem de datas do histórico', () => {
  const { GI } = carregar();
  for (const v of [null, undefined, '', Infinity, NaN, 'inválido', true, {}, []]) assert.equal(GI.isoPortal(v), null);
  assert.equal(GI.isoPortal(1792242000000), new Date(1792242000000).toISOString());
  assert.equal(GI.isoPortal('2026-10-17 12:00:00'), '2026-10-17T12:00:00.000Z');
  assert.equal(GI.isoPortal('2026-10-17T09:00:00-03:00'), '2026-10-17T12:00:00.000Z');
});

test('nome real usa users.list do host uma vez, sem consultar a rota crua', async () => {
  let chamadas = 0, cruas = 0;
  const omni = { users: { list: async () => { chamadas++; return [{ id: 531, name: 'Atendente Teste', type: 2, email: 'x@y' }, { id: 9, name: 'Outro', type: 1, email: 'o@y' }]; } }, data: { request: async (...args) => { cruas++; assert.equal(String(args[0]).includes('users'), false); return []; } } };
  const { GI } = carregar(omni);
  await Promise.all([GI.usuarios(), GI.usuarios()]);
  assert.deepEqual(Array.from(await GI.usuariosOrdenados()), [531, 9]);
  assert.equal(GI.nomeDoUsuario({ id: 531, name: '' }), 'Atendente Teste');
  assert.equal(GI.nomeDoUsuario({ id: 531, name: 'Nome da sessão' }), 'Nome da sessão');
  assert.equal(GI.nomeDoUsuario({ id: 532, name: ' ' }), 'Usuário 532');
  assert.equal(chamadas, 1); assert.equal(cruas, 0);
  assert.equal(GI.nomeDoUsuario({ id: 531, fullname: 'Nome completo' }), 'Nome completo');
  for (const falha of [() => { throw Error('fora'); }, () => Promise.reject(Error('fora'))]) {
    const { GI: g } = carregar({ users: { list: falha } });
    await g.usuarios(); assert.equal(g.nomeDoUsuario({ id: 531 }), 'Usuário 531');
  }
});

test('ordem dos atendentes preserva a ordem original do SDK', async () => {
  const { GI } = carregar({ users: { list: async () => [
    { id: 9999, name: 'Primeiro', type: 2, email: 'a@b' },
    { id: 9998, name: 'Segundo', type: 2, email: 'b@b' },
    { id: 9997, name: 'Terceiro', type: 2, email: 'c@b' }
  ] } });
  await GI.usuarios();
  assert.deepEqual(Array.from(await GI.usuariosOrdenados()), [9999, 9998, 9997]);
  assert.equal(GI.nomeDoUsuario({ id: 9999 }), 'Primeiro');
  assert.equal(GI.nomeDoUsuario({ id: 1234 }), 'Usuário 1234');
});

test('ativos: abrirTela encaminha telas ativas e avisa quando o host recusa', async () => {
  const abertos = [], avisos = [];
  const { GI, contexto } = carregar({ ui: { openContribution: id => { abertos.push(id); } } });
  GI.aviso = texto => avisos.push(texto);
  for (const type of [0, 1, 2, null]) {
    GI.ctx = () => ({ user: { type } });
    for (const pagina of paginas) GI.abrirTela('gi-' + pagina);
  }
  assert.deepEqual(abertos, Array(4).fill(paginas.map(p => 'gi-' + p)).flat());
  for (const falha of [() => { throw Error('fora'); }, () => Promise.reject(Error('fora'))]) {
    contexto.omni.ui.openContribution = falha;
    GI.abrirTela('gi-imoveis');
    await Promise.resolve();
    assert.equal(avisos.at(-1), 'Abra pelo menu Gerenciamento de Imóveis.');
  }
  assert.equal(avisos.length, 2);
});

test('ativos: Chromium monta quatro páginas com SDK, cfg e navegação única', { timeout: 120000 }, async () => {
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  let b;
  try {
    b = await abrirChromium();
    const origem = 'http://127.0.0.1:' + servidor.address().port;
    for (const pagina of paginas) {
      await b.navegar(origem + '/app/' + pagina + '.html?perfil=admin');
      await b.esperar(() => document.querySelectorAll('.gi-nav-item').length === 4);
      assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('.gi-nav-item')].map(n => n.textContent)), titulos);
      assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-nav-ativo').length), 1);
      assert.equal(await b.avaliar(() => GI.modo), 'portal');
      assert.equal(await b.avaliar(() => GI.cfg('ausente', 'padrao')), 'padrao');
      assert.equal(await b.avaliar(() => GI.cfg('portalUrl')), 'http://portal.bancada.invalid');
      assert.equal(await b.avaliar(() => typeof omni.http.request), 'function');
      assert.doesNotMatch(await b.avaliar(() => document.querySelector('.gi-nav').textContent), /Manutenção|Chamados|Locados/i);
    }
    assert.deepEqual(b.erros, []);
  } finally {
    if (b) await b.fechar();
    servidor.closeAllConnections();
    await new Promise(r => servidor.close(r));
  }
});

for (const type of [1, 2]) test('ativos: permissões filtram navegação de perfil ' + type, async () => {
  const { GI } = carregar();
  GI.ctx = () => ({ user: { id: 600, type } });
  GI.modo = 'portal';
  GI.chamarPortal = async rota => {
    assert.equal(rota, '/permissoes/eu');
    return { permissoes: { ver_imoveis: true, gerenciar_campos: false, ver_historico: true, ver_configuracoes: false }, padrao: {} };
  };
  await GI.permissoes();
  const nav = GI.cabecalho('gi-imoveis');
  assert.match(nav, /Imóveis/);
  assert.match(nav, /gi-historico/);
  assert.doesNotMatch(nav, /gi-campos|gi-config|Manutenção|Chamados|Locados/);
});
