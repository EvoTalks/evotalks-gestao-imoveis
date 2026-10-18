import assert from 'node:assert/strict';
export async function testarSimplificacao(b, origem) {
  const prova = t => process.stdout.write('OK F6: ' + t + '\n');
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const fechar = async () => { await b.clicar('.gi-modal [data-cancelar]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  const abrir = async id => {
    await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), id);
    await b.clicar('[data-editar="' + id + '"]');
    await b.esperar(() => !!document.querySelector('#c-orc-nome'));
  };
  const salvar = async () => { await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  async function novo(nome = 'Demonstração Um') {
    await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#c-titulo'));
    assert.match(await texto('#c-atendimentos'), /Escolha o cliente para consultar os atendimentos/);
    await b.preencher('#c-cliente', nome); await b.esperar(() => !!document.querySelector('[data-contato="0"]'));
    await b.clicar('[data-contato="0"]');
    await b.esperar(() => !document.querySelector('#c-locacao').disabled && !document.querySelector('#c-atendimentos').textContent.includes('Buscando'));
    await b.preencher('#c-locacao', '0'); await b.preencher('#c-titulo', 'Simplificação sintética');
  }
  await b.navegar(origem + '/app/chamados.html');
  await b.esperar(() => document.querySelectorAll('[data-editar]').length === 8);
  assert.match(await texto('#gi-resumo'), /6 chamados abertos/);
  assert.deepEqual(await b.avaliar(() => Array.from(document.querySelectorAll('th'), n => n.textContent)),
    ['O.S.', 'Chamado', 'Imóvel', 'Atendimento', 'Prioridade', 'Prazo', 'Prestador', 'Status', 'Funções']);
  await b.preencher('#f-busca', 'inexistente'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Nenhum chamado'));
  await b.clicar('#b-limpar'); await b.esperar(() => document.querySelectorAll('[data-editar]').length === 8);
  await novo();
  assert.equal(await b.avaliar(() => document.querySelector('#c-mais')?.open), false);
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal [data-ok]').textContent), 'Salvar');
  assert.equal(await b.avaliar(() => document.querySelector('#c-vinculo').textContent.includes('#8801')), true);
  await b.clicar('#c-mais summary'); assert.equal(await b.avaliar(() => document.querySelector('#c-mais').open), true);
  await b.preencher('#c-atendente', '1'); await b.preencher('#c-categoria', 'eletrica');
  await b.preencher('#c-disponibilidade', 'Após 18h'); await b.preencher('#c-chaves', 'Com o contato sintético');
  // Um POST só, sem revisão redundante. 422 mantém todos os dados.
  await b.avaliar(() => {
    const request = omni.http.request;
    omni.http.request = op => {
      if (op.method === 'POST' && op.url.endsWith('/chamados')) { omni.http.request = request; return request({ ...op, body: JSON.stringify({ ...JSON.parse(op.body), categoria: 'invalida' }) }); }
      return request(op);
    };
  });
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('422'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-titulo').value), 'Simplificação sintética');
  await salvar();
  const criado = await b.avaliar(async () => (await GI.chamados({ busca: 'Simplificação sintética' })).rows[0]);
  assert.equal(criado.atendimento.chat_id, 8801); assert.equal(criado.atendente.user_id, 9998); assert.equal(criado.categoria, 'eletrica');
  await abrir(criado.id);
  assert.equal(await b.avaliar(() => document.querySelector('#c-mudar-status') || document.querySelector('.gi-trilha')), null);
  await b.preencher('#c-titulo', 'Simplificação editada'); await b.preencher('#c-status', 'triagem'); await salvar();
  await b.esperar(id => document.querySelector('[data-editar="' + id + '"]').closest('tr').cells[7].textContent.includes('Triagem'), criado.id);
  let d = await b.avaliar(async id => GI.chamadosObter(id), criado.id);
  assert.equal(d.chamado.titulo, 'Simplificação editada'); assert.equal(d.chamado.status, 'triagem');
  const posts = await b.avaliar(id => bancada.chamadas.filter(r => r.method === 'POST' && r.caminho.startsWith('/api/ext/chamados/' + id)).map(r => r.caminho), criado.id);
  assert.ok(posts.indexOf('/api/ext/chamados/' + criado.id) < posts.indexOf('/api/ext/chamados/' + criado.id + '/status'));
  await abrir(criado.id); await b.preencher('#c-titulo', 'Dados salvos apesar do status'); await b.preencher('#c-status', 'aprovacao');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Os outros dados foram salvos'));
  assert.match(await texto('#c-mensagem'), /orçamento/);
  await b.esperar(id => document.querySelector('[data-editar="' + id + '"]').closest('tr').textContent.includes('Dados salvos apesar do status'), criado.id);
  assert.equal((await b.avaliar(async id => GI.chamadosObter(id), criado.id)).chamado.status, 'triagem');
  await fechar();
  await novo(); await b.preencher('#c-locacao', '1');
  await b.avaliar(async () => GI.locacoesEncerrar(3, 'Encerramento concorrente sintético'));
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('409'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-locacao').value), '1');
  assert.equal(await b.avaliar(() => document.querySelector('#c-titulo').value), 'Simplificação sintética'); await fechar();
  await abrir(criado.id); await b.preencher('#c-titulo', 'Edição preservada no conflito');
  await b.avaliar(async id => GI.chamadosStatus(id, 'concluido'), criado.id);
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('409'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-titulo').value), 'Edição preservada no conflito');
  assert.equal(await b.avaliar(() => document.querySelector('#c-dados').disabled), false);
  await b.avaliar(async id => GI.chamadosStatus(id, 'triagem'), criado.id); await fechar();
  prova('itens 2, 4, 9–11: Salvar único, dados antes do status, recusa parcial mantém modal e lista atualizada, Mais opções fechado');

  await abrir(criado.id); await b.clicar('#c-tirar-vinculo');
  await b.esperar(() => document.querySelector('#c-vinculo').textContent === 'Nenhum atendimento vinculado' && !document.querySelector('#c-tirar-vinculo').disabled);
  assert.equal(await b.avaliar(() => document.querySelector('#c-avisar').disabled), true);
  assert.match(await texto('#c-aviso-dica'), /Escolha o atendimento acima/);
  await b.clicar('#c-trocar'); await b.esperar(() => !!document.querySelector('[data-atendimento="0"]'));
  await b.clicar('[data-atendimento="0"]');
  await b.esperar(() => !document.querySelector('#c-avisar').disabled && !document.querySelector('#c-tirar-vinculo').disabled);
  assert.equal((await b.avaliar(async id => GI.chamadosObter(id), criado.id)).chamado.atendimento.chat_id, 8801);
  await b.preencher('#c-nota', 'Nota interna sintética'); await b.clicar('#c-salvar-nota');
  await b.esperar(() => document.querySelector('#c-historico').textContent.includes('Nota interna sintética') && !document.querySelector('#c-salvar-nota').disabled);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  const aviso = 'Aviso exato sintético <img src=x onerror="window.hostil=1">';
  await b.preencher('#c-nota', aviso); await b.clicar('#c-avisar');
  assert.equal(await texto('#c-salvar-nota'), 'Enviar ao cliente'); await b.clicar('#c-salvar-nota');
  assert.ok((await texto('#c-confirmacao-texto')).includes(aviso)); assert.match(await texto('#c-confirmacao-texto'), /DEMO-P8801/);
  assert.equal(await texto('#c-confirmar-acao'), 'Enviar');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await b.avaliar(() => { bancada.semConfirmarEnvio = true; }); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Envio não confirmado'));
  d = await b.avaliar(async id => GI.chamadosObter(id), criado.id); assert.ok(!d.eventos.some(ev => ev.texto === aviso));
  await b.avaliar(() => { bancada.semConfirmarEnvio = false; }); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-nota').value === '' && !document.querySelector('#c-salvar-nota').disabled);
  assert.deepEqual(await b.avaliar(() => bancada.mensagens[0]), { chatId: 8801, payload: { text: aviso } });
  d = await b.avaliar(async id => GI.chamadosObter(id), criado.id); assert.ok(d.eventos.some(ev => ev.texto === aviso && ev.notificou_cliente));
  await b.preencher('#c-nota', 'Nota que sobrevive ao forbidden'); await b.clicar('#c-avisar');
  await b.avaliar(() => { bancada.recusarEnvio = true; }); await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('24 horas'));
  await b.clicar('#c-voltar'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota');
  await b.esperar(() => document.querySelector('#c-nota').value === '' && !document.querySelector('#c-salvar-nota').disabled);
  assert.ok((await b.avaliar(async id => GI.chamadosObter(id), criado.id)).eventos.some(ev => (ev.texto || '').includes('sobrevive') && !ev.notificou_cliente));
  await b.avaliar(() => {
    bancada.recusarEnvio = false; const request = omni.http.request;
    omni.http.request = op => { if (op.method === 'POST' && op.url.endsWith('/notas')) { omni.http.request = request; return Promise.resolve({ status: 503, body: '{"erro":"indisponivel"}' }); } return request(op); };
  });
  await b.preencher('#c-nota', 'Aviso sem duplicar'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('503'));
  const envios = await b.avaliar(() => bancada.mensagens.length); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-nota').value === '' && !document.querySelector('#c-salvar-nota').disabled); assert.equal(await b.avaliar(() => bancada.mensagens.length), envios);
  // Chat fecha entre o check e o envio: revalida e não envia nem registra.
  await b.avaliar(() => { const get = omni.chats.get; bancada.getOriginal = get; omni.chats.get = async id => ({ ...(await get(id)), status: 'closed' }); });
  await b.preencher('#c-nota', 'Chat encerrou'); await b.clicar('#c-avisar'); await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
  await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('não está aberto'));
  assert.equal(await b.avaliar(() => bancada.mensagens.length), envios);
  await b.avaliar(() => { omni.chats.get = bancada.getOriginal; });
  await fechar();
  prova('itens 5 e 8: vínculo imediato, aviso habilitado apenas com chat aberto, texto/chat exatos, sent:false, forbidden e retry sem duplicação');

  await abrir(criado.id);
  await b.preencher('#c-orc-nome', 'João Teste Sintético'); await b.preencher('#c-orc-observacao', 'Inclui mão de obra. Prazo 3 dias. Condições livres.');
  await b.clicar('#c-salvar-orcamento'); await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('sem valor'));
  d = await b.avaliar(async id => GI.chamadosObter(id), criado.id);
  const primeiro = d.orcamentos[0]; assert.ok(primeiro.prestador_id); assert.equal(primeiro.valor_centavos, null); assert.match(primeiro.observacao, /Condições livres/);
  await b.preencher('#c-orc-nome', 'joao teste'); await b.esperar(() => document.querySelectorAll('#c-prestador-sugestoes option').length === 1);
  assert.equal(await b.avaliar(() => document.querySelector('#c-prestador-sugestoes option').value), 'João Teste Sintético');
  await b.preencher('#c-orc-nome', ' JOAO   TESTE SINTETICO '); await b.clicar('#c-salvar-orcamento');
  await b.esperar(() => document.querySelectorAll('[data-escolher-orcamento]').length === 2);
  d = await b.avaliar(async id => GI.chamadosObter(id), criado.id); assert.equal(d.orcamentos[1].prestador_id, primeiro.prestador_id);
  await b.clicar('[data-escolher-orcamento="0"]'); await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('Escolhido'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-confirmacao').hidden), true);
  await b.clicar('[data-apagar-orcamento="1"]'); assert.match(await texto('[data-apagar-orcamento="1"]'), /Confirmar remoção/);
  await b.clicar('[data-apagar-orcamento="1"]'); await b.esperar(() => document.querySelectorAll('[data-apagar-orcamento]').length === 1);
  await fechar();
  prova('item 7: orçamento só com nome e descrição, sem valor, nome salvo/reutilizado nas sugestões, escolher direto e remover em dois cliques');

  for (const perfil of ['supervisor', 'admin']) {
    await b.navegar(origem + '/app/chamados.html?perfil=' + perfil); await b.esperar(() => !!document.querySelector('[data-editar]'));
    await abrir(criado.id); await b.clicar('#c-trocar');
    await b.esperar(() => document.querySelectorAll('[data-atendimento]').length === 2);
    assert.match(await texto('#c-atendimentos'), /DEMO-SUPERVISOR.*Fila Supervisor/);
    await b.clicar('[data-atendimento="1"]'); await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('DEMO-SUPERVISOR'));
    await b.esperar(() => !document.querySelector('#c-tirar-vinculo').disabled);
    assert.equal((await b.avaliar(async id => GI.chamadosObter(id), criado.id)).chamado.atendimento.chat_id, 8805); await fechar();
  }
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  await novo('Fiador'); assert.match(await texto('#c-atendimentos'), /Este cliente não tem atendimento aberto agora/);
  await b.clicar('#c-informar'); assert.match(await texto('#c-manual'), /plataforma não lista atendimentos encerrados/);
  await b.preencher('#c-protocolo', 'PROTOCOLO-ENCERRADO-SINTETICO'); await b.clicar('#c-vincular-manual');
  await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('PROTOCOLO-ENCERRADO'));
  await salvar();
  let manual = await b.avaliar(async () => (await GI.chamados({ busca: 'Simplificação sintética' })).rows[0]);
  assert.equal(manual.atendimento.chat_id, null); assert.equal(manual.atendimento.protocolo, 'PROTOCOLO-ENCERRADO-SINTETICO');
  await abrir(manual.id); assert.equal(await b.avaliar(() => document.querySelector('#c-avisar').disabled), true); await fechar();
  await b.avaliar(() => { bancada.falharLista = true; }); await novo();
  await b.esperar(() => document.querySelector('#c-atendimento-aviso').textContent.includes('Não foi possível listar'));
  await b.clicar('#c-informar'); await b.preencher('#c-protocolo', 'PROTOCOLO-FALLBACK'); await b.clicar('#c-vincular-manual');
  await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('PROTOCOLO-FALLBACK')); await fechar();
  await b.avaliar(() => { bancada.falharLista = false; });
  prova('itens 5 e 12: lista deduplicada de todas as filas para supervisor/admin, contato sem aberto, protocolo manual e fallback de falha');

  await abrir(4); assert.match(await texto('#c-faixa-aprovacao'), /Aguardando o proprietário/);
  assert.equal(await b.avaliar(() => document.querySelector('#c-mais').open), false);
  await b.clicar('#c-registrar-decisao'); assert.equal(await b.avaliar(() => document.querySelector('#c-mais').open), true); await fechar();
  const hostil = '<img src=x onerror="window.executouHostil=1">';
  await b.avaliar(h => {
    const mine = omni.chats.listMine, msgs = omni.chats.getMessages;
    omni.chats.listMine = async () => (await mine()).map(c => ({ ...c, protocol: h }));
    omni.chats.getMessages = async (...args) => [{ ...(await msgs(...args))[0], text: h }];
  }, hostil);
  await abrir(criado.id); await b.clicar('#c-trocar'); await b.esperar(() => document.querySelector('#c-atendimentos').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-atendimentos img').length), 0);
  await b.preencher('#c-orc-nome', hostil); await b.preencher('#c-orc-observacao', hostil); await b.clicar('#c-salvar-orcamento');
  await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('<img'));
  await b.preencher('#c-orc-nome', '<img'); await b.esperar(() => document.querySelectorAll('#c-prestador-sugestoes option').length === 1);
  assert.equal(await b.avaliar(() => document.querySelector('#c-prestador-sugestoes option').value), hostil);
  assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-modal img, .gi-modal [onerror]').length), 0);
  assert.equal(await b.avaliar(() => window.executouHostil), undefined); await fechar();
  prova('itens 1, 12 e 13: faixa abre aprovação; protocolo, última mensagem, prestador e descrição hostis permanecem texto');

  // Cancelar e reabrir pelo mesmo select e Salvar; dados e histórico permanecem.
  await abrir(criado.id); await b.avaliar(() => { window.prompt = () => 'Motivo sintético'; });
  await b.preencher('#c-status', 'cancelado'); await salvar();
  await b.esperar(() => document.querySelector('#gi-resumo').textContent.includes('7 chamados abertos'));
  await abrir(criado.id); assert.equal(await b.avaliar(() => document.querySelector('#c-dados').disabled), true);
  assert.deepEqual(await b.avaliar(() => Array.from(document.querySelector('#c-status').options, n => n.value).sort()), ['cancelado', 'triagem']);
  await b.preencher('#c-status', 'triagem'); await salvar();
  d = await b.avaliar(async id => GI.chamadosObter(id), criado.id); assert.equal(d.chamado.status, 'triagem');
  assert.ok(d.eventos.some(e => e.tipo === 'status' && e.detalhe.motivo === 'Motivo sintético'));
  for (const tema of ['', '&tema=escuro']) for (const largura of [260, 300, 334, 390]) {
    await b.navegar(origem + '/app/chamados.html?perfil=admin' + tema); await b.esperar(() => !!document.querySelector('[data-editar]'));
    await b.viewport(largura, 844); await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#c-mais'));
    assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true);
    if (largura === 390) await b.captura('simplificar-novo-390-' + (tema ? 'escuro' : 'claro')); await fechar();
    await abrir(criado.id);
    assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true);
    if (largura === 390) await b.captura('simplificar-editar-390-' + (tema ? 'escuro' : 'claro')); await fechar();
  }
  assert.deepEqual(b.erros, []);
  prova('cancelamento e reabertura via Salvar, resumo atualizado, claro/escuro 260/300/334/390 px, capturas e zero exceções');
}
