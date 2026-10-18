import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
const prova = texto => process.stdout.write('OK ' + texto + '\n');
try {
  b = await abrirChromium();
  await b.navegar(origem + '/app/chamados.html');
  await b.esperar(() => document.querySelectorAll('#gi-corpo [data-editar]').length === 8);
  assert.match(await b.avaliar(() => document.querySelector('#gi-resumo').textContent), /6 chamados abertos/);
  assert.deepEqual(await b.avaliar(() => Array.from(document.querySelectorAll('th'), n => n.textContent)),
    ['O.S.', 'Chamado', 'Imóvel', 'Atendimento', 'Prioridade', 'Prazo', 'Prestador', 'Status', 'Funções']);
  await b.captura('chamados-01-lista');
  await b.preencher('#f-status', 'novo'); await b.preencher('#f-prioridade', 'emergencia'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 1);
  await b.preencher('#f-busca', 'inexistente'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Nenhum chamado'));
  await b.clicar('#b-limpar');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 8);
  prova('lista, resumo, filtros, vazio e colunas do desenho');

  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const valor = s => b.avaliar(s => document.querySelector(s)?.value, s);
  const esperarModal = () => b.esperar(() => !!document.querySelector('#c-titulo'));
  const fechar = () => b.clicar('.gi-modal [data-cancelar]');
  async function novo() {
    await b.clicar('#b-novo'); await esperarModal();
    await b.preencher('#c-cliente', 'Demonstração Um');
    await b.esperar(() => !!document.querySelector('[data-contato="0"]'));
    await b.clicar('[data-contato="0"]');
    await b.esperar(() => document.querySelector('#c-locacao').options.length === 3 && document.querySelectorAll('#c-atendimentos input').length >= 4);
    await b.preencher('#c-locacao', '0');
    await b.preencher('#c-atendente', '1');
    await b.preencher('#c-titulo', 'Conserto sintético F2');
    await b.preencher('#c-descricao', 'Relato digitado que precisa sobreviver às recusas.');
    await b.preencher('#c-disponibilidade', 'Após 18h, somente demonstração');
    await b.preencher('#c-chaves', 'Com o contato sintético');
    await b.preencher('#c-categoria', 'eletrica');
    await b.preencher('#c-prioridade', 'alta');
  }
  async function gravarNovo() {
    await b.clicar('.gi-modal [data-ok]');
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => !document.querySelector('.gi-modal'));
    await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Conserto sintético F2'));
    return b.avaliar(async () => (await GI.chamados({ busca: 'Conserto sintético F2' })).rows[0]);
  }
  await novo();
  const antes = await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length);
  await b.clicar('#c-atendimentos input[value="0"]');
  await b.clicar('#c-carregar-fotos');
  await b.esperar(() => !!document.querySelector('[data-foto]'));
  await b.clicar('[data-foto="0"]');
  await b.captura('chamados-02-novo');
  await b.clicar('.gi-modal [data-ok]');
  assert.match(await texto('#c-confirmacao'), /Casa Demonstração Beta/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), antes);
  await b.captura('chamados-03-confirmacao');
  await b.clicar('#c-voltar');
  assert.equal(await valor('#c-titulo'), 'Conserto sintético F2');
  // Recusa real do simulador: o transporte de teste envia uma categoria inválida uma vez.
  await b.avaliar(() => {
    const original = omni.http.request;
    omni.http.request = op => {
      if (op.method === 'POST' && op.url.endsWith('/chamados')) {
        omni.http.request = original;
        const d = JSON.parse(op.body); d.categoria = 'categoria_invalida';
        return original({ ...op, body: JSON.stringify(d) });
      }
      return original(op);
    };
  });
  await b.clicar('.gi-modal [data-ok]'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('422'));
  assert.equal(await valor('#c-titulo'), 'Conserto sintético F2');
  assert.equal(await valor('#c-descricao'), 'Relato digitado que precisa sobreviver às recusas.');
  assert.equal(await valor('#c-atendente'), '1');
  assert.equal(await b.avaliar(() => document.querySelector('[data-foto]').checked), true);
  await b.captura('chamados-04-422');
  const criado = await gravarNovo();
  assert.equal(criado.locacao_id, 1); assert.equal(criado.solicitante.contato_id, 9901);
  assert.equal(criado.atendimento.chat_id, 8801); assert.equal(criado.atendente.user_id, 9998);
  assert.equal(criado.anexos_total, 1); assert.equal(criado.origem, 'gestao');
  prova('Novo escolhe cliente, imóvel, atendente e atendimento vivo; foto, revisão sem POST e 422 preservando os campos');

  await novo();
  const vinculado = await b.avaliar(() => {
    const label = Array.from(document.querySelectorAll('#c-atendimentos label')).find(l => l.textContent.includes('Já vinculado'));
    return { value: label.querySelector('input').value, chat_id: Number(label.textContent.match(/#(\d+)/)[1]) };
  });
  await b.clicar('#c-atendimentos input[value="' + vinculado.value + '"]');
  const segundo = await gravarNovo();
  assert.equal(segundo.atendimento.chat_id, vinculado.chat_id);
  await novo();
  await b.clicar('#c-atendimentos input[value="manual"]');
  await b.preencher('#c-protocolo', 'DEMO-PROTOCOLO-INFORMADO');
  await b.clicar('.gi-modal [data-ok]');
  assert.match(await texto('#c-confirmacao-texto'), /DEMO-PROTOCOLO-INFORMADO/);
  await b.clicar('#c-voltar');
  const soProtocolo = await gravarNovo();
  assert.equal(soProtocolo.atendimento.chat_id, null);
  assert.equal(soProtocolo.atendimento.protocolo, 'DEMO-PROTOCOLO-INFORMADO');
  await b.avaliar(() => { const original = omni.http.request; omni.http.request = async op => {
    const r = await original(op);
    if (op.method === 'GET' && op.url.includes('/atendimentos/vinculados')) r.body = JSON.stringify({ rows: [
      { chat_id: null, protocolo: 'PROTOCOLO-OUTRO-SINTETICO', canal: 'WhatsApp', chamados: [] },
      { chat_id: null, protocolo: 'PROTOCOLO-DIFERENTE-SINTETICO', canal: 'WhatsApp', chamados: [] }
    ] });
    return r;
  }; });
  await b.clicar('[data-editar="' + soProtocolo.id + '"]'); await esperarModal(); await b.clicar('#c-trocar');
  await b.esperar(() => document.querySelector('#c-atendimentos').textContent.includes('DEMO-PROTOCOLO-INFORMADO'));
  assert.match(await texto('#c-atendimentos'), /DEMO-PROTOCOLO-INFORMADO/);
  await fechar();
  prova('vínculo original sem chat_id é comparado pelo protocolo, mesmo com outros grupos protocolados');
  await novo(); await b.clicar('#c-atendimentos input[value="manual"]');
  await b.preencher('#c-protocolo', 'DEMO-PROTOCOLO-INFORMADO');
  await b.preencher('#c-chat-id', '8877');
  await b.clicar('.gi-modal [data-ok]');
  assert.match(await texto('#c-confirmacao-texto'), /informado, não verificado/);
  await b.captura('chamados-05-protocolo-informado');
  await b.clicar('#c-voltar');
  const manual = await gravarNovo();
  assert.equal(manual.atendimento.chat_id, 8877); assert.equal(manual.atendimento.protocolo, 'DEMO-PROTOCOLO-INFORMADO');
  await novo(); await b.clicar('#c-atendimentos input[value="nenhum"]');
  const semVinculo = await gravarNovo(); assert.equal(semVinculo.atendimento, null);
  prova('Novo com atendimento já vinculado, protocolo e número informados não verificados, ou sem vínculo; protocolo sozinho não inventa chat_id');

  await b.clicar('[data-editar="' + manual.id + '"]'); await esperarModal();
  await b.clicar('#c-trocar'); await b.esperar(() => document.querySelector('#c-atendimentos').textContent.includes('#8877') && document.querySelector('#c-atendimentos').textContent.includes('#8801'));
  await b.clicar('#c-atendimentos input[value="nenhum"]');
  const originalManual = await b.avaliar(() => Array.from(document.querySelectorAll('#c-atendimentos label')).find(l => l.textContent.includes('#8877')).querySelector('input').value);
  await b.clicar('#c-atendimentos input[value="' + originalManual + '"]');
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.equal(await b.avaliar(async id => (await GI.chamadosObter(id)).chamado.atendimento.chat_id, manual.id), 8877);
  prova('Editar permite voltar ao vínculo manual original depois de selecionar não vincular');

  await b.clicar('[data-editar="' + criado.id + '"]'); await esperarModal();
  assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-trilha li').length), 7);
  // A Fatia 4 preenche estas seções: elas existem e têm conteúdo (a prova detalhada está em fatia4.testar.mjs).
  assert.equal(await b.avaliar(() => ['orcamentos', 'aprovacao', 'prestador', 'visita'].every(id => !!document.querySelector('#c-' + id) && document.querySelector('#c-' + id).childNodes.length > 0)), true);
  assert.match(await texto('#c-historico'), /Chamado aberto/);
  await b.clicar('#c-abrir-atendimento');
  assert.equal(await b.avaliar(() => bancada.eventos.at(-1).dados.id), 8801);
  await b.clicar('#c-trocar');
  await b.esperar(() => document.querySelectorAll('#c-atendimentos input').length >= 4);
  await b.clicar('#c-atendimentos input[value="nenhum"]');
  await b.preencher('#c-titulo', 'Conserto sintético F2 editado');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  let lido = await b.avaliar(async id => await GI.chamadosObter(id), criado.id);
  assert.equal(lido.chamado.atendimento, null);
  assert.ok(lido.eventos.some(ev => ev.tipo === 'vinculou_atendimento'));
  await b.clicar('[data-editar="' + criado.id + '"]'); await esperarModal();
  await b.clicar('#c-trocar'); await b.esperar(() => document.querySelectorAll('#c-atendimentos input').length >= 4);
  await b.clicar('#c-atendimentos input[value="0"]'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  await b.clicar('[data-editar="' + criado.id + '"]'); await esperarModal();
  await b.preencher('#c-nota', 'Nota interna sintética'); await b.clicar('#c-salvar-nota');
  await b.esperar(() => document.querySelector('#c-historico').textContent.includes('Nota interna sintética'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await b.preencher('#c-nota', 'Aviso sintético confirmado'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-historico').textContent.includes('Aviso sintético confirmado'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
  lido = await b.avaliar(async id => await GI.chamadosObter(id), criado.id);
  assert.ok(lido.eventos.some(ev => ev.texto === 'Aviso sintético confirmado' && ev.notificou_cliente));
  await b.avaliar(() => { bancada.recusarEnvio = true; });
  await b.preencher('#c-nota', 'Nota que sobrevive ao forbidden'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('24 horas'));
  assert.equal(await valor('#c-nota'), 'Nota que sobrevive ao forbidden');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
  await b.captura('chamados-06-nota-forbidden');
  await b.clicar('#c-voltar'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota');
  await b.esperar(() => document.querySelector('#c-historico').textContent.includes('Nota que sobrevive ao forbidden'));
  lido = await b.avaliar(async id => await GI.chamadosObter(id), criado.id);
  assert.ok(lido.eventos.some(ev => ev.texto === 'Nota que sobrevive ao forbidden' && !ev.notificou_cliente));
  await b.captura('chamados-07-editar');
  prova('Editar com trilha, abrir e trocar atendimento, histórico, nota interna e aviso confirmado; forbidden mantém a nota para salvar internamente');

  // Um envio aceito não deve se repetir se o registro da nota falhar no portal.
  await b.avaliar(() => {
    bancada.recusarEnvio = false;
    const request = omni.http.request;
    omni.http.request = op => {
      if (op.method === 'POST' && op.url.endsWith('/notas')) {
        omni.http.request = request;
        return Promise.resolve({ status: 503, body: JSON.stringify({ erro: 'nota_indisponivel' }) });
      }
      return request(op);
    };
  });
  await b.preencher('#c-nota', 'Aviso aceito sem duplicar'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('503'));
  assert.equal(await valor('#c-nota'), 'Aviso aceito sem duplicar');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 2);
  await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-historico').textContent.includes('Aviso aceito sem duplicar'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 2);
  prova('aviso já enviado não duplica quando o registro da nota falha e é repetido');

  await b.preencher('#c-status', 'concluido'); await b.clicar('#c-mudar-status');
  await b.clicar('#c-confirmar-acao');
  await b.esperar(() => !!document.querySelector('#c-reabrir'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-dados').disabled), true,
    JSON.stringify(await b.avaliar(() => ({ modais: document.querySelectorAll('.gi-modal').length, campo: document.querySelector('#c-dados').outerHTML.slice(0, 110) }))));
  await b.clicar('#c-reabrir'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-status')?.value === 'triagem');
  await fechar();
  await b.esperar(() => !document.querySelector('.gi-modal'));
  await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), criado.id);
  const indice = await b.avaliar(id => document.querySelector('[data-editar="' + id + '"]').closest('tr').querySelector('[data-cancelar-chamado]').dataset.cancelarChamado, criado.id);
  await b.clicar('[data-cancelar-chamado="' + indice + '"]');
  await b.preencher('#c-cancelamento', 'Cancelamento sintético F2');
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
  lido = await b.avaliar(async id => await GI.chamadosObter(id), criado.id);
  assert.equal(lido.chamado.status, 'cancelado'); assert.equal(lido.chamado.motivo_cancelamento, 'Cancelamento sintético F2');
  assert.ok(lido.eventos.some(ev => ev.tipo === 'status' && ev.detalhe.para === 'triagem'));
  prova('concluir, reabrir exclusivamente em Triagem e cancelar com motivo preservam histórico');

  // 409 real: outra sessão encerra a locação depois da seleção no formulário.
  await novo(); await b.preencher('#c-locacao', '1');
  await b.avaliar(async () => { await GI.locacoesEncerrar(3, 'Encerramento concorrente sintético'); });
  await b.clicar('.gi-modal [data-ok]'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('409'));
  assert.equal(await valor('#c-titulo'), 'Conserto sintético F2'); assert.equal(await valor('#c-locacao'), '1');
  await b.captura('chamados-08-409');
  await b.preencher('#c-locacao', '0');
  await gravarNovo();
  prova('409 por locação encerrada preserva o digitado e permite escolher outro imóvel');

  await b.clicar('[data-editar="' + semVinculo.id + '"]'); await esperarModal();
  await b.preencher('#c-status', 'aprovacao'); await b.clicar('#c-mudar-status'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('422'));
  assert.match(await texto('#c-mensagem'), /orçamento/);
  await b.clicar('#c-voltar');
  await b.preencher('#c-titulo', 'Edição preservada após conflito');
  await b.preencher('#c-status', 'triagem'); await b.clicar('#c-mudar-status');
  assert.match(await texto('#c-mensagem'), /Atualize os dados digitados/);
  await b.avaliar(async id => await GI.chamadosStatus(id, 'concluido'), semVinculo.id);
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('409'));
  assert.equal(await valor('#c-titulo'), 'Edição preservada após conflito');
  assert.equal(await b.avaliar(() => document.querySelector('#c-dados').disabled), false);
  await fechar();
  prova('Editar exibe trava 422 de status, mantém o digitado no 409 concorrente e exige salvar alterações antes de trocar status');

  // Dados hostis atravessam o portal, a lista, o seletor e o modal.
  const hostil = '<img src=x onerror="window.executouHostil=1">';
  const hostilId = await b.avaliar(async h => {
    const { locacao } = await GI.locacoesCriar({ imovel: { titulo: h, endereco: h }, contrato_numero: h,
      contatos: [{ contato_id: 9901, papel: 'locatario', nome: h, telefone: h }] });
    const { chamado } = await GI.chamadosCriar({ locacao_id: locacao.id, titulo: h, descricao: h, categoria: 'outros',
      solicitante: { contato_id: 9901, nome: h, telefone: h }, atendente: { user_id: 9999, nome: h },
      atendimento: { chat_id: 8888, protocolo: h, canal: h, fila: h }, acesso: { disponibilidade: h, chaves: h } });
    await GI.chamadosNota(chamado.id, { texto: h });
    const request = omni.http.request;
    omni.http.request = async op => {
      const r = await request(op);
      if (op.method !== 'POST' && op.url.includes('/chamados')) {
        const d = JSON.parse(r.body);
        for (const c of d.rows || [d.chamado].filter(Boolean)) {
          c.criado_em = h; c.atualizado_em = h; c.sla = { prazo_resposta_em: h, prazo_solucao_em: h };
        }
        r.body = JSON.stringify(d);
      }
      return r;
    };
    const search = omni.contacts.search;
    omni.contacts.search = async t => (await search(t)).map(c => ({ ...c, name: h, phone: h }));
    return chamado.id;
  }, hostil);
  await b.clicar('#b-limpar');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo img').length), 0);
  await b.clicar('[data-editar="' + hostilId + '"]'); await esperarModal();
  await b.clicar('#c-trocar'); await b.esperar(() => document.querySelector('#c-atendimentos').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-modal img').length), 0);
  assert.equal(await valor('#c-titulo'), hostil); assert.equal(await valor('#c-descricao'), hostil);
  await b.captura('chamados-09-hostil'); await fechar();
  await b.clicar('#b-novo'); await esperarModal(); await b.preencher('#c-cliente', 'Demonstração');
  await b.esperar(() => document.querySelector('#c-contatos').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-contatos img').length), 0);
  assert.equal(await b.avaliar(() => !!window.executouHostil), false); await fechar();
  prova('dado hostil em título, nome, telefone, contrato, data, prazo e protocolo permanece texto; nada executa');

  await b.avaliar(async () => {
    for (let i = 0; i < 27; i++) await GI.chamadosCriar({ locacao_id: 1, titulo: 'Página sintética ' + i, categoria: 'outros', solicitante: { nome: 'Pessoa Demonstração', contato_id: 9901 } });
  });
  await b.preencher('#f-busca', 'Página sintética'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 25);
  await b.clicar('#b-proxima'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 2);
  assert.equal(await texto('#gi-pagina'), '2'); await b.captura('chamados-10-paginacao');
  await b.clicar('#b-anterior'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 25);
  await b.preencher('#f-porpagina', '50'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 27);
  assert.equal(await b.avaliar(() => document.querySelector('#b-proxima').disabled), true);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  prova('paginação real com 27 resultados, anterior/próxima e alteração do tamanho da página');

  await b.navegar(origem + '/app/chamados.html?tema=escuro');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 25);
  await b.captura('chamados-11-lista-escuro');
  await b.viewport(390, 844); await b.captura('chamados-12-lista-390-escuro');
  await b.clicar('#b-novo'); await esperarModal(); await b.captura('chamados-13-novo-390-escuro');
  assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true);
  await fechar();
  const primeiroId = await b.avaliar(() => document.querySelector('[data-editar]').dataset.editar);
  await b.clicar('[data-editar="' + primeiroId + '"]'); await esperarModal(); await b.captura('chamados-14-editar-390-escuro');
  assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true);
  await fechar();
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  await b.clicar('#b-novo'); await esperarModal(); await b.captura('chamados-15-novo-390-claro'); await fechar();
  await b.clicar('[data-editar="' + primeiroId + '"]'); await esperarModal(); await b.captura('chamados-16-editar-390-claro'); await fechar();
  prova('capturas de lista, Novo e Editar em 390 px e tema escuro; modais sem rolagem horizontal');

  for (const modo of ['local', 'fora']) {
    await b.navegar(origem + '/app/chamados.html?modo=' + modo);
    await b.esperar(() => document.querySelector('#b-novo').disabled);
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
    await b.captura('chamados-17-sem-portal-' + modo);
  }
  await b.navegar(origem + '/app/chamados.html?demonstracao=1');
  await b.esperar(() => document.querySelector('#b-novo').disabled);
  assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
  assert.equal(await b.avaliar(() => bancada.rede.length), 0);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  assert.deepEqual(b.erros, []);
  prova('sem portal e portal indisponível: ações bloqueadas, zero POST, zero storage; demonstração sem rede; zero exceções no navegador');
} finally {
  if (b) await b.fechar();
  await new Promise(resolve => servidor.close(resolve));
}
