import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { criarPortalChamados, PADROES } from './bancada/portal-chamados.mjs';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';

function carregar(agora) {
  const window = { addEventListener() {} }, sandbox = { window, document: {}, URL, setTimeout };
  if (agora) sandbox.Date = class extends Date { static now() { return agora(); } };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), sandbox);
  sandbox.GI = window.GI;
  vm.runInNewContext(readFileSync(new URL('../app/manutencao.js', import.meta.url), 'utf8'), sandbox);
  return window.GI;
}
const plain = v => JSON.parse(JSON.stringify(v));
for (const [nome, mudanca] of [
  ['locação diferente', { locacao_id: 1 }],
  ['criação de um dia atrás', { criado_em: '2026-10-18T12:00:00.000Z' }],
  ['antes da tolerância de dois minutos', { criado_em: '2026-10-19T11:57:59.999Z' }],
  ['atendimento diferente', { atendimento: { chat_id: 8802, protocolo: 'DEMO-P8801' } }],
  ['concluído', { status: 'concluido' }],
  ['cancelado', { status: 'cancelado' }],
  ['data sem ISO', { criado_em: '19/10/2026' }],
  ['data numérica', { criado_em: 1792411200000 }]
]) test('F18 criação segura não reconcilia ' + nome, async () => {
  const GI = carregar(() => Date.parse('2026-10-19T12:00:00.000Z'));
  const dados = { locacao_id: 2, titulo: 'Reparo Demonstração', solicitante: { contato_id: 9901 }, atendimento: { chat_id: 8801, protocolo: 'DEMO-P8801' } };
  const err = Object.assign(new Error('Resposta perdida sintética'), { semResposta: true });
  GI.chamadosCriar = async () => { throw err; };
  GI.chamadosPorContato = async () => ({ rows: [{ id: 1, status: 'novo', criado_em: '2026-10-19T12:00:00.000Z', ...dados, ...mudanca }] });
  await assert.rejects(() => GI.chamadosCriarSeguro(dados), e => e === err);
});
test('F18 criação segura reconcilia mesma locação na janela, normaliza título e escolhe mais recente', async () => {
  const GI = carregar(() => Date.parse('2026-10-19T12:00:00.000Z'));
  const dados = { locacao_id: 2, titulo: ' Reparo   Demonstração ', solicitante: { contato_id: 9901 }, atendimento: { chat_id: 8801, protocolo: 'DEMO-P8801' } };
  GI.chamadosCriar = async () => { throw Object.assign(new Error('Resposta perdida sintética'), { semResposta: true }); };
  GI.chamadosPorContato = async () => ({ rows: [
    { ...dados, id: 1, status: 'novo', criado_em: '2026-10-19T11:58:00.000Z' },
    { ...dados, id: 2, titulo: 'reparo demonstração', status: 'triagem', criado_em: '2026-10-19T12:00:00.000Z' }
  ] });
  const r = await GI.chamadosCriarSeguro(dados);
  assert.equal(r.reconciliado, true); assert.equal(r.chamado.id, 2);
});
test('F18 criação segura usa início da operação mesmo após resposta demorada e aceita chamado sem vínculo', async () => {
  let agora = Date.parse('2026-10-19T12:00:00.000Z');
  const GI = carregar(() => agora);
  const dados = { locacao_id: 2, titulo: 'Reparo Demonstração', solicitante: { contato_id: 9901 } };
  GI.chamadosCriar = async () => { agora += 240000; throw Object.assign(new Error('Resposta perdida sintética'), { semResposta: true }); };
  GI.chamadosPorContato = async () => ({ rows: [{ ...dados, id: 3, status: 'novo', atendimento: null, criado_em: '2026-10-19T11:58:00.000Z' }] });
  const r = await GI.chamadosCriarSeguro(dados);
  assert.equal(r.chamado.id, 3);
});
test('manifest 0.24.0 declara navegação ordenada, cockpit e escrita configurável', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(m.version, '0.24.0');
  assert.deepEqual(m.contributions[0].items.map(i => i.id), ['gi-imoveis', 'gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-campos', 'gi-historico', 'gi-config']);
  for (const item of m.contributions[0].items) assert.ok(existsSync(new URL('../' + item.url, import.meta.url)));
  const cockpit = m.contributions.find(c => c.id === 'gi-cockpit');
  assert.equal(cockpit.type, 'chatPanel'); assert.equal(cockpit.url, 'app/painel.html');
  assert.equal(cockpit.title, 'Manutenção'); assert.equal(cockpit.presentation, undefined);
  assert.deepEqual(cockpit.visibility.userTypes, [0, 1, 2]);
  for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores']) {
    assert.deepEqual(m.contributions[0].items.find(i => i.id === id).visibility, { userIds: [1, 515, 528, 531] });
  }
  for (const id of ['gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config']) {
    assert.equal(m.contributions[0].items.find(i => i.id === id).visibility, undefined);
  }
  for (const k of ['modoDemonstracao']) {
    const c = m.config.find(c => c.key === k);
    assert.equal(c.type, 'boolean'); assert.equal(c.default, false); assert.ok(c.help);
  }
  const GI = carregar(); GI.ctx = () => ({ user: { type: 0 } });
  const cabecalho = GI.cabecalho('gi-chamados');
  const titulos = m.contributions[0].items.map(i => i.title);
  for (let i = 1; i < titulos.length; i++) assert.ok(cabecalho.indexOf(titulos[i - 1]) < cabecalho.indexOf(titulos[i]));
});
test('formatação pura: número, rótulos, trilha e máscaras nunca produzem marcação hostil', () => {
  const GI = carregar(), hostil = '<img src=x onerror=alert(1)>';
  assert.equal(GI.chamadoNumero(1001), 'OS-1001');
  for (const v of [null, '', hostil, NaN, Infinity, -1, 1.2]) assert.equal(GI.chamadoNumero(v), '—');
  assert.equal(GI.mascaraDocumento('00000000000'), '***.000.000-**');
  assert.equal(GI.mascaraDocumento('00000000000000'), '**.000.000/****-**');
  assert.equal(GI.mascaraDocumento(hostil), '—');
  assert.equal(GI.mascaraTelefone('5500000000000'), '(00) 00000-0000');
  assert.equal(GI.mascaraTelefone('0000000000'), '(00) 0000-0000');
  assert.equal(GI.mascaraTelefone(hostil), '—');
  const trilha = GI.chamadoTrilha('orcamento');
  assert.equal(trilha.length, 7);
  assert.deepEqual(plain(trilha.filter(s => s.feito).map(s => s.status)), ['novo', 'triagem']);
  assert.equal(trilha.filter(s => s.atual)[0].status, 'orcamento');
  for (const s of ['cancelado', hostil, null]) assert.ok(GI.chamadoTrilha(s).every(s => !s.atual && !s.feito));
  assert.equal(GI.CHAMADO_STATUS.execucao, 'Em execução');
  assert.equal(GI.CHAMADO_STATUS_CLASSES.aprovacao, 'gi-estado-pendente');
});
test('SLA usa relógio fornecido, prioriza resposta vencida, pausa e estados terminais', () => {
  const GI = carregar(), agora = '2026-10-17T12:00:00.000Z';
  const c = { status: 'novo', sla: { prazo_resposta_em: '2026-10-17T12:15:00.000Z', prazo_solucao_em: '2026-10-18T16:00:00.000Z' } };
  assert.equal(GI.chamadoPrazo(c, agora), 'Vence em 15min');
  c.sla.primeira_resposta_em = agora;
  assert.equal(GI.chamadoPrazo(c, agora), 'Vence em 1d 4h');
  c.sla.prazo_solucao_em = '2026-10-17T10:00:00.000Z';
  assert.equal(GI.chamadoPrazo(c, agora), 'Atrasado há 2h');
  c.sla.pausado = true; c.status_desde = '2026-10-17T11:00:00.000Z';
  assert.equal(GI.chamadoPrazo(c, agora), 'SLA pausado há 1h · espera o proprietário');
  c.sla.primeira_resposta_em = null; c.sla.prazo_resposta_em = '2026-10-17T10:00:00.000Z';
  assert.equal(GI.chamadoPrazo(c, agora), 'Responder já');
  c.status = 'concluido'; assert.equal(GI.chamadoPrazo(c, agora), 'Concluído');
  c.status = 'cancelado'; assert.equal(GI.chamadoPrazo(c, agora), 'Cancelado');
  assert.equal(GI.chamadoPrazo({ sla: { prazo_solucao_em: '<img>' } }, agora), 'Prazo não informado');
  assert.equal(GI.chamadoPrazo({}, '<img>'), 'Prazo não informado');
});
test('helpers cobrem o contrato, preservam payloads e recusam manutenção sem portal', async () => {
  const GI = carregar(), chamadas = [];
  GI.chamarPortal = async (rota, op) => { chamadas.push([rota, op?.corpo]); return { ok: true }; };
  const operacoes = [
    [() => GI.chamados({ busca: 'ação & sol' }), '/chamados?busca=a%C3%A7%C3%A3o%20%26%20sol'],
    [() => GI.chamadosObter(1), '/chamados/1'], [() => GI.chamadosCriar({ titulo: 'DEMO' }), '/chamados', { titulo: 'DEMO' }],
    [() => GI.chamadosAtualizar(1, { atendimento: null }), '/chamados/1', { atendimento: null }],
    [() => GI.chamadosStatus(1, 'triagem', 'DEMO'), '/chamados/1/status', { status: 'triagem', motivo: 'DEMO' }],
    [() => GI.chamadosNota(1, { texto: 'DEMO' }), '/chamados/1/notas', { texto: 'DEMO' }],
    [() => GI.chamadosAnexos(1, []), '/chamados/1/anexos', { anexos: [] }],
    [() => GI.chamadosAnexoUpload(1, { nome: 'sintetica.jpg' }), '/chamados/1/anexos/upload', { nome: 'sintetica.jpg' }],
    [() => GI.chamadosAnexoArquivo(1, 2), '/chamados/1/anexos/2/arquivo'],
    [() => GI.chamadosPorLocacao(1, { abertos: 1 }), '/locacoes/1/chamados?abertos=1'],
    [() => GI.chamadosPorContato(9901), '/contatos/9901/chamados'],
    [() => GI.chamadosAtendimentosVinculados(9901), '/atendimentos/vinculados?contato_id=9901'],
    [() => GI.chamadosPrestador(1, null), '/chamados/1/prestador', { prestador_id: null }],
    [() => GI.chamadosVisita(1, { inicio: null }), '/chamados/1/visita', { inicio: null }],
    [() => GI.chamadosOrcamentoCriar(1, {}), '/chamados/1/orcamentos', {}],
    [() => GI.chamadosOrcamentoEscolher(1, 2), '/chamados/1/orcamentos/2/escolher', {}],
    [() => GI.chamadosOrcamentoApagar(1, 2), '/chamados/1/orcamentos/2/apagar', {}],
    [() => GI.chamadosAprovacao(1, { acao: 'enviada' }), '/chamados/1/aprovacao', { acao: 'enviada' }],
    [() => GI.prestadores({ ativos: 1 }), '/prestadores?ativos=1'], [() => GI.prestadoresCriar({}), '/prestadores', {}],
    [() => GI.prestadoresAtualizar(1, {}), '/prestadores/1', {}], [() => GI.prestadoresAtivar(1), '/prestadores/1/ativar', {}],
    [() => GI.prestadoresDesativar(1), '/prestadores/1/desativar', {}], [() => GI.manutencaoConfig(), '/config/manutencao'],
    [() => GI.manutencaoConfigSalvar({ alcada_centavos: 1 }), '/config/manutencao', { alcada_centavos: 1 }]
  ];
  for (const modo of ['local', 'portal-fora', 'demonstracao']) {
    GI.modo = modo;
    for (const [fn] of operacoes) await assert.rejects(fn, /portal conectado/);
  }
  assert.equal(chamadas.length, 0);
  GI.modo = 'portal';
  for (const [fn, rota, corpo] of operacoes) {
    await fn(); const r = chamadas.at(-1);
    assert.equal(r[0], rota); assert.deepEqual(plain(r[1] ?? null), corpo ?? null);
  }
});
function bancada() {
  let tempo = Date.parse('2026-10-17T12:00:00.000Z');
  const locacoes = [{ id: 1, imovel_codigo: 'DEMO-001', imovel_titulo: 'Imóvel Demonstração', contatos: [{ contato_id: 9901 }, { contato_id: 9903 }] },
    { id: 2, imovel_titulo: 'Imóvel Encerrado Demonstração', contatos: [], encerrada_em: '2026-01-01' }];
  const p = criarPortalChamados({ locacoes, agora: () => tempo, semFixtures: true });
  function api(rota, dados) {
    const u = new URL(rota, 'http://bancada.invalid');
    return p.responder(dados === undefined ? 'GET' : 'POST', u.pathname, u.searchParams, dados, 'Agente Teste');
  }
  const entrada = { locacao_id: 1, titulo: 'Vazamento Demonstração', categoria: 'hidraulica', solicitante: { contato_id: 9903, nome: 'Proprietário Demonstração' } };
  return { api, p, entrada, andar: ms => { tempo += ms; }, locacoes };
}
test('portal: sequência, 422 atômico, vínculo, contato do imóvel, filtros e locação encerrada', () => {
  const { api, entrada, p, locacoes } = bancada();
  assert.equal(api('/chamados', {}).status, 422);
  assert.equal(api('/chamados', { ...entrada, locacao_id: 2 }).corpo.erro, 'locacao_encerrada');
  assert.equal(api('/chamados', { ...entrada, anexos: [{}] }).status, 422);
  const c = api('/chamados', entrada).corpo.chamado;
  assert.equal(c.numero, 1001); assert.equal(c.sla.prazo_resposta_em, '2026-10-17T16:00:00.000Z');
  assert.equal(api('/chamados', { ...entrada, prioridade: 'alta' }).corpo.chamado.numero, 1002);
  assert.equal(api('/chamados', { ...entrada, prioridade: 'emergencia' }).corpo.chamado.numero, 1003);
  assert.equal(p.contarAbertos(1), 3);
  assert.equal(api('/contatos/9901/chamados').corpo.total, 3);
  assert.equal(api('/chamados?contato_id=9901&categoria=hidraulica&prioridade=alta').corpo.total, 1);
  assert.equal(api('/chamados?busca=vazamento&por_pagina=1&pagina=2').corpo.rows[0].numero, 1002);
  assert.equal(api('/chamados?imovel_codigo=DEMO-001&status=novo').corpo.total, 3);
  assert.equal(api('/locacoes/1/chamados?abertos=1').corpo.total, 3);
  assert.equal(api('/chamados/' + c.id).corpo.locacao.chamados_abertos, 3);
  api('/chamados/' + c.id, { atendimento: { chat_id: 8801, protocolo: 'DEMO' }, atendente: { user_id: 9999, nome: 'Agente Demonstração' } });
  assert.equal(api('/chamados?atendente_user_id=9999').corpo.total, 1);
  assert.equal(api('/atendimentos/vinculados?contato_id=9901').corpo.rows[0].chat_id, 8801);
  api('/chamados/' + c.id, { atendimento: null });
  assert.equal(api('/atendimentos/vinculados?contato_id=9901').corpo.rows.length, 0);
  assert.equal(api('/chamados/' + c.id).corpo.eventos.filter(e => e.tipo === 'vinculou_atendimento').length, 2);
  assert.equal(api('/chamados/' + c.id, { numero: 8, locacao_id: 2 }).corpo.chamado.numero, 1001);
  locacoes[0].encerrada_em = '2026-10-17';
  assert.equal(api('/contatos/9901/chamados').corpo.total, 0);
  assert.equal(api('/chamados/999').status, 404);
});
test('portal: status terminais, reabrir, notas, anexos idempotentes e primeira resposta única', () => {
  const { api, entrada, andar } = bancada(), c = api('/chamados', entrada).corpo.chamado, base = '/chamados/' + c.id;
  assert.equal(api(base + '/status', { status: 'aprovacao' }).corpo.erro, 'sem_orcamento_escolhido');
  assert.equal(api(base + '/status', { status: 'agendado' }).corpo.erro, 'sem_visita');
  assert.equal(api(base + '/status', { status: 'hostil' }).status, 422);
  assert.equal(api(base + '/notas', { texto: '' }).status, 422);
  assert.equal(api(base + '/notas', { texto: 'Nota sintética', notificou_cliente: true }).status, 201);
  const primeira = api(base).corpo.chamado.sla.primeira_resposta_em;
  andar(60000); api(base + '/status', { status: 'triagem' });
  assert.equal(api(base).corpo.chamado.sla.primeira_resposta_em, primeira);
  const anexo = { file_ref: 'DEMO-FOTO', nome: '<img src=x>' };
  api(base + '/anexos', { anexos: [anexo, anexo] });
  assert.equal(api(base + '/anexos', { anexos: [anexo] }).corpo.anexos.length, 1);
  assert.equal(api(base).corpo.chamado.anexos_total, 1);
  for (const status of ['concluido', 'cancelado']) {
    const fim = api(base + '/status', { status, motivo: 'DEMO' }).corpo.chamado;
    assert.ok(fim[status + '_em']);
    assert.equal(api(base, { titulo: 'Proibido' }).corpo.erro, 'chamado_encerrado');
    assert.equal(api(base + '/status', { status: 'novo' }).corpo.erro, 'chamado_encerrado');
    const reaberto = api(base + '/status', { status: 'triagem' }).corpo.chamado;
    assert.equal(reaberto.concluido_em, null); assert.equal(reaberto.cancelado_em, null);
  }
});
test('portal: prestadores, configuração validada, visita, orçamento único, alçada e aprovação', () => {
  const { api, entrada } = bancada(), base = '/chamados/' + api('/chamados', entrada).corpo.chamado.id;
  assert.deepEqual(api('/config/manutencao').corpo, PADROES);
  assert.equal(api('/config/manutencao', { alcada_centavos: 0 }).status, 422);
  assert.equal(api('/config/manutencao', { alcada_centavos: 1, sla: { alta: { resposta_min: -1, solucao_h: 2 } } }).status, 422);
  assert.equal(api('/config/manutencao').corpo.alcada_centavos, 25000);
  api('/config/manutencao', { alcada_centavos: 30000, sla: { alta: { resposta_min: 30, solucao_h: 48 } } });
  assert.equal(api('/config/manutencao').corpo.sla.normal.solucao_h, 120);
  assert.equal(api('/prestadores', { nome: 'DEMO', categorias: ['invalida'] }).status, 422);
  const p = api('/prestadores', { nome: 'Prestador Demonstração', categorias: ['hidraulica'] }).corpo.prestador;
  api('/prestadores/' + p.id, { nome: 'Prestador Demonstração Atualizado' });
  assert.equal(api('/prestadores?categoria=hidraulica&busca=atualizado').corpo.total, 1);
  api('/prestadores/' + p.id + '/desativar', {});
  assert.equal(api('/prestadores?ativos=1').corpo.total, 0); assert.equal(api('/prestadores').corpo.total, 1);
  api('/prestadores/' + p.id + '/ativar', {});
  assert.equal(api(base + '/prestador', { prestador_id: p.id }).corpo.chamado.prestador.id, p.id);
  assert.equal(api(base + '/prestador', { prestador_id: null }).corpo.chamado.prestador, null);
  assert.equal(api(base + '/prestador', { prestador_id: 999 }).status, 422);
  assert.equal(api(base + '/visita', { inicio: '2026-10-20T12:00:00Z', fim: '2026-10-19T12:00:00Z' }).status, 422);
  api(base + '/visita', { inicio: '2026-10-20T12:00:00Z', fim: '2026-10-20T14:00:00Z' });
  assert.equal(api(base + '/aprovacao', { acao: 'enviada' }).corpo.erro, 'aprovacao_nao_necessaria');
  api(base, { quem_paga: 'proprietario' });
  assert.equal(api(base + '/orcamentos', { prestador_id: p.id, valor_centavos: -1 }).status, 422);
  const o1 = api(base + '/orcamentos', { prestador_id: p.id, valor_centavos: 30000 }).corpo.orcamento;
  const o2 = api(base + '/orcamentos', { prestador_nome: 'Avulso Demonstração', valor_centavos: 30001 }).corpo.orcamento;
  assert.equal(o1.prestador_nome, 'Prestador Demonstração Atualizado');
  assert.equal(api(base + '/orcamentos/' + o1.id + '/escolher', {}).corpo.chamado.aprovacao.status, 'nao_necessaria');
  assert.equal(api(base + '/orcamentos/' + o2.id + '/escolher', {}).corpo.chamado.aprovacao.status, 'pendente');
  assert.equal(api(base).corpo.orcamentos.filter(o => o.escolhido).length, 1);
  api(base + '/status', { status: 'aprovacao' });
  for (const status of ['agendado', 'execucao']) assert.equal(api(base + '/status', { status }).corpo.erro, 'aprovacao_pendente');
  assert.equal(api(base + '/orcamentos/' + o2.id + '/apagar', {}).corpo.erro, 'orcamento_escolhido');
  assert.equal(api(base + '/orcamentos/' + o1.id + '/apagar', {}).status, 200);
  api(base + '/aprovacao', { acao: 'enviada', canal: 'WhatsApp' });
  assert.ok(api(base).corpo.chamado.aprovacao.enviada_em);
  api(base + '/aprovacao', { acao: 'recusada', por: 'Proprietário Demonstração' });
  assert.equal(api(base).corpo.chamado.status, 'aprovacao');
  assert.equal(api(base + '/aprovacao', { acao: 'aprovada', por: 'Proprietário Demonstração' }).corpo.erro, 'aprovacao_recusada');
  const o3 = api(base + '/orcamentos', { prestador_nome: 'Nova cotação sintética', valor_centavos: 60000 }).corpo.orcamento;
  api(base + '/orcamentos/' + o3.id + '/escolher', {});
  assert.equal(api(base + '/aprovacao', { acao: 'aprovada', por: 'Proprietário Demonstração' }).status, 200);
  assert.equal(api(base + '/status', { status: 'agendado' }).status, 200);
});
test('portal: SLA recalcula prioridade com pausas acumuladas e encerrar limpa pausa', () => {
  const { api, entrada, andar } = bancada(), base = '/chamados/' + api('/chamados', entrada).corpo.chamado.id;
  const o = api(base + '/orcamentos', { prestador_nome: 'Prestador Demonstração', valor_centavos: 1 }).corpo.orcamento;
  api(base + '/orcamentos/' + o.id + '/escolher', {});
  const antes = Date.parse(api(base).corpo.chamado.sla.prazo_solucao_em);
  api(base + '/status', { status: 'aprovacao' }); andar(3600000);
  api(base + '/status', { status: 'aprovacao' }); // repetir não reinicia pausa
  andar(3600000);
  api(base, { prioridade: 'alta' });
  const apos = api(base + '/status', { status: 'triagem' }).corpo.chamado;
  assert.equal(Date.parse(apos.sla.prazo_solucao_em), antes - 48 * 3600000 + 2 * 3600000);
  const recalculado = api(base, { prioridade: 'normal' }).corpo.chamado;
  assert.equal(Date.parse(recalculado.sla.prazo_solucao_em), antes + 2 * 3600000);
  api(base + '/status', { status: 'aprovacao' }); andar(3600000);
  const fim = api(base + '/status', { status: 'concluido' }).corpo.chamado;
  assert.equal(fim.sla.pausado, false); assert.equal(Date.parse(fim.sla.prazo_solucao_em), antes + 2 * 3600000);
});
test('HTTP integrado: fixtures, resumo, contagens reais, autenticação e todas as rotas montadas', async t => {
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  t.after(() => { servidor.closeAllConnections(); return new Promise(r => servidor.close(r)); });
  const base = 'http://127.0.0.1:' + servidor.address().port;
  async function get(rota) { const r = await fetch(base + '/api/ext' + rota, { headers: { Authorization: 'Bearer bancada-sintetica' } }); assert.equal(r.status, 200); return r.json(); }
  for (const rota of ['/chamados', '/prestadores', '/config/manutencao', '/contatos/9901/chamados', '/locacoes/1/chamados', '/atendimentos/vinculados']) assert.equal((await fetch(base + '/api/ext' + rota)).status, 401);
  const lista = await get('/chamados');
  assert.equal(lista.total, 8); assert.equal(new Set(lista.rows.map(c => c.status)).size, 8);
  assert.equal(lista.resumo.prazo_estourado, 1); assert.equal(lista.resumo.aguardando_proprietario, 1);
  assert.equal((await get('/prestadores')).total, 4);
  assert.equal((await get('/locacoes/1')).locacao.chamados_abertos, 2);
  const porContato = await get('/contatos/9901/chamados');
  assert.ok(porContato.rows.some(c => c.solicitante.contato_id === 9903));
  assert.equal((await get('/config/manutencao')).alcada_centavos, 25000);
});
test('Chromium: páginas esqueleto, SDK, navegação, escrita desligada e demonstração sem rede', async () => {
  const servidor = criarServidor(); await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + servidor.address().port;
  let b;
  try {
    b = await abrirChromium();
    for (const tela of ['chamados', 'prestadores', 'painel']) {
      await b.navegar(base + '/app/' + tela + '.html');
      await b.esperar(() => document.querySelector('#gi-modo').textContent.includes('Conectado'));
      assert.equal(await b.avaliar(() => GI.cfg('cockpitAbreChamado')), false);
      if (tela === 'painel') {
        await b.esperar(() => !!document.querySelector('[data-chamado]'));
        const snapshot = await b.avaliar(async () => omni.storage.get('gi-cockpit-snapshots-v1'));
        assert.equal(snapshot.rows[0].contatoId, 9901);
        assert.doesNotMatch(JSON.stringify(snapshot), /portalToken|bancada-sintetica|base64|anexos/);
      } else assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
    }
    await b.navegar(base + '/app/painel.html?chat=8802&escrita=1');
    assert.equal(await b.avaliar(async () => (await omni.chats.getSelected()).id), 8802);
    assert.equal(await b.avaliar(async () => (await omni.contacts.get(9902)).name), 'Locatário Demonstração Dois');
    assert.equal(await b.avaliar(async () => (await omni.users.list()).length), 3);
    assert.equal(await b.avaliar(async () => (await omni.chats.listMine()).length), 4);
    assert.equal(await b.avaliar(async () => { try { await omni.chats.listByQueue(91); } catch (e) { return e.code; } }), 'forbidden');
    assert.equal(await b.avaliar(async () => {
      const user = await omni.session.getUser(); user.type = 1;
      try { return (await omni.chats.listByQueue(92)).length; } finally { user.type = 2; }
    }), 1);
    assert.ok(await b.avaliar(async () => (await omni.chats.getMessages(8802))[0].fileRef));
    assert.ok(await b.avaliar(async () => (await omni.chats.getFile('DEMO-FOTO-8802')).url.startsWith('data:')));
    await b.avaliar(async () => {
      await omni.chats.select(8801);
      await omni.chats.sendMessage(8801, { text: '<img src=x onerror="window.__xss=1">' });
    });
    assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
    assert.equal(await b.avaliar(() => bancada.eventos[0].nome), 'omniChatSelected');
    assert.equal(await b.avaliar(() => GI.cfg('cockpitAbreChamado')), true);
    assert.equal(await b.avaliar(async () => { bancada.recusarEnvio = true; try { await omni.chats.sendMessage(8801, { text: 'DEMO' }); } catch (e) { return e.code; } }), 'forbidden');
    assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
    assert.equal(await b.avaliar(async () => (await omni.contacts.search('Demonstracao Um')).length), 1);
    await b.navegar(base + '/app/painel.html?chat=0&modo=local');
    await b.esperar(() => document.querySelector('#gi-modo').textContent.includes('exige o portal'));
    assert.equal(await b.avaliar(async () => await omni.chats.getSelected()), null);
    assert.equal(await b.avaliar(() => bancada.rede.length), 0);
    await b.navegar(base + '/app/painel.html?demonstracao=1');
    await b.esperar(() => document.querySelector('#gi-modo').textContent.includes('DEMONSTRAÇÃO'));
    assert.equal(await b.avaliar(() => bancada.rede.length), 0);
    assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
    assert.equal(await b.avaliar(async () => { try { await GI.chamarPortal('/chamados'); } catch (e) { return e.message; } }), 'Demonstração sem rede: use os dados sintéticos da tela.');
    assert.equal(await b.avaliar(async () => { try { await fetch('/api/ext/chamados'); } catch (e) { return e.message; } }), 'Demonstração: rede bloqueada.');
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
    for (const width of [260, 300, 334]) {
      await b.viewport(width, 700);
      assert.ok(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.equal(await b.avaliar(() => document.querySelectorAll('img, script[src="x"]').length), 0);
    assert.equal(await b.avaliar(() => window.__xss), undefined);
    assert.deepEqual(b.erros, []);
  } finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
});

test('17: plural seleciona singular só para um, incluindo contagens vazias', () => {
  const GI = carregar();
  assert.equal(GI.plural(1, 'aberto', 'abertos'), 'aberto');
  assert.equal(GI.plural(0, 'aberto', 'abertos'), 'abertos');
  assert.equal(GI.plural(2, 'concluído', 'concluídos'), 'concluídos');
  assert.equal(GI.plural('1', 'imóvel', 'imóveis'), 'imóvel');
});

test('22: estados pendentes e azuis derivam cores dos tokens do tema', () => {
  const estilo = readFileSync(new URL('../app/estilo.css', import.meta.url), 'utf8');
  const chamados = readFileSync(new URL('../app/chamados.css', import.meta.url), 'utf8');
  const pendente = estilo.match(/\.gi-estado-pendente\s*\{([^}]+)\}/)[1];
  assert.match(pendente, /color-mix\(in srgb, var\(--gi-texto\)/);
  assert.match(pendente, /var\(--gi-pendente\)/);
  assert.doesNotMatch(pendente + chamados, /#[\da-f]{3,8}\b|rgba?\(/i);
  assert.match(chamados, /var\(--ext-color-info/);
});

test('F6: mescla apenas atendimentos abertos do contato, sem duplicar nem aceitar estado desconhecido', () => {
  const GI = carregar();
  const a = { id: 10, contactId: 20, status: 'active', protocol: '<img>', channel: 'WhatsApp', queueId: 91, startedAt: '2026-10-18T12:00:00Z' };
  const rows = GI.mesclarAtendimentos([[a, { ...a, id: 11, status: 'closed' }], [a, { ...a, id: 12, contactId: 21 }, { ...a, id: 13, status: 'desconhecido' }]], 20, [{ id: 91, name: 'Fila teste' }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].chat_id, 10); assert.equal(rows[0].fila, 'Fila teste');
  assert.match(GI.atendimentoTexto(rows[0]), /#10 · WhatsApp · <img> ·/);
  assert.equal(GI.atendimentoTexto(null), 'Nenhum atendimento vinculado');
  assert.equal(GI.normalizarPrestador('  João   SILVA '), 'joao silva');
});

test('F6: orçamento só com nome e descrição guarda prestador, reaproveita e não zera valor estimado', () => {
  const { api, entrada } = bancada(), base = '/chamados/' + api('/chamados', entrada).corpo.chamado.id;
  api(base, { valor_estimado_centavos: 50000, quem_paga: 'proprietario' });
  const primeiro = api(base + '/orcamentos', { prestador_nome: 'João  Teste', observacao: '<img> descrição livre' });
  assert.equal(primeiro.status, 201);
  const o = primeiro.corpo.orcamento;
  assert.ok(o.prestador_id); assert.equal(o.valor_centavos, null);
  const segundo = api(base + '/orcamentos', { prestador_nome: ' joao teste ', valor_centavos: null }).corpo.orcamento;
  assert.equal(segundo.prestador_id, o.prestador_id);
  assert.equal(api('/prestadores?busca=joao&ativo=1&por_pagina=8').corpo.rows.length, 1);
  const c = api(base + '/orcamentos/' + o.id + '/escolher', {}).corpo.chamado;
  assert.equal(c.valor_estimado_centavos, 50000); assert.equal(c.aprovacao.status, 'pendente');
  assert.equal(api(base).corpo.orcamentos[0].observacao, '<img> descrição livre');
  assert.equal(api(base + '/orcamentos', { prestador_nome: 'Teste', valor_centavos: -1 }).status, 422);
});

test('F6: prestador inativo é reaproveitado sem reativação; null listado e valores inválidos continuam recusados', () => {
  const { api, entrada } = bancada(), base = '/chamados/' + api('/chamados', entrada).corpo.chamado.id;
  const p = api('/prestadores', { nome: 'João   Teste' }).corpo.prestador;
  api('/prestadores/' + p.id + '/desativar', {});
  const r = api(base + '/orcamentos', { prestador_nome: ' joao teste ', valor_centavos: null });
  assert.equal(r.status, 201); assert.equal(r.corpo.orcamento.prestador_id, p.id);
  assert.equal(api('/prestadores?ativo=1&busca=joao').corpo.total, 0);
  assert.equal(api('/prestadores?busca=joao').corpo.rows[0].ativo, false);
  assert.equal(api(base).corpo.orcamentos[0].valor_centavos, null);
  for (const v of [-1, 'abc', 1.2]) assert.equal(api(base + '/orcamentos', { prestador_nome: 'Teste', valor_centavos: v }).status, 422);
  assert.equal(api('/prestadores').corpo.total, 1);
});
