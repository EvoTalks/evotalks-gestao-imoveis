import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function carregar() {
  const window = { addEventListener() {}, omni: { queueTypes: { WHATSAPP: 0, WEBCHAT: 3 } } };
  const ctx = { window, document: {}, URL, console, setTimeout, clearTimeout, omni: window.omni };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), ctx); ctx.GI = window.GI;
  vm.runInNewContext(readFileSync('app/manutencao.js', 'utf8'), ctx);
  return { GI: ctx.GI, ctx };
}
const plain = v => JSON.parse(JSON.stringify(v));
test('lote 1: SDK numérico, nulos e histórico chegam tipados ao portal', () => {
  const { GI } = carregar();
  assert.deepEqual(plain(GI.atendimentoPortal({ id: '8801', protocol: 123, channel: 3, queueId: 91, startedAt: 1792242000000 }, [{ id: 91, name: 'Fila sintética' }])),
    { chat_id: 8801, protocolo: '123', canal: 'WebChat', fila: 'Fila sintética', iniciado_em: new Date(1792242000000).toISOString() });
  assert.equal(GI.atendimentoPortal({ id: Infinity, channel: 0, startedAt: null }).chat_id, null);
  for (const v of [null, '', Infinity, 'inválido']) assert.equal(GI.isoPortal(v), null);
  assert.equal(GI.isoPortal('2026-10-17 12:00:00'), '2026-10-17T12:00:00.000Z');
  const h = GI.unirHistoricoAtendimentos([{ id: 99, origin: 0, protocol: 890, begintime: '2026-10-17 12:00:00' }], []);
  assert.equal(h[0].protocolo, '890'); assert.equal(h[0].iniciado_em, '2026-10-17T12:00:00.000Z');
  assert.equal(GI.nomeContato({ phone: 123 }, { contactId: 99 }), '123');
  assert.equal(GI.nomeContato({}, { contactId: 99, contact: { name: 'Visitante' } }), 'Visitante');
  assert.equal(GI.nomeContato({}, { contactId: 99 }), 'Contato 99');
});
test('lote 1: autoria aceita cabeçalho Latin1 sem controles nem codificação', () => {
  const { GI } = carregar();
  assert.equal(GI.autorCabecalho('  Agente “Teste” 😀\r\n ç  '), 'Agente ?Teste? ?? ç');
});
test('lote 1: reais com ponto decimal ou milhar brasileiro', () => {
  const { GI } = carregar();
  for (const v of ['1.500,00', '1500,00', '1500.00', 'R$ 1.500,00']) assert.equal(GI.valorReais(v), 150000);
  assert.equal(GI.paraNumero('1500.00'), 1500);
  for (const v of ['1.50,00', 'x', '-2', '1,234', '<img>']) assert.throws(() => GI.valorReais(v), /Informe o valor em reais, por exemplo 1.500,00/);
});
test('lote 1: busca preserva contato sem nome e pede 100 resultados', async () => {
  const { GI, ctx } = carregar();
  ctx.omni.contacts = { search: async (q, opts) => { assert.equal(opts.limit, 100); return [{ id: 10, phone: 123 }, { id: 11 }]; } };
  assert.deepEqual(plain(await GI.buscarContatos('123')), [{ id: 10, name: '123', phone: '123', email: '' }, { id: 11, name: 'Contato 11', phone: '', email: '' }]);
});
const codigos = ['locacao_encerrada', 'nao_encontrada', 'nao_encontrado', 'api_desabilitada', 'falha_interna', 'imovel_ja_locado', 'aprovacao_pendente', 'aprovacao_recusada', 'sem_visita', 'limite_anexos', 'arquivo_grande', 'orcamento_escolhido', 'rate_limited', 'rate_limit'];
for (const codigo of codigos) test('lote 1: erro em português ' + codigo, () => {
  const { GI } = carregar(), mensagem = GI.mensagemErro({ dados: { erro: codigo } });
  assert.ok(mensagem.length > 20); assert.ok(!mensagem.includes(codigo)); assert.doesNotMatch(mensagem, /HTTP|Informe um texto/);
});
test('lote 1: 422 nomeia campos e rede nunca expõe status nem código', () => {
  const { GI } = carregar();
  assert.match(GI.mensagemErro({ status: 422, dados: { erro: 'dados_invalidos', campos: { titulo: 'Informe um texto.', 'atendimento.canal': 'Informe um texto.' } } }), /Título:.*Canal:/);
  assert.equal(GI.mensagemErro({ code: 'timeout' }), 'O portal não respondeu. Tente de novo em instantes.');
});
test('lote 1: POST gravado com resposta perdida reconcilia sem duplicar', async () => {
  const { GI } = carregar(); let posts = 0;
  const d = { locacao_id: 1, titulo: 'Reparo sintético', solicitante: { contato_id: 99 }, atendimento: { chat_id: 88 } };
  GI.chamadosCriar = async () => { posts++; throw Object.assign(new Error('timeout'), { semResposta: true }); };
  GI.chamadosPorContato = async () => ({ rows: [{ id: 1, numero: 1001, locacao_id: 1, status: 'novo', titulo: d.titulo, atendimento: d.atendimento, criado_em: new Date().toISOString() }] });
  assert.equal((await GI.chamadosCriarSeguro(d)).chamado.numero, 1001); assert.equal(posts, 1);
});
test('lote 1: fila limita getFile a quatro em voo', async () => {
  const { GI } = carregar(); let ativos = 0, maximo = 0;
  const fila = GI.criarFila(4);
  await Promise.all(Array.from({ length: 50 }, () => fila(async () => { ativos++; maximo = Math.max(maximo, ativos); await new Promise(r => setTimeout(r, 1)); ativos--; })));
  assert.equal(maximo, 4);
});
test('lote 1: erro HTTP e campo desconhecido nunca chegam crus à interface', () => {
  const { GI } = carregar();
  assert.doesNotMatch(GI.mensagemErro({ status: 500, dados: { erro: 'HTTP 500' } }), /HTTP|500/);
  assert.equal(GI.mensagemErro({ status: 400, dados: { campos: { desconhecido: 'Informe um texto.' } } }), 'Não foi possível abrir o chamado. Confira os dados e tente de novo.');
});
test('lote 1: falha na reconciliação mantém criação bloqueada; chamada sem chat também reconcilia', async () => {
  const { GI } = carregar();
  const d = { locacao_id: 1, titulo: 'Sem atendimento sintético', solicitante: { contato_id: 99 } };
  GI.chamadosCriar = async () => { throw Object.assign(new Error('timeout'), { semResposta: true }); };
  GI.chamadosPorContato = async () => { throw new Error('timeout'); };
  await assert.rejects(() => GI.chamadosCriarSeguro(d), err => err.criacaoIncerta === true);
  GI.chamadosPorContato = async () => ({ rows: [{ numero: 1002, locacao_id: 1, status: 'novo', titulo: d.titulo, atendimento: null, criado_em: new Date().toISOString() }] });
  assert.equal((await GI.chamadosCriarSeguro(d)).chamado.numero, 1002);
});
