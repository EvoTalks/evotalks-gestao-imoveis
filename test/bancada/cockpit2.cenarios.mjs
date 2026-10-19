import assert from 'node:assert/strict';

export async function testarCockpit2(b, base) {
  const pronto = () => b.esperar(() => !!document.querySelector('[data-chamado]') && !!document.querySelector('[data-resumo]'));
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const card = '[data-chamado="0"]';
  const campo = k => card + ' [data-rapida="' + k + '"]';
  const salvo = k => b.esperar(k => document.querySelector('[data-chamado="0"] [data-salvo="' + k + '"]')?.textContent === '✓ salvo' && !document.querySelector('[data-chamado="0"] [data-rapida="' + k + '"]').disabled, k);
  const prova = t => process.stdout.write('OK F12 ' + t + '\n');
  await b.navegar(base + '?escrita=1'); await pronto();
  assert.match(await texto('#cp-idade'), /atualizado há 0 min/);
  assert.match(await texto(card + ' summary'), /Este atendimento/);
  await b.clicar('[data-resumo="aguardando"]');
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length), 1);
  assert.match(await texto(card + ' summary'), /Aprovação/);
  await b.preencher(campo('status'), 'agendado');
  await b.esperar(() => document.querySelector('[data-salvo="status"]').textContent.includes('Gestão → Aprovação'));
  assert.equal(await b.avaliar(() => document.querySelector('[data-rapida="status"]').value), 'aprovacao');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').classList.contains('gi-recado--erro')), true, 'aprovação pendente aparece como erro, mesmo contendo seta');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').getAttribute('role')), 'alert');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').classList.contains('gi-recado--sucesso')), false);
  await b.clicar('[data-resumo="aguardando"]');
  await b.clicar('[data-filtro="atrasados"]'); assert.ok(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length > 0));
  await b.clicar('[data-filtro="todos"]');
  await b.preencher('#cp-busca', 'OS-1001'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length), 1);
  await b.preencher('#cp-busca', 'não existe'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length), 0);
  await b.preencher('#cp-busca', '');
  prova('resumo clicável, toggle, chips, busca por título/número e recusa de aprovação com rollback');

  for (const perfil of ['agente', 'supervisor', 'admin']) {
    await b.navegar(base + '?escrita=1&perfil=' + perfil); await pronto();
    await b.preencher('#cp-busca', 'OS-1001');
    await b.esperar(() => !document.querySelector('[data-rapida="atendente"]').disabled);
    const n = await b.avaliar(() => bancada.chamadas.length);
    await b.preencher(campo('status'), 'triagem'); await salvo('status');
    await b.preencher(campo('prioridade'), 'normal'); await salvo('prioridade');
    await b.preencher(campo('atendente'), '9998'); await salvo('atendente');
    await b.preencher(campo('quem_paga'), 'inquilino'); await salvo('quem_paga');
    await b.preencher(campo('visita'), '2026-12-03T14:00'); await salvo('visita');
    const rs = await b.avaliar(n => bancada.chamadas.slice(n), n);
    assert.equal(rs.length, 5, 'uma requisição por alteração, sem reler a lista');
    assert.ok(rs.every(r => r.method === 'POST'));
    const d = await b.avaliar(async () => (await GI.chamadosObter(1)).chamado);
    assert.equal(d.status, 'triagem'); assert.equal(d.prioridade, 'normal'); assert.equal(d.atendente.user_id, 9998); assert.equal(d.quem_paga, 'inquilino'); assert.ok(d.visita.inicio);
    const resumoAntes = await texto('#cp-resumo');
    await b.preencher(campo('status'), 'cancelado');
    assert.equal(await b.avaliar(() => document.querySelector('[data-cancelar-caixa]').hidden), false);
    await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(await b.avaliar(() => document.querySelector('[data-rapida="status"]').value), 'triagem');
    await b.preencher(campo('status'), 'cancelado'); await b.preencher(card + ' [data-cancelar-motivo]', 'Pedido sintético F12'); if (perfil === 'agente') await b.avaliar(() => document.querySelector('[data-cancelar-motivo]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    else await b.clicar(card + ' [data-cancelar-confirmar]'); await salvo('status');
    assert.notEqual(await texto('#cp-resumo'), resumoAntes);
    assert.equal(await b.avaliar(async () => (await GI.chamadosObter(1)).chamado.motivo_cancelamento), 'Pedido sintético F12');
    await b.preencher(campo('status'), 'triagem'); await salvo('status');
  }
  prova('três perfis editam status/prioridade/atendente/pagador/visita; 1 POST por alteração, cancelamento e Esc, resumo atualizado');

  // Recusa de gravação genérica e duas operações concorrentes: transporte serial.
  await b.avaliar(() => {
    const original = omni.http.request; let ativas = 0; window.f12Max = 0;
    omni.http.request = async op => {
      if (op.method !== 'POST') return original(op);
      ativas++; f12Max = Math.max(f12Max, ativas);
      await new Promise(r => setTimeout(r, 30));
      try { if (JSON.parse(op.body).prioridade === 'alta') return { status: 422, body: JSON.stringify({ erro: 'dados_invalidos', campos: { prioridade: 'Prioridade recusada sintética.' } }) }; return await original(op); }
      finally { ativas--; }
    };
  });
  await b.preencher(campo('prioridade'), 'alta');
  await b.esperar(() => document.querySelector('[data-salvo="prioridade"]').textContent.includes('recusada'));
  assert.equal(await b.avaliar(() => document.querySelector('[data-rapida="prioridade"]').value), 'normal');
  await b.avaliar(async () => { await Promise.all([GI.chamadosAtualizar(1, { quem_paga: 'inquilino' }), GI.chamadosAtualizar(1, { prioridade: 'normal' })]); });
  assert.equal(await b.avaliar(() => f12Max), 1);
  prova('recusa restaura valor; gravações simultâneas são serializadas');

  await b.avaliar(() => { document.execCommand = function () { window.f12Copia = document.activeElement.value; return true; }; });
  await b.clicar(card + ' [data-resumo-copiar]');
  const copiado = await b.avaliar(() => f12Copia);
  for (const t of ['O.S.: OS-1001', 'Título:', 'Imóvel:', 'Status:', 'Prazo:', 'Prestador:', 'Valor:']) assert.ok(copiado.includes(t));
  assert.doesNotMatch(copiado, /\*\*|^#/m);
  await b.clicar(card + ' [data-aviso]');
  await b.preencher('[data-aviso-texto]', 'Aviso editado sintético F12');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await b.clicar('[data-aviso-form] button[type=submit]');
  await b.esperar(() => document.querySelector('[data-acao]').textContent.includes('Cliente avisado'));
  assert.deepEqual(await b.avaliar(() => bancada.mensagens.at(-1)), { chatId: 8801, payload: { text: 'Aviso editado sintético F12' } });
  const nota = await b.avaliar(async () => (await GI.chamadosObter(1)).eventos.at(-1)); assert.equal(nota.texto, 'Aviso editado sintético F12'); assert.equal(nota.notificou_cliente, true);
  await b.clicar(card + ' [data-aviso]'); await b.preencher('[data-aviso-texto]', 'Aviso sintético com retry da nota F12');
  await b.avaliar(() => { const http = omni.http.request; let falhar = true; omni.http.request = op => { if (falhar && op.url.endsWith('/notas')) { falhar = false; return Promise.resolve({ status: 503, body: '{"erro":"portal_indisponivel"}' }); } return http(op); }; });
  await b.clicar('[data-aviso-form] button[type=submit]'); await b.esperar(() => document.querySelector('[data-aviso-recado]').textContent.includes('Aviso enviado'));
  const envios = await b.avaliar(() => bancada.mensagens.length);
  await b.clicar('[data-aviso-form] button[type=submit]'); await b.esperar(() => document.querySelector('[data-acao]').textContent.includes('Cliente avisado'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), envios, 'retry da nota não duplica o aviso');

  await b.clicar(card + ' [data-aviso]'); await b.avaliar(() => { bancada.recusarEnvio = true; });
  await b.clicar('[data-aviso-form] button[type=submit]'); await b.esperar(() => document.querySelector('[data-aviso-recado]').textContent.includes('24 h fechou'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 2);
  await b.avaliar(() => { bancada.recusarEnvio = false; omni.chats.get = async () => ({ id: 8801, contactId: 9901, status: 'closed' }); });
  await b.clicar('[data-aviso-form] button[type=submit]'); await b.esperar(() => document.querySelector('[data-aviso-recado]').textContent.includes('não está mais aberta'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 2);
  prova('copiar resumo puro via execCommand; aviso editável confirmado registra nota; janela e chat encerrado impedem envio');

  await b.navegar(base + '?escrita=1&chat=8805'); await pronto();
  await b.preencher('#cp-busca', 'OS-1001');
  await b.esperar(() => !document.querySelector('[data-rapida="atendente"]').disabled);
  const vinculoAntes = await b.avaliar(() => bancada.chamadas.length);
  await b.clicar(card + ' [data-vincular]');
  await b.esperar(() => document.querySelector('[data-acao]').textContent.includes('Este atendimento'));
  assert.equal(await b.avaliar(n => bancada.chamadas.length - n, vinculoAntes), 1);
  assert.match(await texto(card + ' summary'), /Este atendimento/);
  assert.equal(await b.avaliar(async () => (await GI.chamadosObter(1)).chamado.atendimento.chat_id), 8805);
  await b.clicar('#cp-tab-imovel');
  assert.match(await texto('#cp-conteudo'), /LOCATÁRIO.*PROPRIETÁRIO.*FIADOR/);
  await b.avaliar(() => { document.execCommand = function () { window.f12Copia = document.activeElement.value; return true; }; });
  await b.clicar('[data-copia-texto]'); assert.match(await b.avaliar(() => f12Copia), /^0+\d*$/);
  await b.clicar('#cp-abrir-imovel'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', '0');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-mais-detalhes').open), false);
  await b.clicar('#cp-ultima'); await b.esperar(() => document.querySelector('#cp-descricao').value.includes('Relato sintético'));
  assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo').value), '');
  await b.clicar('[data-categoria="eletrica"]'); assert.match(await b.avaliar(() => document.querySelector('#cp-titulo').placeholder), /Elétrica/);
  await b.avaliar(() => { omni.chats.getMessages = async () => []; }); await b.clicar('#cp-ultima'); await b.esperar(() => document.querySelector('#cp-ultima-recado').textContent.includes('Nenhuma mensagem'));
  await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  assert.ok(await b.avaliar(() => !!document.querySelector('#cp-busca')));
  prova('vínculo em 1 POST, pessoas e copiar telefone, novo pela residência, detalhes recolhidos, última mensagem e sugestão sem título automático');

  // Dados de volume já lidos do portal: nenhum fixture real ou token.
  await b.navegar(base + '?escrita=1&persistir=1'); await pronto();
  await b.avaliar(async () => {
    for (let i = 0; i < 12; i++) await GI.chamadosCriar({ locacao_id: 1, titulo: 'Volume Sintético F12 ' + i, categoria: 'outros', solicitante: { contato_id: 9901, nome: 'Cliente Sintético' } });
  });
  await b.clicar('#cp-atualizar'); await b.esperar(() => !!document.querySelector('#cp-mais'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length), 10);
  await b.clicar('#cp-mais'); assert.ok(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length > 10));
  await b.esperar(async () => !!(await omni.storage.get('gi-cockpit-snapshots-v1'))?.rows.length);
  prova('lista compacta mostra mais 10 sem consultar o portal');

  const antesDaFalha = await b.avaliar(() => sessionStorage.getItem('gi-cockpit-snapshots-v1'));
  await b.navegar(base + '?escrita=1&persistir=1&cenario=snapshot-lento'); await pronto();
  assert.match(await texto('#cp-idade'), /atualizado há/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(r => r.caminho.includes('/contatos/')).length), 0, 'snapshot fresco evita rede na reabertura');
  assert.equal(await b.avaliar(() => sessionStorage.getItem('gi-cockpit-snapshots-v1')), antesDaFalha);
  await b.avaliar(() => { cenario.tipo = ''; });
  await b.esperar(() => !document.querySelector('[data-rapida="atendente"]').disabled);
  const idSnapshot = await b.avaliar(() => JSON.parse(sessionStorage.getItem('gi-cockpit-snapshots-v1')).rows[0].contatoId);
  await b.preencher(campo('quem_paga'), 'inquilino'); await salvo('quem_paga');
  assert.equal(await b.avaliar(id => JSON.parse(sessionStorage.getItem('gi-cockpit-snapshots-v1')).rows.some(s => s.contatoId === id), idSnapshot), false);
  await b.clicar('#cp-atualizar'); await pronto();
  await b.esperar(async () => !!(await omni.storage.get('gi-cockpit-snapshots-v1'))?.rows.length);
  await b.avaliar(async () => { const s = await omni.storage.get('gi-cockpit-snapshots-v1'); s.rows.forEach(r => r.em = Date.now() - 600001); await omni.storage.set('gi-cockpit-snapshots-v1', s); });
  await b.navegar(base + '?escrita=1&persistir=1&cenario=snapshot-lento'); await b.esperar(() => !!cenario.liberar);
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-chamado]').length), 0, 'snapshot vencido não pinta');
  await b.avaliar(() => { cenario.tipo = ''; cenario.liberar(); }); await pronto();
  await b.navegar(base + '?escrita=1&semstorage=1'); await pronto();
  await b.preencher(campo('prioridade'), 'normal'); await salvo('prioridade');
  const antesEnter = await b.avaliar(() => bancada.chamadas.length);
  await b.avaliar(() => { const v = document.querySelector('[data-rapida="visita"]'); v.value = '2026-12-08T13:00'; v.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await salvo('visita'); assert.equal(await b.avaliar(n => bancada.chamadas.length - n, antesEnter), 1);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  prova('snapshot fresco evita rede, expira, invalida na gravação e falha de storage não impede edição');


  for (const tema of ['claro', 'escuro']) for (const width of [260, 300, 334]) {
    await b.viewport(width, 1200); await b.navegar(base + '?escrita=1&tema=' + tema); await pronto();
    assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
    await b.captura('cockpit2-' + width + '-' + tema + '-edicao');
    await b.clicar(card + ' [data-aviso]');
    assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
    await b.captura('cockpit2-' + width + '-' + tema + '-aviso');
    await b.preencher(campo('status'), 'cancelado');
    await b.captura('cockpit2-' + width + '-' + tema + '-cancelamento');
  }

  await b.navegar(base + '?escrita=1&demonstracao=1'); await pronto();
  await b.preencher(campo('prioridade'), 'normal'); await salvo('prioridade');
  await b.clicar(card + ' [data-aviso]'); await b.clicar('[data-aviso-form] button[type=submit]');
  await b.esperar(() => document.querySelector('[data-acao]').textContent.includes('Cliente avisado'));
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', '0'); await b.clicar('#cp-ultima');
  await b.esperar(() => document.querySelector('#cp-descricao').value.includes('sintético'));
  assert.equal(await b.avaliar(() => bancada.chamadas.length + bancada.rede.length + bancada.gravacoesStorage + cenario.tentativasRede), 0);
  assert.deepEqual(b.erros, []);
  prova('capturas dos estados novos em 260/300/334px claro e escuro, sem overflow e sem exceções');
}
