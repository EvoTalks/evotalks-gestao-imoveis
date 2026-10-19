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

test('gravações do transporte comum invalidam snapshots após sucesso nos dois transportes', async () => {
  for (const mesmaOrigem of [false, true]) {
    const { GI, contexto } = carregar();
    let invalidacoes = 0, marcas = 0, metodo, status = 200;
    GI.cfg = (chave, padrao) => chave === 'portalUrl' ? 'https://portal.invalid' : chave === 'portalToken' ? 'sintetico-invalido' : padrao;
    contexto.window.location = { origin: mesmaOrigem ? 'https://portal.invalid' : 'https://extensao.invalid' };
    const responder = async () => { assert.equal(invalidacoes, 0, 'não invalida antes da resposta'); return {}; };
    contexto.omni = contexto.window.omni = {
      http: { request: async op => { metodo = op.method; await responder(); return { status, body: '{}' }; } },
      storage: { get: async () => ({ rows: [{ contatoId: 9901 }] }), set: async (chave, valor) => {
        if (chave === 'gi-ultima-escrita') { assert.equal(valor.por, GI.instanciaId); marcas++; return; }
        assert.equal(chave, 'gi-cockpit-snapshots-v1'); assert.equal(valor.rows.length, 0); invalidacoes++;
      } }
    };
    contexto.fetch = async (url, op) => { metodo = op.method; await responder(); return { ok: status === 200, status, text: async () => '{}' }; };
    for (const [rota, method] of [['/chamados', 'POST'], ['/chamados/1/atendimento', 'PUT'], ['/chamados/1/anexos', 'DELETE'], ['/locacoes/1', 'PATCH'], ['/prestadores/1', 'POST']]) {
      await GI.chamarPortal(rota, { method, ...(method === 'DELETE' ? {} : { corpo: {} }) });
      assert.equal(invalidacoes, 1, method + ' ' + rota);
      assert.equal(metodo, method); assert.equal(marcas, 1); invalidacoes = marcas = 0;
    }
    await GI.chamarPortal('/chamados'); assert.equal(invalidacoes, 0, 'GET não invalida');
    status = 422;
    await assert.rejects(() => GI.chamarPortal('/chamados', { corpo: {} }));
    assert.equal(invalidacoes, 0, 'gravação recusada não invalida');
    assert.equal(marcas, 0, 'GET e gravação recusada não publicam marca');
    status = 200;
    for (const sincrona of [true, false]) {
      contexto.omni.storage.set = () => { if (sincrona) throw new Error('Storage fora'); return Promise.reject(new Error('Storage fora')); };
      assert.deepEqual(JSON.parse(JSON.stringify(await GI.chamarPortal('/chamados', { corpo: {} }))), {});
    }
    contexto.omni.storage.get = async () => null;
    contexto.omni.storage.set = chave => { if (chave === 'gi-cockpit-snapshots-v1') invalidacoes++; };
    await GI.chamarPortal('/chamados', { corpo: {} });
    assert.equal(invalidacoes, 0, 'não cria cache quando ainda não existe snapshot');
    for (const sincrona of [true, false]) {
      contexto.omni.storage.get = () => { if (sincrona) throw new Error('Storage fora'); return Promise.reject(new Error('Storage fora')); };
      assert.deepEqual(JSON.parse(JSON.stringify(await GI.chamarPortal('/chamados', { corpo: {} }))), {});
    }
  }
});

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
  GI.ctx = () => ({ user: { type: 0 } });
  const html = GI.cabecalho('gi-locados');
  assert.match(html, /gi-nav-ativo">Locados/);
  assert.ok(html.indexOf('Imóveis') < html.indexOf('Locados'));
  assert.ok(html.indexOf('Locados') < html.indexOf('Campos'));
});

test('atendente e supervisor não recebem atalhos internos nem abrem gestão por GI.abrirTela', () => {
  const { GI, contexto } = carregar();
  const abertos = [], avisos = [];
  contexto.omni = { ui: { openContribution: id => { abertos.push(id); return Promise.resolve(); } } };
  contexto.window.omni = contexto.omni;
  GI.aviso = texto => avisos.push(texto);
  for (const tipo of [2, 1, null]) {
    GI.ctx = () => ({ user: { type: tipo } });
    const nav = GI.cabecalho('gi-imoveis');
    assert.doesNotMatch(nav, /gi-locados|gi-chamados|gi-prestadores/);
    assert.match(nav, /gi-campos/); assert.match(nav, /gi-historico/); assert.match(nav, /gi-config/);
    for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores']) GI.abrirTela(id);
    assert.equal(abertos.length, 0);
  }
  assert.equal(avisos.length, 9);
  GI.ctx = () => ({ user: { type: 0 } });
  assert.match(GI.cabecalho('gi-imoveis'), /gi-locados/);
  for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-campos']) GI.abrirTela(id);
  assert.deepEqual(abertos, ['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-campos']);
});

