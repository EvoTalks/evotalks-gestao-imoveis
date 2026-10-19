import assert from 'node:assert/strict';

// As mesmas interações são executadas no servidor estrito e no portal/PGlite real.
export async function testarLote1(b, origem, conferir) {
  const hostil = '<img src=x onerror="window.__lote1xss=1">';
  const painel = '?lote1=1&sdk=numerico&chat=8806&escrita=1';
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const pronto = () => b.esperar(() => document.querySelector('#cp-nome')?.textContent === '5');
  const livre = () => b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-salvar-orcamento').disabled);
  const fechar = async () => { await b.clicar('.gi-modal [data-cancelar]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  const prova = t => process.stdout.write('OK lote1 ' + t + '\n');

  await b.viewport(334, 850);
  await b.navegar(origem + '/app/painel.html' + painel); await pronto();
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/9913/chamados')).length), 0, 'sem locação não consulta chamados');
  const contatos = await b.avaliar(async () => GI.buscarContatos('5'));
  assert.equal(contatos.find(c => c.id === 9905).name, '5');
  assert.equal(await b.avaliar(() => bancada.buscaLimite), 100);
  await b.clicar('#cp-vincular-residencia'); await b.preencher('#cp-r-busca', 'Numérico');
  assert.match(await texto('#cp-r-resultados'), /Buscando/);
  await b.esperar(() => !!document.querySelector('[data-residencia]'));
  await b.clicar('[data-residencia]'); await b.clicar('#cp-r-confirmar');
  await b.esperar(() => document.querySelector('#cp-conteudo').textContent.includes('Imóvel Numérico'));
  const vinculo = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST' && c.caminho.endsWith('/locacoes')).body));
  assert.equal(vinculo.imovel_codigo, '999999'); assert.equal(vinculo.imovel.titulo, 'Imóvel Numérico Sintético');
  assert.equal(vinculo.contatos[0].nome, '5'); assert.equal(vinculo.contatos[0].telefone, '5'); assert.equal(vinculo.contatos[0].contato_id, 9913);
  assert.match(await b.avaliar(() => bancada.chamadas[0].autor), /Agente \?Sintético\? \?\?/);
  prova('1.2–1.4,1.6: contato sem nome, telefone e código numéricos, imóvel com reserva fora do espelho');

  await b.esperar(() => !document.querySelector('#cp-vincular-residencia').disabled);
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.preencher('#cp-titulo', '   '); await b.clicar('#cp-revisar');
  assert.equal(await b.avaliar(() => document.activeElement.id), 'cp-titulo');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo').getAttribute('aria-invalid')), 'true');
  assert.match(await texto('#cp-titulo-erro'), /Informe o título/);
  assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').getAttribute('role')), 'alert');
  await b.avaliar(() => { bancada.fotosNumericas = 2; });
  // A busca inicial já terminou; reabrir força a leitura pelo botão de atualização.
  await b.clicar('#cp-tab-chamados'); await b.clicar('#cp-atualizar'); await pronto(); await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
  await b.esperar(() => document.querySelectorAll('[data-foto]').length === 2);
  await b.esperar(() => document.querySelectorAll('#cp-fotos img').length === 2);
  await b.clicar('[data-foto="0"]'); await b.preencher('#cp-titulo', 'Reparo sintético lote1 ' + hostil);
  await b.clicar('#cp-revisar'); assert.match(await texto('#cp-conteudo'), /WebChat/);
  await b.avaliar(() => { bancada.perderResposta = true; }); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  assert.match(await texto('#cp-recado'), /OS-\d+ aberta ✓/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST' && c.caminho.endsWith('/chamados')).length), 1);
  const criado = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST' && c.caminho.endsWith('/chamados')).body));
  assert.deepEqual(criado.atendimento, { chat_id: 8806, protocolo: '987', canal: 'WebChat', fila: 'Fila Um', iniciado_em: null });
  assert.equal(criado.anexos[0].file_ref, '1'); assert.equal(criado.solicitante.nome, '5');
  const numero = (await texto('#cp-sucesso')).match(/OS-(\d+)/)[1];
  const salvo = await b.avaliar(async () => (await GI.chamadosPorContato(9913)).rows[0]);
  assert.equal(String(salvo.numero), numero); if (conferir) await conferir(salvo.id, criado);
  await b.avaliar(() => { document.execCommand = () => { window.__copiadoLote1 = document.activeElement.value; return true; }; });
  await b.clicar('#cp-copiar-os'); assert.equal(await b.avaliar(() => window.__copiadoLote1), 'OS-' + numero);
  assert.equal(await b.avaliar(() => window.__lote1xss), undefined);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#cp-sucesso img').length), 0);
  prova('1.1,1.3 e 2.1,2.5,2.9,2.10: WebChat, início nulo, arquivo texto, validação, faixa/toast, miniaturas e POST perdido sem duplicar');

  // Uma reabertura fresca não usa HTTP; a atualização manual recebe bloqueio e motivo.
  await b.navegar(origem + '/app/painel.html' + painel + '&persistir=1'); await pronto();
  await b.esperar(async () => !!(await omni.storage.get('gi-cockpit-snapshots-v1'))?.rows.length);
  await b.navegar(origem + '/app/painel.html' + painel + '&persistir=1'); await pronto();
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.includes('/contatos/')).length), 0);
  await b.avaliar(() => {
    const pedir = GI.chamarPortal;
    GI.chamarPortal = function (rota, op) {
      if (rota === '/contatos/9913/locacoes') return new Promise(resolve => { window.__liberarLocacoes = () => pedir(rota, op).then(resolve); });
      if (rota === '/contatos/9913/chamados' && window.__liberarLocacoes) { window.__leiturasParalelas = true; __liberarLocacoes(); }
      return pedir(rota, op);
    };
  });
  await b.clicar('#cp-atualizar'); await pronto();
  assert.equal(await b.avaliar(() => window.__leiturasParalelas), true);
  assert.equal(await b.avaliar(() => document.querySelector('#cp-atualizar').disabled), true);
  assert.match(await b.avaliar(() => document.querySelector('#cp-atualizar').title), /5 segundos/);
  prova('3.2: snapshot fresco evita consultas e atualização manual limitada a 5 s');

  for (const perfil of ['atendente', 'supervisor', 'admin']) {
    await b.navegar(origem + '/app/os.html' + painel + '&chamado=' + salvo.id + '&perfil=' + perfil); await livre();
    assert.ok(await b.avaliar(() => bancada.chamadas.length <= 4), 'edição usa 3 chamadas além do /info');
    await b.clicar('#c-salvar-nota');
    assert.match(await texto('[data-recado-form]'), /Escreva uma nota/);
    assert.match(await texto('.gi-modal-recado'), /Escreva uma nota/);
    await b.esperar(() => !document.querySelector('#c-avisar').disabled);
    await b.preencher('#c-nota', 'Nota sintética ' + perfil + ' ' + hostil); await b.clicar('#c-avisar');
    await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
    await b.esperar(() => document.querySelector('#c-nota').value === '');
    assert.match(await texto('[data-recado-form]'), /Nota salva/);
    await b.avaliar(() => { bancada.recusarEnvio = true; });
    await b.preencher('#c-nota', 'Nota preservada com janela fechada'); await b.clicar('#c-avisar');
    await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
    await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('janela de 24 h fechou'));
    assert.match(await texto('[data-recado-form]'), /Nota salva. O cliente não foi avisado porque a janela de 24 h fechou/);
    assert.equal(await b.avaliar(() => document.querySelector('#c-nota').value), '');
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = op => op.url.endsWith('/orcamentos') && op.method === 'POST' ? Promise.resolve({ status: 422, body: JSON.stringify({ erro: 'dados_invalidos', campos: { prestador_nome: '<img src=x onerror="window.__lote1xss=1">' } }) }) : http(op);
      document.querySelector('.gi-modal-corpo').scrollTop = 99999;
    });
    await b.preencher('#c-orc-nome', 'Sintético'); await b.clicar('#c-salvar-orcamento');
    await b.esperar(() => document.querySelector('[data-recado-form]').getAttribute('role') === 'alert');
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-recado-form] img').length), 0);
    assert.equal(await b.avaliar(() => getComputedStyle(document.querySelector('[data-recado-form]')).position), 'sticky');
    assert.match(await texto('.gi-modal-recado'), /<img/);
    assert.equal(await b.avaliar(() => window.__lote1xss), undefined);
    if (perfil === 'admin') {
      await b.clicar('#c-trocar'); await b.esperar(() => !!document.querySelector('[data-atendimento]'));
      await b.clicar('[data-atendimento="0"]');
      await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('#8899') && !document.querySelector('.gi-modal [data-ok]').disabled);
      const legado = await b.avaliar(async id => (await GI.chamadosObter(id)).chamado.atendimento, salvo.id);
      assert.equal(legado.protocolo, '456'); assert.equal(legado.iniciado_em, '2026-10-17T12:00:00.000Z');
    }
    await fechar();
  }
  prova('2.1,2.6,2.7: três perfis editam, nota WebChat, janela fechada salva internamente, erro abaixo da dobra na faixa e rodapé, dado hostil texto');

  await b.navegar(origem + '/app/os.html' + painel + '&chamado=' + salvo.id); await livre();
  await b.preencher('#c-valor', 'R$ 1.500,00'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.equal(await b.avaliar(async id => (await GI.chamadosObter(id)).chamado.valor_estimado_centavos, salvo.id), 150000);
  prova('1.5–1.8: histórico legado normalizado, autoria Latin1 real, reais com milhar e busca com 100 resultados sem descartar contato');

  await b.avaliar(async (id, atendimento) => GI.chamadosAtualizar(id, { atendimento }), salvo.id, criado.atendimento);
  await b.navegar(origem + '/app/os.html' + painel + '&chamado=' + salvo.id); await livre();
  await b.avaliar(() => {
    bancada.fotosNumericas = 50;
    const getFile = omni.chats.getFile; let ativos = 0;
    window.__arquivosLote1 = { max: 0, feitos: 0 };
    omni.chats.getFile = async ref => {
      ativos++; __arquivosLote1.max = Math.max(__arquivosLote1.max, ativos);
      await new Promise(r => setTimeout(r, 5));
      try { return await getFile(ref); } finally { ativos--; __arquivosLote1.feitos++; }
    };
  });
  await b.clicar('#c-carregar-fotos');
  await b.esperar(() => window.__arquivosLote1.feitos >= 50);
  assert.equal(await b.avaliar(() => __arquivosLote1.max), 4);
  prova('3.3: cinquenta prévias do SDK resolvidas em fila de quatro');
  await b.avaliar(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    async function escolher(n, inicio) {
      const dt = new DataTransfer();
      for (let i = 0; i < n; i++) dt.items.add(new File([blob], 'sintetica-' + (inicio + i) + '.png', { type: 'image/png' }));
      const input = document.querySelector('#c-pasta'); input.files = dt.files; input.dispatchEvent(new Event('change'));
    }
    window.__escolherFotosLote1 = escolher;
    await escolher(10, 0);
  });
  await b.esperar(() => document.querySelectorAll('#c-pendentes img').length === 10 && !document.querySelector('.gi-modal [data-ok]').disabled);
  await b.avaliar(() => __escolherFotosLote1(2, 10));
  await b.esperar(() => document.querySelectorAll('#c-pendentes img').length === 12 && !document.querySelector('.gi-modal [data-ok]').disabled);
  assert.match(await texto('#c-cota-fotos'), /vai levar alguns segundos/);
  await b.avaliar(() => { window.__restantes = GI.cotaPortal.restantes; GI.cotaPortal.restantes = () => 0; });
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('limite de 30'));
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length), 0);
  await b.avaliar(() => { GI.cotaPortal.restantes = __restantes; });
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('#c-confirmacao').hidden);
  assert.match(await texto('#c-confirmacao-texto'), /12 fotos vai levar alguns segundos/);
  await b.avaliar(() => {
    const upload = GI.chamadosAnexoUpload;
    GI.chamadosAnexoUpload = async (...args) => {
      const r = await upload(...args); return new Promise(resolve => { window.__liberarFotoLote1 = () => resolve(r); });
    };
  });
  await b.clicar('#c-confirmar-acao'); await b.esperar(() => !!window.__liberarFotoLote1);
  assert.match(await texto('[data-recado-form]'), /Enviando foto 1 de 12/);
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal-x').disabled), false);
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal [data-cancelar]').disabled), false);
  await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  assert.equal(await b.avaliar(() => document.querySelector('#c-descarte').hidden), false);
  await b.clicar('#c-voltar-descarte'); await b.clicar('#c-cancelar-fotos'); await b.avaliar(() => __liberarFotoLote1());
  await b.esperar(() => !document.querySelector('.gi-modal [data-ok]').disabled && document.querySelector('#c-mensagem').textContent.includes('Envio cancelado'));
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length), 1);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes img').length), 11);
  await b.avaliar(() => { window.__liberarFotoLote1 = null; });
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !!window.__liberarFotoLote1);
  await b.clicar('.gi-modal [data-cancelar]'); await b.clicar('#c-descartar');
  await b.avaliar(() => __liberarFotoLote1()); await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length), 2);
  prova('2.8 e 3.3: 12 fotos avisam volume/cota, progresso, cancelamento preserva 11 restantes, Fechar e Esc liberados com confirmação');

  for (const codigo of ['rate_limited', 'rate_limit']) {
    await b.navegar(origem + '/app/painel.html' + painel); await pronto();
    const limite = await b.avaliar(async codigo => {
      let tentativas = 0;
      omni.http.request = async () => { tentativas++; throw Object.assign(new Error(codigo), { code: codigo }); };
      const mensagens = [];
      for (let i = 0; i < 2; i++) try { await GI.chamarPortal('/locacoes?lote1-cota=' + i); } catch (err) { mensagens.push(GI.mensagemErro(err)); }
      return { tentativas, mensagens };
    }, codigo);
    assert.equal(limite.tentativas, 1); assert.ok(limite.mensagens.every(m => /Limite de consultas/.test(m)));
  }
  prova('3.1: rate_limited e rate_limit interrompem consultas por um minuto');

  await b.navegar(origem + '/app/painel.html' + painel); await pronto();
  const faixa = await b.avaliar(() => {
    const timer = window.setTimeout;
    window.__timerRecadoLote1 = timer;
    window.setTimeout = function (fn, ms) { if (ms === 8000) window.__prazoRecadoLote1 = ms; return timer(fn, ms === 8000 ? 5 : ms); };
    GI.recado('Operação sintética salva.', 'sucesso', document.querySelector('#cp-recado'));
    return { role: document.querySelector('#cp-recado').getAttribute('role'), prazo: __prazoRecadoLote1 };
  });
  assert.deepEqual(faixa, { role: 'status', prazo: 8000 });
  await b.esperar(() => document.querySelector('#cp-recado').hidden);
  await b.avaliar(() => GI.recado('<img src=x onerror="window.__lote1xss=1">', 'erro', document.querySelector('#cp-recado')));
  assert.equal(await b.avaliar(() => document.activeElement.id), 'cp-recado');
  assert.equal(await b.avaliar(() => document.querySelectorAll('#cp-recado img').length), 0);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').hidden), false);
  await b.clicar('#cp-recado button'); assert.equal(await b.avaliar(() => document.querySelector('#cp-recado').hidden), true);
  await b.avaliar(() => { window.setTimeout = __timerRecadoLote1; });
  assert.ok(await b.avaliar(() => bancada.toasts.every(t => typeof t.texto === 'string' && ['error', 'success'].includes(t.tipo))));
  prova('2.1: sucesso tem prazo de 8 s, erro persiste com foco, botão fecha e toast recebe só texto');
  await b.avaliar(() => window.onerror('falha sintética'));
  assert.equal(await b.avaliar(() => document.querySelector('#gi-erro').hidden), false);
  assert.notEqual(await b.avaliar(() => getComputedStyle(document.querySelector('#gi-erro')).display), 'none');
  assert.match(await texto('#cp-recado'), /Algo deu errado/); await b.clicar('#cp-tentar'); await pronto();
  await b.avaliar(() => window.dispatchEvent(new Event('unhandledrejection')));
  assert.match(await texto('#cp-recado'), /Algo deu errado/);
  await b.navegar(origem + '/app/painel.html' + painel + '&travado=1');
  await b.esperar(() => !!document.querySelector('#cp-tentar'));
  assert.match(await texto('#cp-conteudo'), /Algo deu errado/);
  prova('2.2: gi-erro visível, onerror, unhandledrejection e início limitado a 20 s com tentativa explícita');

  await b.navegar(origem + '/app/painel.html' + painel + '&demonstracao=1');
  await b.esperar(() => !!document.querySelector('#cp-tab-novo') && !document.querySelector('#cp-abas').hidden);
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.preencher('#cp-titulo', 'Somente demonstração'); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  assert.doesNotMatch(await texto('#cp-sucesso'), /A equipe vê/);
  assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
  assert.deepEqual(b.erros, []);
  prova('2.9: demonstração tem texto verdadeiro e zero rede');
}
