import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { readFileSync } from 'node:fs';

assert.equal(JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url))).version, '0.22.1');

const servidor = criarServidor();
// O contrato legado de configuração é independente do simulador de manutenção.
const atender = servidor.listeners('request')[0];
servidor.removeAllListeners('request');
servidor.on('request', (req, res) => {
  if (req.url === '/api/ext/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ urlFeed: { definida: false }, intervaloHoras: 6, sync: {} }));
  }
  return atender(req, res);
});
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
const prova = texto => process.stdout.write('OK ' + texto + '\n');
try {
  b = await abrirChromium();
  await b.navegar(origem + '/app/chamados.html');
  await b.esperar(() => !!document.querySelector('[data-editar="4"]'));
  await b.clicar('[data-editar="4"]');
  await b.esperar(() => !!document.querySelector('#c-orc-nome'));
  assert.match(await b.avaliar(() => document.querySelector('#c-orcamentos').textContent), /Orçamentos/);
  prova('Editar contém a seção de orçamentos');
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const valor = s => b.avaliar(s => document.querySelector(s)?.value, s);
  async function capturar(nome, seletor) {
    await b.avaliar(s => {
      const mais = document.querySelector('#c-mais'); if (mais) mais.open = true;
      const corpo = document.querySelector('.gi-modal-corpo'), alvo = document.querySelector(s), modal = document.querySelector('.gi-modal');
      corpo.scrollTop += alvo.getBoundingClientRect().top - corpo.getBoundingClientRect().top;
      window.scrollTo(0, Math.max(0, modal.offsetTop - 40));
    }, seletor);
    await b.captura(nome);
  }
  const fechar = () => b.clicar('.gi-modal [data-cancelar]');
  async function abrir(id) {
    await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), id);
    await b.clicar('[data-editar="' + id + '"]');
    await b.esperar(() => !!document.querySelector('#c-orc-nome'));
  }
  async function salvarReabrir() {
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => !document.querySelector('.gi-modal') || !!document.querySelector('.gi-modal-recado').textContent);
    if (!await b.avaliar(() => !!document.querySelector('.gi-modal'))) await abrir(id);
  }
  async function confirmar() { await b.clicar('#c-confirmar-acao'); await b.esperar(() => !document.querySelector('#c-confirmar-acao').disabled); }
  await fechar();
  const id = await b.avaliar(async () => (await GI.chamadosCriar({ locacao_id: 1, titulo: 'Conserto sintético Fatia 4', categoria: 'hidraulica',
    solicitante: { contato_id: 9901, nome: 'Locatário Demonstração Um', telefone: '00000000001' } })).chamado.id);
  await b.clicar('#b-limpar'); await b.esperar(n => !!document.querySelector('[data-editar="' + n + '"]'), id);
  await abrir(id);
  await b.preencher('#c-quem-paga', 'proprietario'); await b.preencher('#c-repasse', 'sim');
  await b.preencher('#c-valor', '123,45'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  await abrir(id);
  assert.equal(await valor('#c-quem-paga'), 'proprietario'); assert.equal(await valor('#c-repasse'), 'sim');
  async function adicionar(nome, valor, prazo) {
    await b.preencher('#c-orc-nome', nome); await b.preencher('#c-orc-valor', valor);
    await b.preencher('#c-orc-observacao', 'Cotação sintética: prazo ' + prazo + ' dias; visita proposta 02/11/2026.');
    await b.clicar('#c-salvar-orcamento'); await b.esperar(() => document.querySelector('#c-orc-nome').value === '' && !document.querySelector('#c-salvar-orcamento').disabled);
  }
  await adicionar('Prestador Avulso Demonstração A', '500,25', '2');
  await adicionar('Prestador Avulso Demonstração B', '650,10', '3');
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-escolher-orcamento]').length), 2);
  await b.clicar('[data-escolher-orcamento="0"]'); await b.esperar(() => !document.querySelector('#c-salvar-orcamento').disabled);
  await b.esperar(() => document.querySelector('#c-aprovacao').textContent.includes('Pendente'));
  await b.clicar('[data-escolher-orcamento="1"]'); await b.esperar(() => !document.querySelector('#c-salvar-orcamento').disabled);
  let detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.equal(detalhe.orcamentos.filter(o => o.escolhido).length, 1);
  assert.equal(detalhe.orcamentos.find(o => o.escolhido).prestador_nome, 'Prestador Avulso Demonstração B');
  assert.equal(detalhe.chamado.valor_estimado_centavos, 65010);
  assert.equal(detalhe.chamado.aprovacao.status, 'pendente');
  assert.match(await texto('#c-aprovacao'), /250,00/);
  await capturar('fatia4-01-orcamentos-aprovacao', '#c-orcamentos');
  prova('dois orçamentos pela tela; escolha única substitui anterior; centavos, repasse e alçada visíveis; aprovação pendente');
  for (const destino of ['agendado', 'execucao']) {
    await b.preencher('#c-status', destino); await b.esperar(() => !document.querySelector('#c-status').disabled);
    assert.match(await texto('#c-status-controle'), /aprovação.*pendente/);
    assert.equal(await valor('#c-status'), 'novo');
  }
  await b.captura('fatia4-02-trava-pendente');
  prova('alçada excedida bloqueia Agendado e Em execução com 409 do portal');

  // Perfil sintético tem atendimento aberto do proprietário visível em sua fila.
  await b.avaliar(() => { omni.session.getPermissions = async () => ({ isSupervisor: true });
    omni.chats.listByQueue = async () => [{ id: 8803, contactId: 9903, queueId: 91, status: 'active', channel: 'WhatsApp' }]; });
  // O select voltou ao estado real e o envio segue sem status pendente.
  assert.equal(await valor('#c-status'), 'novo');
  await b.clicar('#c-enviar-proprietario');
  await b.esperar(() => !document.querySelector('#c-confirmacao').hidden && !document.querySelector('#c-confirmar-acao').disabled);
  assert.match(await texto('#c-confirmacao-texto'), /650,10/);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await confirmar();
  assert.match(await texto('#c-mensagem'), /enviada ao proprietário/);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
  assert.equal(await b.avaliar(() => bancada.mensagens[0].chatId), 8803);
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.ok(detalhe.chamado.aprovacao.enviada_em);
  await capturar('fatia4-03-envio-proprietario', '#c-aprovacao');
  prova('mensagem revisada antes do envio; enviada pelo chat aberto do proprietário; envio registrado após sent:true');

  await b.preencher('#c-aprovacao-observacao', 'Aprovado em conversa sintética');
  await b.clicar('#c-aprovar'); await b.esperar(() => !document.querySelector('#c-aprovar').disabled);
  assert.match(await texto('#c-aprovacao'), /Aprovada/);
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.equal(detalhe.chamado.aprovacao.por, 'Proprietário Demonstração');
  assert.equal(detalhe.chamado.aprovacao.canal, 'WhatsApp');
  await b.preencher('#c-status', 'agendado'); await b.esperar(() => !document.querySelector('#c-status').disabled);
  assert.match(await texto('#c-status-controle'), /visita/);
  await b.captura('fatia4-04-trava-sem-visita');
  await b.preencher('#c-status', 'triagem'); await b.esperar(() => !document.querySelector('#c-status').disabled); await b.preencher('#c-prestador-id', '2'); await salvarReabrir();
  await b.preencher('#c-visita-inicio', '2026-11-02T14:00'); await b.preencher('#c-visita-fim', '2026-11-02T13:00');
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('posterior'));
  await b.preencher('#c-visita-fim', '2026-11-02T16:00'); await salvarReabrir();
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.equal(detalhe.chamado.prestador.id, 2);
  assert.equal(Date.parse(detalhe.chamado.visita.fim) - Date.parse(detalhe.chamado.visita.inicio), 7200000);
  await capturar('fatia4-05-prestador-visita', '#c-prestador');
  await b.preencher('#c-status', 'agendado'); await b.esperar(() => !document.querySelector('#c-status').disabled);
  await b.esperar(() => !!document.querySelector('#c-orc-nome') && document.querySelector('#c-status').value === 'agendado');
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id); assert.equal(detalhe.chamado.status, 'agendado');
  prova('aprovação com autor/canal, trava sem visita, validação de intervalo, prestador e visita gravados; Agendado liberado');
  await b.preencher('#c-aprovacao-observacao', 'Recusa sintética exige decisão'); await b.clicar('#c-recusar'); await b.esperar(() => !document.querySelector('#c-recusar').disabled);
  assert.match(await texto('#c-aprovacao'), /Recusada/);
  assert.equal(await valor('#c-status'), 'aprovacao');
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.equal(detalhe.chamado.aprovacao.status, 'recusada'); assert.equal(detalhe.chamado.status, 'aprovacao'); assert.equal(detalhe.chamado.sla.pausado, true);
  await capturar('fatia4-06-recusa-sla', '#c-aprovacao'); await fechar();
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Prazo pausado'));
  assert.match(await texto('#gi-corpo'), /Responder já/);
  await b.captura('fatia4-07-lista-sla');
  prova('recusa registrada mantém Aprovação e pausa SLA; lista mostra prazo pausado e prazo estourado');

  // Sem vínculo ou sem atendimento: somente nota interna, nunca carimbo de envio.
  for (const locacao of [2, 3]) {
    const n = await b.avaliar(async locacao => {
      const { chamado } = await GI.chamadosCriar({ locacao_id: locacao, titulo: 'Sem envio Demonstração ' + locacao, categoria: 'outros', solicitante: { nome: 'Pessoa Demonstração' } });
      await GI.chamadosAtualizar(chamado.id, { quem_paga: 'proprietario' });
      const { orcamento } = await GI.chamadosOrcamentoCriar(chamado.id, { prestador_nome: 'Prestador Demonstração Avulso', valor_centavos: 60000 });
      await GI.chamadosOrcamentoEscolher(chamado.id, orcamento.id);
      const { locacao: l } = await GI.locacoesObter(locacao);
      await GI.locacoesAtualizar(locacao, { contatos: l.contatos.concat({ papel: 'proprietario', nome: 'Proprietário sem envio Demonstração', ...(locacao === 3 ? { contato_id: 9904 } : {}) }) });
      return chamado.id;
    }, locacao);
    await b.clicar('#b-limpar'); await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), n); await abrir(n);
    await b.clicar('#c-enviar-proprietario'); await b.esperar(() => !document.querySelector('#c-confirmacao').hidden && !document.querySelector('#c-confirmar-acao').disabled); await confirmar();
    assert.match(await texto('#c-mensagem'), /Mensagem não enviada/);
    detalhe = await b.avaliar(async id => GI.chamadosObter(id), n);
    assert.equal(detalhe.chamado.aprovacao.enviada_em, null);
    assert.equal(detalhe.eventos.at(-1).notificou_cliente, false);
    assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
    await b.captura('fatia4-08-sem-envio-' + locacao); await fechar();
  }
  prova('sem contato_id e sem chat aberto: registra nota, orienta e não simula envio');

  await abrir(id);
  await b.avaliar(() => { bancada.recusarEnvio = true; });
  await b.clicar('#c-enviar-proprietario'); await b.esperar(() => !document.querySelector('#c-confirmacao').hidden && !document.querySelector('#c-confirmar-acao').disabled); await confirmar();
  assert.match(await texto('#c-mensagem'), /janela de 24 horas/);
  await b.clicar('#c-voltar'); await b.avaliar(() => { bancada.recusarEnvio = false; });
  await b.avaliar(() => {
    const original = omni.http.request;
    omni.http.request = async op => {
      if (op.method === 'POST' && op.url.endsWith('/aprovacao') && JSON.parse(op.body).acao === 'enviada') {
        omni.http.request = original;
        return { status: 503, body: JSON.stringify({ erro: 'falha_sintetica_de_registro' }) };
      }
      return original(op);
    };
  });
  await b.clicar('#c-enviar-proprietario'); await b.esperar(() => !document.querySelector('#c-confirmacao').hidden && !document.querySelector('#c-confirmar-acao').disabled); await confirmar();
  assert.match(await texto('#c-mensagem'), /Mensagem enviada, mas o registro no portal falhou/);
  const enviados = await b.avaliar(() => bancada.mensagens.length);
  await confirmar();
  assert.equal(await b.avaliar(() => bancada.mensagens.length), enviados);
  assert.match(await texto('#c-mensagem'), /enviada ao proprietário e registrada/);
  await b.captura('fatia4-18-envio-sem-duplicacao');
  await b.clicar('[data-escolher-orcamento="0"]'); await b.esperar(() => !document.querySelector('#c-salvar-orcamento').disabled);
  await b.avaliar(() => { const original = omni.chats.get; omni.chats.get = async id => ({ ...(await original(id)), status: 'closed' }); });
  await b.clicar('#c-enviar-proprietario'); await b.esperar(() => !document.querySelector('#c-confirmacao').hidden && !document.querySelector('#c-confirmar-acao').disabled); await confirmar();
  assert.match(await texto('#c-mensagem'), /não está mais aberto/);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), enviados);
  detalhe = await b.avaliar(async id => GI.chamadosObter(id), id);
  assert.equal(detalhe.chamado.aprovacao.enviada_em, null);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  await fechar();
  prova('forbidden explícito; revalidação impede envio a chat encerrado; falha no registro após envio permite repetir sem duplicação');

  await b.navegar(origem + '/app/prestadores.html');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length >= 6);
  await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#p-nome'));
  await b.preencher('#p-nome', 'Prestador sintético Fatia 4'); await b.preencher('#p-telefone', '00000000000');
  await b.preencher('#p-email', 'fatia4@example.invalid'); await b.preencher('#p-observacao', 'Somente demonstração');
  await b.clicar('[name="p-categoria"][value="hidraulica"]'); await b.clicar('[name="p-categoria"][value="eletrica"]');
  await b.captura('fatia4-09-novo-prestador'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  await b.preencher('#f-busca', 'Prestador sintético Fatia 4'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 1);
  await b.clicar('[data-editar="0"]'); await b.preencher('#p-observacao', 'Alteração sintética preservada');
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
  await b.esperar(() => !!document.querySelector('[data-ativar="0"]'));
  await b.clicar('[data-ativar="0"]'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal') && document.querySelector('#gi-corpo').textContent.includes('Nenhum'));
  await b.preencher('#f-ativos', ''); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Inativo'));
  await b.captura('fatia4-10-prestador-inativo');
  await b.esperar(() => !!document.querySelector('[data-ativar="0"]'));
  await b.clicar('[data-ativar="0"]'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal') && document.querySelector('#gi-corpo').textContent.includes('Ativo'));
  const p = await b.avaliar(async () => (await GI.prestadores({ busca: 'Prestador sintético Fatia 4' })).rows[0]);
  assert.equal(p.ativo, true); assert.equal(p.observacao, 'Alteração sintética preservada'); assert.deepEqual(p.categorias, ['hidraulica', 'eletrica']);
  await b.preencher('#f-categoria', 'pintura'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Nenhum'));
  prova('Prestadores: cadastro, edição, categorias, filtros, vazio, desativação e reativação preservam o cadastro');

  await b.navegar(origem + '/app/config.html'); await b.esperar(() => !document.querySelector('#m-campos').disabled);
  assert.equal(await valor('#m-alcada'), '250,00');
  await b.preencher('#m-alcada', '300,25'); await b.preencher('#m-alta-resposta', '90'); await b.preencher('#m-normal-solucao', '144');
  await b.clicar('#b-manutencao-salvar'); await b.esperar(() => document.querySelector('#m-resultado').textContent.includes('salva e conferida'));
  const config = await b.avaliar(async () => GI.manutencaoConfig());
  assert.equal(config.alcada_centavos, 30025); assert.equal(config.sla.alta.resposta_min, 90); assert.equal(config.sla.normal.solucao_h, 144);
  const antes = await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length);
  await b.preencher('#m-normal-solucao', '0'); await b.clicar('#b-manutencao-salvar');
  assert.match(await texto('#m-resultado'), /positivos/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), antes);
  await b.preencher('#m-normal-solucao', '144'); await b.captura('fatia4-11-configuracao');
  prova('Configurações: padrões, alçada em centavos, SLA por prioridade, releitura e inteiros positivos');

  const hostil = '<img src=x onerror="window.executouHostil=1">';
  const hostilId = await b.avaliar(async h => {
    const { prestador } = await GI.prestadoresCriar({ nome: h, telefone: h, email: h, observacao: h });
    const { chamado } = await GI.chamadosCriar({ locacao_id: 1, titulo: h, categoria: 'outros', solicitante: { nome: h, telefone: h } });
    await GI.chamadosAtualizar(chamado.id, { quem_paga: 'proprietario' });
    const { orcamento } = await GI.chamadosOrcamentoCriar(chamado.id, { prestador_id: prestador.id, valor_centavos: 99900, observacao: h });
    await GI.chamadosOrcamentoEscolher(chamado.id, orcamento.id);
    await GI.chamadosAprovacao(chamado.id, { acao: 'aprovada', por: h, canal: h, observacao: h });
    return chamado.id;
  }, hostil);
  await b.avaliar(async () => GI.prestadoresCriar({ nome: 'Categorias hostis Demonstração', categorias: ['outros'] }));
  await b.navegar(origem + '/app/prestadores.html');
  await b.avaliar(() => { const original = GI.prestadores; GI.prestadores = async (...args) => {
    const r = await original(...args); const p = r.rows.find(item => item.nome === 'Categorias hostis Demonstração');
    if (p) p.categorias = ['constructor', '__proto__']; return r;
  }; });
  await b.clicar('#b-buscar'); await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo img').length), 0);
  await b.avaliar(() => Array.from(document.querySelectorAll('#gi-corpo tr')).find(r => r.textContent.includes('<img')).querySelector('[data-editar]').click());
  assert.equal(await valor('#p-nome'), hostil); assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-modal img').length), 0);
  await b.captura('fatia4-12-prestador-hostil'); await fechar();
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Categorias hostis Demonstração'));
  assert.match(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /Não informada · Não informada/);
  prova('lookups de categoria constructor e __proto__ retornam o rótulo padrão');
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), hostilId);
  await b.avaliar(h => { const original = omni.http.request; omni.http.request = async op => {
    const r = await original(op);
    if (op.method === 'GET' && /\/chamados\/\d+$/.test(op.url)) { const d = JSON.parse(r.body);
      d.orcamentos.forEach(o => { o.prazo_dias = h; o.visita_em = h; o.valor_centavos = h; });
      d.chamado.visita = { inicio: h, fim: h }; d.chamado.aprovacao.enviada_em = h; d.chamado.aprovacao.resposta_em = h;
      d.chamado.aprovacao.status = 'constructor';
      d.eventos = [{ id: 99001, em: d.chamado.criado_em, autor: 'Bancada', tipo: '__proto__', texto: null },
        { id: 99002, em: d.chamado.criado_em, autor: 'Bancada', tipo: 'constructor', texto: null }];
      d.chamado.sla.prazo_solucao_em = h; d.locacao.contatos.push({ papel: 'proprietario', nome: h, telefone: h });
      r.body = JSON.stringify(d); }
    return r; }; }, hostil);
  await abrir(hostilId);
  assert.match(await b.avaliar(() => document.querySelector('#c-aprovacao').textContent), /Não informada/);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-historico li').length), 2);
  assert.equal(await b.avaliar(() => Array.from(document.querySelectorAll('#c-historico li')).some(n => n.textContent.includes('function Object'))), false);
  prova('lookup de aprovação constructor usa fallback e eventos constructor/__proto__ não expõem protótipos');
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-orcamentos img, #c-aprovacao img, #c-prestador img, #c-visita img').length), 0);
  assert.equal(await valor('#c-visita-inicio'), ''); assert.equal(await b.avaliar(() => !!window.executouHostil), false);
  await capturar('fatia4-13-chamado-hostil', '#c-orcamentos'); await fechar();
  await b.navegar(origem + '/app/config.html'); await b.esperar(() => !document.querySelector('#m-campos').disabled);
  await b.avaliar(h => { const original = omni.http.request; omni.http.request = async op => {
    const r = await original(op); if (op.url.endsWith('/config/manutencao') && op.method === 'GET') r.body = JSON.stringify({ alcada_centavos: h, sla: h }); return r; }; }, hostil);
  await b.clicar('#b-manutencao-reler'); await b.esperar(() => document.querySelector('#m-resultado').textContent.includes('inválida'));
  assert.equal(await b.avaliar(() => document.querySelector('#m-campos').disabled), true);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-manutencao img').length), 0);
  prova('dado hostil em nome, telefone, e-mail, observação, aprovação, orçamento, prazo, valor e data permanece texto; configuração inválida bloqueada');

  await b.navegar(origem + '/app/chamados.html?tema=escuro'); await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), id); await abrir(id);
  await b.viewport(390, 844); await capturar('fatia4-14-editar-390-escuro', '#c-aprovacao');
  assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true); await fechar();
  await b.navegar(origem + '/app/prestadores.html?tema=escuro'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  await b.captura('fatia4-15-prestadores-390-escuro'); await b.clicar('#b-novo'); await b.captura('fatia4-16-novo-prestador-390-escuro'); await fechar();
  await b.navegar(origem + '/app/config.html?tema=escuro'); await b.esperar(() => !document.querySelector('#m-campos').disabled); await b.captura('fatia4-17-config-390-escuro');
  for (const tela of ['prestadores', 'config']) for (const modo of ['local', 'fora']) {
    await b.navegar(origem + '/app/' + tela + '.html?modo=' + modo);
    await b.esperar(tela => tela === 'config' ? document.querySelector('#gi-negado').style.display === 'block' : document.querySelector('#b-novo').disabled, tela);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  }
  for (const tela of ['prestadores', 'config']) {
    await b.navegar(origem + '/app/' + tela + '.html?demonstracao=1');
    await b.esperar(tela => tela === 'config' ? document.querySelector('#gi-negado').style.display === 'block' : document.querySelector('#b-novo').disabled, tela);
    assert.equal(await b.avaliar(() => bancada.rede.length), 0); assert.equal(await b.avaliar(() => bancada.chamadas.length), 0); assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  }
  assert.deepEqual(b.erros, []);
  prova('capturas claro/escuro e 390 px; sem portal e demonstração: zero escrita/storage/rede; zero exceções no Chromium');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections();
  await new Promise(resolve => servidor.close(resolve));
}