test('gestor libera só o id temporário e administradores, com navegação e abertura coerentes', () => {
  const { GI, contexto } = carregar();
  const abertos = [], avisos = [];
  contexto.omni = contexto.window.omni = { ui: { openContribution: id => { abertos.push(id); } } };
  GI.aviso = texto => avisos.push(texto);
  for (const user of [{ id: 531, type: 2 }, { id: '531', type: 2 }, { id: 600, type: 0 }]) {
    GI.ctx = () => ({ user });
    assert.equal(GI.gestor(), true);
    for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores']) {
      assert.ok(GI.cabecalho('gi-imoveis').includes(id));
      GI.abrirTela(id);
      assert.equal(abertos.at(-1), id);
    }
  }
  for (const user of [{ id: 600, type: 2 }, { id: 600, type: 1 }, {}, null]) {
    GI.ctx = () => ({ user });
    assert.equal(GI.gestor(), false);
    assert.doesNotMatch(GI.cabecalho('gi-imoveis'), /gi-locados|gi-chamados|gi-prestadores/);
    const antes = abertos.length;
    GI.abrirTela('gi-chamados');
    assert.equal(abertos.length, antes);
    assert.equal(avisos.at(-1), 'Esta tela é exclusiva do administrador.');
  }
  GI.GESTORES_EXTRA = [];
  GI.ctx = () => ({ user: { id: 531, type: 2 } });
  assert.equal(GI.gestor(), false, 'desfazer a exceção revoga o acesso');
});


test('F19 invalidação publica marca da instância mesmo sem snapshot ou com storage falhando', async () => {
  const a = carregar(), b = carregar();
  assert.equal(a.GI.CHAVE_ESCRITA, 'gi-ultima-escrita');
  assert.equal(typeof a.GI.instanciaId, 'string');
  assert.notEqual(a.GI.instanciaId, b.GI.instanciaId);
  for (const falha of ['nenhuma', 'get-sync', 'get-async', 'snapshot-sync', 'snapshot-async', 'marca-sync', 'marca-async']) {
    const gravacoes = [];
    a.contexto.omni = { storage: {
      get() {
        if (falha === 'get-sync') throw new Error('Storage fora');
        if (falha === 'get-async') return Promise.reject(new Error('Storage fora'));
        return Promise.resolve(falha === 'nenhuma' ? null : { rows: [{}] });
      },
      set(chave, valor) {
        gravacoes.push({ chave, valor });
        if (falha === (chave === 'gi-ultima-escrita' ? 'marca-sync' : 'snapshot-sync')) throw new Error('Storage fora');
        if (falha === (chave === 'gi-ultima-escrita' ? 'marca-async' : 'snapshot-async')) return Promise.reject(new Error('Storage fora'));
        return Promise.resolve();
      }
    } };
    const inicio = Date.now();
    await a.GI.invalidarSnapshots();
    const marca = gravacoes.find(g => g.chave === 'gi-ultima-escrita');
    assert.ok(marca, falha);
    assert.equal(marca.valor.por, a.GI.instanciaId);
    assert.ok(marca.valor.em >= inicio && marca.valor.em <= Date.now());
  }
});

test('F19 recado e toast normalizam um único ícone sem alterar os chamadores', () => {
  const { GI, contexto } = carregar();
  const toasts = [];
  const box = { setAttribute() {}, appendChild(el) { this.filhos.push(el); }, focus() {}, filhos: [] };
  contexto.clearTimeout = () => {};
  contexto.setTimeout = () => 1;
  contexto.document = { createElement: () => ({ setAttribute() {} }) };
  contexto.omni = { ui: { toast: (texto, tipo) => { toasts.push({ texto, tipo }); } } };
  for (const [texto, tipo, esperado] of [['✓ salvo', 'sucesso', '✓ salvo'], ['salvo', 'sucesso', '✓ salvo'], ['! falhou', 'erro', '! falhou']]) {
    box.filhos = [];
    GI.recado(texto, tipo, box);
    assert.equal(box.filhos[0].textContent, esperado);
    assert.equal(toasts.at(-1).texto, esperado.slice(2));
  }
});

test('RC7 escrita própria preserva marca externa pendente e invalida o snapshot', async () => {
  const { GI, contexto } = carregar();
  const armazenamento = new Map([
    [GI.CHAVE_ESCRITA, { em: 200, por: 'outra-instancia-sintetica' }],
    [GI.CHAVE_SNAPSHOTS, { rows: [{ contatoId: 9901 }] }]
  ]);
  contexto.omni = { storage: {
    get: async chave => armazenamento.get(chave),
    set: async (chave, valor) => armazenamento.set(chave, valor)
  } };
  GI.cockpitCarregadoEm = () => 100;
  await GI.invalidarSnapshots();
  assert.deepEqual(armazenamento.get(GI.CHAVE_ESCRITA), { em: 200, por: 'outra-instancia-sintetica' });
  assert.equal(armazenamento.get(GI.CHAVE_SNAPSHOTS).rows.length, 0);
  GI.cockpitCarregadoEm = () => 200;
  await GI.invalidarSnapshots();
  assert.equal(armazenamento.get(GI.CHAVE_ESCRITA).por, GI.instanciaId, 'marca já vista permite publicar a própria');
  armazenamento.set(GI.CHAVE_ESCRITA, { em: Date.now() + 1000, por: 'outra-instancia-sintetica' });
  delete GI.cockpitCarregadoEm;
  await GI.invalidarSnapshots();
  assert.equal(armazenamento.get(GI.CHAVE_ESCRITA).por, GI.instanciaId, 'telas sem cockpit continuam publicando suas escritas');
});
