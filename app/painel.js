/* Cockpit do atendimento. O imóvel é o foco; o contato identifica as locações. */
(function () {
  'use strict';
  var e = GI.escapar, $ = function (id) { return document.getElementById(id); };
  window.onerror = function () { falhaPainel(); return true; };
  window.addEventListener('unhandledrejection', falhaPainel);
  var queryDemo = new URLSearchParams(location.search).get('demonstracao') === '1';
  function demo() { return queryDemo || GI.cfg('modoDemonstracao', false) === true; }
  function escrita() { return GI.cfg('cockpitAbreChamado', true) === true; }
  var geracao = 0, temporizador, chat = null, contato = null, locacoes = [], chamados = [], selecionada = 0;
  var aba = 'chamados', formulario = null, fotos = [], fotosLidas = false, fotosAviso = '', confirmado = null, gravando = false, criacaoIncerta = null;
  var administrador = false, residencia = null, timerResidencia, buscaResidencia = 0;
  var cache = new Map(), requisicoes = [], esperarAte = 0;
  var transporte = GI.chamarPortal;
  var filtroImovel = '', novoSelecionado = false, filtro = 'todos', busca = '', limiteLista = 10, atualizadoEm = 0, snapshots = [], fila = Promise.resolve(), versaoDados = 0;
  var chaveSnapshot = 'gi-cockpit-snapshots-v1', filasConhecidas = [], contatosComLocacao = {}, inicioTimer, atualizarTimer, ultimaAtualizacao = 0;
  function invalidarSnapshot(contatoId) {
    if (demo()) return Promise.resolve();
    snapshots = snapshots.filter(function (s) { return s.contatoId !== Number(contatoId); });
    try { return Promise.resolve(omni.storage.set(chaveSnapshot, { origem: GI.cfg('portalUrl', ''), rows: snapshots })).catch(function () {}); }
    catch (_) { return Promise.resolve(); }
  }
  async function lerSnapshot(c) {
    try {
      var r = await omni.storage.get(chaveSnapshot);
      snapshots = r && r.origem === GI.cfg('portalUrl', '') && Array.isArray(r.rows) ? r.rows : [];
      return GI.cockpit.ler(snapshots, Number(c.contactId), Date.now());
    } catch (_) { snapshots = []; return null; }
  }
  async function guardarSnapshot(c) {
    if (demo()) return;
    snapshots = GI.cockpit.guardar(snapshots, Number(c.contactId), { locacoes: locacoes, chamados: chamados }, atualizadoEm);
    try { await omni.storage.set(chaveSnapshot, { origem: GI.cfg('portalUrl', ''), rows: snapshots }); } catch (_) { /* Cache opcional. */ }
  }

  // A barreira é instalada antes de GI.pronto (inclusive /info e usuário sem nome).
  var fetchOriginal = window.fetch;
  if (fetchOriginal) window.fetch = function () {
    if (demo()) return Promise.reject(new Error('Demonstração: rede bloqueada.'));
    return fetchOriginal.apply(window, arguments);
  };
  if (window.omni && omni.http && typeof omni.http.request === 'function') {
    var httpOriginal = omni.http.request;
    omni.http.request = function () {
      if (demo()) return Promise.reject(new Error('Demonstração: HTTP bloqueado.'));
      return httpOriginal.apply(omni.http, arguments);
    };
  }
  var usuarios = GI.usuarios;
  GI.usuarios = function () { return demo() ? Promise.resolve({}) : usuarios(); };
  function limite() {
    var erro = new Error('Limite de consultas atingido. Aguarde cerca de um minuto e tente novamente.');
    erro.status = 429; return erro;
  }
  GI.chamarPortal = function (rota, op) {
    if (demo()) return Promise.reject(new Error('Demonstração sem rede: use os dados sintéticos da tela.'));
    var post = op && op.corpo !== undefined;
    if (post && !/^\/locacoes(?:\/\d+)?$/.test(rota) && !escrita()) return Promise.reject(new Error('Abertura de chamados desligada neste cockpit.'));
    if (post && GI.modo !== 'portal') return Promise.reject(new Error('Manutenção exige o portal conectado.'));
    var agora = Date.now(), anterior = cache.get(rota);
    if (!post && anterior && agora - anterior.em < 60000) return anterior.promessa;
    requisicoes = requisicoes.filter(function (t) { return agora - t < 60000; });
    if (agora < esperarAte || requisicoes.length >= 30) return Promise.reject(limite());
    requisicoes.push(agora);
    var alvoContato = chat && chat.contactId;
    function enviar() { return transporte(rota, op); }
    var operacao;
    if (post) {
      ++versaoDados;
      operacao = fila.then(function () { return invalidarSnapshot(alvoContato); }).then(enviar);
      fila = operacao.catch(function () {});
    } else operacao = Promise.resolve().then(enviar);
    var promessa = operacao.catch(function (err) {
      cache.delete(rota);
      if (err.status === 429 || err.code === 'rate_limit' || err.code === 'rate_limited' || /rate.limit/i.test(err.message)) { esperarAte = Date.now() + 60000; throw limite(); }
      throw err;
    });
    if (!post) cache.set(rota, { em: agora, promessa: promessa });
    else cache.clear();
    return promessa;
  };
  GI.definirModo = function () {
    if (demo()) { GI.modo = 'demonstracao'; return Promise.resolve(GI.modo); }
    if (!GI.usaPortal()) { GI.modo = 'local'; return Promise.resolve(GI.modo); }
    return GI.chamarPortal('/info').then(function () { GI.modo = 'portal'; GI.portalErro = ''; return GI.modo; }, function (err) {
      GI.modo = 'portal-fora'; GI.portalErro = err.message; return GI.modo;
    });
  };

  // O observer de comum.js também chama este método: ele passa a medir só o wrapper.
  var altura = null, agendado = false, fixo = false;
  GI.ajustarAltura = function () {
    if (agendado || fixo) return;
    agendado = true;
    setTimeout(function () {
      agendado = false;
      var h = Math.ceil($('gi-cockpit').getBoundingClientRect().height);
      if (fixo || altura !== null && Math.abs(h - altura) < 2 || !window.omni || !omni.ui) return;
      altura = h;
      try { Promise.resolve(omni.ui.resize(h)).then(function (r) { if (r && r.applied === false) fixo = true; }).catch(function () {}); }
      catch (_) { /* O host pode estar desmontando o painel. */ }
    }, 0);
  };
  var observer = new ResizeObserver(GI.ajustarAltura);
  observer.observe($('gi-cockpit'));

  function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function id(v) { var n = numero(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function linhas(r) { return Array.isArray(r) ? r : r && Array.isArray(r.rows) ? r.rows : []; }
  function locacao() { return locacoes[selecionada]; }
  function abertos(c) { return c.status !== 'concluido' && c.status !== 'cancelado'; }
  function lista() { return chamados.filter(function (c) { return !filtroImovel || String(c.locacao_id) === filtroImovel; }); }
  function papel(v) { return valorMapa({ locatario: 'LOCATÁRIO', proprietario: 'PROPRIETÁRIO', fiador: 'FIADOR', outro: 'OUTRO' }, v) || 'CONTATO'; }
  function moeda(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function data(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—'; }
  function instante(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('pt-BR') : '—'; }
  function kv(rotulo, valor) { return '<div class="gi-cp-kv" data-kv="' + e(rotulo) + '"><span>' + e(rotulo) + '</span><span>' + e(valor == null || valor === '' ? '—' : valor) + '</span></div>'; }
  function recado(t, tipo) {
    tipo = tipo || 'info';
    GI.recado(t, tipo, $('cp-recado'));
  }
  function falhaPainel() {
    clearTimeout(inicioTimer); ++geracao;
    estado('Algo deu errado no painel. Atualize com ⟳.', true); $('cp-tentar').textContent = 'Tentar de novo';
    $('gi-erro').hidden = false; $('gi-erro').textContent = 'Algo deu errado no painel. Atualize com ⟳.';
    recado('Algo deu errado no painel. Atualize com ⟳.', 'erro');
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest('button') && !ev.target.closest('.gi-recado')) recado('', 'info'); }, true);
  function estado(t, tentar) {
    $('cp-conteudo').innerHTML = '<div class="gi-cartao state"><p id="cp-estado"></p>' + (tentar ? '<button type="button" class="btn" id="cp-tentar">Tentar novamente</button>' : '') + '</div>';
    $('cp-estado').textContent = t;
    $('cp-conteudo').setAttribute('aria-busy', t.indexOf('Carregando') === 0 ? 'true' : 'false');
    if (tentar) $('cp-tentar').onclick = function () { iniciar(true); };
  }
  async function atual(g, c) {
    if (g !== geracao) return false;
    if (demo()) return true;
    var s = await omni.chats.getSelected();
    return g === geracao && !!s && String(s.id) === String(c.id) && String(s.contactId) === String(c.contactId);
  }
  function limpar() {
    clearTimeout(timerResidencia); ++buscaResidencia; residencia = null;
    $('cp-vincular-residencia').hidden = true; $('cp-residencia-aviso').textContent = '';
    chat = contato = null; locacoes = []; chamados = []; selecionada = 0; formulario = confirmado = criacaoIncerta = null;
    fotos = []; fotosLidas = false; fotosAviso = ''; aba = 'chamados'; gravando = false;
    $('cp-abas').hidden = true; $('cp-selecao').hidden = true;
    filtroImovel = ''; novoSelecionado = false; filtro = 'todos'; busca = ''; limiteLista = 10; atualizadoEm = 0; $('cp-idade').textContent = '';
    $('cp-nome').textContent = 'Contato do atendimento'; $('cp-contexto').textContent = ''; $('cp-resumo').textContent = ''; recado('', 'info');
  }
  function dadosDemo() {
    chat = { id: 8800, contactId: 9900, protocol: 'DEMO-INVALIDO', channel: 'Demonstração', queueId: 0 };
    contato = { id: 9900, name: 'Cliente Demonstração', phone: '00000000000', document: '00000000000' };
    locacoes = [{ id: 9000, imovel_codigo: 'DEMO-001', imovel_titulo: 'Imóvel Demonstração', contrato_numero: 'DEMO-INVALIDO',
      imovel_endereco: 'Endereço fictício, zero', papel_do_contato: 'locatario', contatos: [{ contato_id: 9900, nome: 'Cliente Demonstração', papel: 'locatario', telefone: '00000000000' }] }];
    chamados = [{ id: 9000, numero: 9000, locacao_id: 9000, titulo: 'Reparo Demonstração', descricao: 'Relato sintético, sem correspondência real.',
      categoria: 'hidraulica', prioridade: 'alta', status: 'orcamento', solicitante: { nome: 'Cliente Demonstração' },
      atendimento: { chat_id: 8800, protocolo: 'DEMO-INVALIDO', canal: 'Demonstração' }, sla: {}, prestador: { nome: 'Prestador Demonstração' }, orcamentos_total: 1 }];
  }
  async function iniciar(forcar) {
    if (criacaoIncerta) {
      var g = geracao, incerta = criacaoIncerta, selecionado;
      try { selecionado = await omni.chats.getSelected(); }
      catch (_) { if (g === geracao) recado('Não foi possível conferir o atendimento. Tente de novo.', 'erro'); return; }
      if (g !== geracao || incerta !== criacaoIncerta) return;
      if (selecionado && id(selecionado.id) === incerta.chatId && id(selecionado.contactId) === incerta.contatoId) { await conferirCriacaoIncerta(); return; }
      criacaoIncerta = null;
    }
    if (formulario && (formulario.titulo || formulario.descricao || formulario.disponibilidade || formulario.chaves)) {
      var chatAnterior = chat, tituloAnterior = formulario && formulario.titulo;
      var rascunhoAnterior = formulario && Object.assign({}, formulario);
      var atualizacao = iniciarInterno(forcar);
      await atualizacao;
      if (chatAnterior && chat && String(chatAnterior.id) === String(chat.id) && String(chatAnterior.contactId) === String(chat.contactId)) { formulario = rascunhoAnterior; if (aba === 'novo') renderNovo(); }
      return;
    }
    return iniciarInterno(forcar);
  }
  async function iniciarInterno(forcar) {
    if (forcar) cache.clear();
    var g = ++geracao;
    clearTimeout(inicioTimer); $('gi-erro').hidden = true;
    inicioTimer = setTimeout(function () { if (g === geracao) falhaPainel(); }, 20000);
    limpar(); estado('Carregando contato, imóvel e chamados…');
    if (demo()) { dadosDemo(); atualizadoEm = Date.now(); cabecalho(); render(); clearTimeout(inicioTimer); return; }
    if (GI.modo !== 'portal') {
      clearTimeout(inicioTimer); botaoResidencia();
      estado('O portal não respondeu. Confira a URL e o token em Configurações da extensão ou avise quem cuida da instalação.', true);
      $('cp-tentar').onclick = async function () { cache.delete('/info'); await GI.definirModo(); if (g === geracao) { GI.manutencaoMostrarModo(); iniciar(true); } };
      return;
    }
    try {
      var c = await omni.chats.getSelected();
      if (g !== geracao) return;
      if (!c || !id(c.contactId)) { estado(c ? 'Clique em Sem contato cadastrado, no topo da conversa, e escolha Adicionar dados a contato existente.' : 'Nenhum atendimento selecionado. Abra uma conversa para consultar a manutenção.'); return; }
      var permissoes = await omni.session.getPermissions();
      if (!await atual(g, c)) return;
      administrador = !!(permissoes && permissoes.isAdmin === true) || GI.gestor();
      var pessoa = await omni.contacts.get(c.contactId);
      if (!await atual(g, c)) return;
      pessoa = pessoa || {}; pessoa.name = GI.nomeContato(pessoa, c); pessoa.phone = GI.textoOuNull(pessoa.phone);
      chat = c; contato = pessoa;
      var snapshot = forcar ? null : await lerSnapshot(c);
      if (!await atual(g, c)) return;
      if (snapshot) {
        locacoes = snapshot.dados.locacoes; chamados = snapshot.dados.chamados; atualizadoEm = snapshot.em;
        contatosComLocacao[c.contactId] = locacoes.length > 0; cabecalho(); render(); return;
      }
      var versaoConsulta = versaoDados;
      var consultaLocacoes = GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
      // Sem histórico deste contato, conhecer a locação primeiro evita gastar cota sem imóvel.
      var consultaChamados = contatosComLocacao[c.contactId] === true ? GI.chamadosPorContato(c.contactId) : consultaLocacoes.then(function (lr) {
        return linhas(lr).length ? GI.chamadosPorContato(c.contactId) : { rows: [] };
      });
      var respostas = await Promise.all([consultaLocacoes, consultaChamados]);
      var lr = respostas[0], cr = respostas[1];
      if (!await atual(g, c)) return;
      contatosComLocacao[c.contactId] = linhas(lr).length > 0;
      if (versaoConsulta !== versaoDados) return; // Uma gravação posterior vence a leitura que já estava em voo.
      chat = c; contato = pessoa; locacoes = linhas(lr); chamados = linhas(cr); atualizadoEm = Date.now();
      cabecalho();
      if (!snapshot || aba === 'chamados') render();
      await guardarSnapshot(c);
    } catch (err) { if (g === geracao) { if (atualizadoEm) recado('Não foi possível atualizar. Exibindo a última consulta.', 'erro'); else { estado(GI.mensagemErro(err), true); recado(GI.mensagemErro(err), 'erro'); } } }
    finally { if (g === geracao) clearTimeout(inicioTimer); }
  }
  function cabecalho() {
    var l = locacao(), rows = lista();
    $('cp-nome').textContent = contato.name || 'Contato do atendimento';
    $('cp-contexto').innerHTML = '<span class="panel__tax-id">' + e(GI.mascaraDocumento(contato.document)) + '</span><span class="gi-cp-pill">' + e(papel(l && l.papel_do_contato)) + '</span>';
    var totais = GI.cockpit.resumo(rows), rotulos = { abertos: 'Abertos', atrasados: 'Atrasados', aguardando: 'Aguardando proprietário', emergencias: 'Emergências' };
    $('cp-resumo').innerHTML = Object.keys(rotulos).map(function (k) { return '<button type="button" data-resumo="' + k + '" aria-pressed="' + (filtro === k) + '">' + totais[k] + ' ' + rotulos[k] + '</button>'; }).join('');
    $('cp-idade').textContent = 'atualizado há ' + Math.max(0, Math.floor((Date.now() - atualizadoEm) / 60000)) + ' min';
    document.querySelectorAll('[data-resumo]').forEach(function (b) { b.onclick = function () { filtro = filtro === b.dataset.resumo ? 'todos' : b.dataset.resumo; limiteLista = 10; aba = 'chamados'; cabecalho(); render(); }; });
    $('cp-selecao').hidden = locacoes.length < 2;
    $('cp-imovel').innerHTML = locacoes.map(function (l, i) { return '<option value="' + i + '">' + e(rotuloImovel(l)) + '</option>'; }).join('');
    $('cp-imovel').value = String(selecionada);
    $('cp-abas').hidden = !l;
    $('cp-tab-novo').hidden = !escrita();
    $('cp-escrita-aviso').hidden = escrita();
    $('cp-tab-chamados').textContent = 'Chamados (' + rows.length + ')';
    botaoResidencia();
  }
  function render() {
    if (residencia) { renderResidencia(); return; }
    if (!locacao()) { estado('Este contato ainda não tem residência vinculada.'); return; }
    $('cp-conteudo').setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-aba]').forEach(function (b) { var ativo = b.dataset.aba === aba; b.setAttribute('aria-selected', String(ativo)); b.tabIndex = ativo ? 0 : -1; });
    $('cp-conteudo').setAttribute('aria-labelledby', 'cp-tab-' + aba);
    if (aba === 'chamados') renderChamados();
    else if (aba === 'imovel') renderImovel();
    else renderNovo();
    GI.ajustarAltura();
  }
  function impedimentoResidencia() {
    return demo() ? 'Na demonstração, o vínculo de residência está desabilitado.' :
      GI.modo !== 'portal' ? 'Conecte o portal para vincular uma residência.' : '';
  }
  function botaoResidencia() {
    var motivo = impedimentoResidencia();
    $('cp-vincular-residencia').hidden = !contato && !motivo;
    $('cp-vincular-residencia').disabled = !!motivo || gravando;
    $('cp-vincular-residencia').textContent = locacoes.length ? 'Vincular outra residência' : 'Vincular residência';
    $('cp-residencia-aviso').textContent = motivo;
  }
  function campoResidencia(chave, rotulo) {
    return '<div><label for="cp-r-' + chave + '">' + rotulo + '</label><input id="cp-r-' + chave + '" maxlength="' + (chave === 'contrato' ? 120 : 300) + '" value="' + e(residencia[chave] || '') + '"></div>';
  }
  function renderResidencia() {
    var r = residencia, g = geracao, c = chat;
    $('cp-abas').hidden = true;
    $('cp-conteudo').setAttribute('aria-busy', 'false');
    if (r.etapa === 'adicionar') {
      var l = r.locacao;
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-form"><h2>' + e(rotuloImovel(l)) + '</h2><p>Este imóvel já está locado. Contatos atuais:</p><ul>' + (l.contatos || []).map(function (p) { return '<li>' + e(p.nome) + ' · ' + e(papel(p.papel)) + '</li>'; }).join('') + '</ul><p>Adicionar <strong>' + e(contato.name) + '</strong> como locatário, preservando os contatos acima?</p><button type="button" class="btn btn-primario" id="cp-r-confirmar">Adicionar este contato à locação</button><button type="button" class="btn" id="cp-r-voltar">Voltar</button></div>';
      $('cp-r-voltar').onclick = function () { if (!gravando) { r.etapa = 'buscar'; renderResidencia(); } };
      $('cp-r-confirmar').onclick = function () { gravarResidencia(r, g, c); };
      return;
    }
    if (r.etapa === 'confirmar') {
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-form"><p>Vincular <strong>' + e(r.imovel ? r.imovel.name : r.titulo) + '</strong> a <strong>' + e(contato.name) + '</strong>?</p>' +
        (r.contrato ? kv('Contrato', r.contrato) : '') + '<button type="button" class="btn btn-primario" id="cp-r-confirmar">Vincular</button><button type="button" class="btn" id="cp-r-voltar">Voltar</button></div>';
      $('cp-r-voltar').onclick = function () { if (!gravando) { r.etapa = 'buscar'; renderResidencia(); } };
      $('cp-r-confirmar').onclick = function () { gravarResidencia(r, g, c); };
      return;
    }
    $('cp-conteudo').innerHTML = '<form class="gi-cartao gi-cp-form" id="cp-r-form" novalidate><h2>Vincular residência</h2>' +
      (r.fora ? campoResidencia('titulo', 'Título do imóvel (obrigatório)') + campoResidencia('endereco', 'Endereço (opcional)') + campoResidencia('bairro', 'Bairro (opcional)') + campoResidencia('cidade', 'Cidade (opcional)') :
      '<div><label for="cp-r-busca">Buscar por código, título ou bairro</label><input type="search" id="cp-r-busca" value="' + e(r.termo || '') + '" autocomplete="off"></div><div id="cp-r-resultados" class="gi-cp-form" aria-live="polite"></div>') +
      '<button type="button" class="btn" id="cp-r-fora">' + (r.fora ? 'Buscar no catálogo' : 'Não está no catálogo') + '</button>' + campoResidencia('contrato', 'Contrato (opcional)') +
      (r.fora ? '<button type="submit" class="btn btn-primario">Revisar vínculo</button>' : '') + '<button type="button" class="btn" id="cp-r-cancelar">Voltar</button><p class="panel__note">Nada é gravado antes de Vincular.</p></form>';
    ['titulo', 'endereco', 'bairro', 'cidade', 'contrato'].forEach(function (k) {
      if ($('cp-r-' + k)) $('cp-r-' + k).oninput = function () { r[k] = this.value; this.removeAttribute('aria-invalid'); recado('', 'info'); };
    });
    $('cp-r-cancelar').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); residencia = null; recado('', 'info'); cabecalho(); render(); };
    $('cp-r-fora').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); r.fora = !r.fora; r.imovel = null; renderResidencia(); };
    $('cp-r-form').onsubmit = function (ev) {
      ev.preventDefault();
      if (!r.fora) return;
      if (!String(r.titulo || '').trim()) { recado('Informe o título do imóvel.', 'erro'); $('cp-r-titulo').setAttribute('aria-invalid', 'true'); $('cp-r-titulo').focus(); return; }
      r.etapa = 'confirmar'; recado('', 'info'); renderResidencia();
    };
    function resultados() {
      if (!$('cp-r-resultados')) return;
      $('cp-r-resultados').innerHTML = (r.resultados || []).slice(0, 8).map(function (p, i) {
        return '<button type="button" class="btn" data-residencia="' + i + '">' + e(p.internalcode) + ' · ' + e(p.name) + '</button>';
      }).join('');
      $('cp-r-resultados').querySelectorAll('[data-residencia]').forEach(function (b) { b.onclick = function () {
        ++buscaResidencia; clearTimeout(timerResidencia); r.imovel = r.resultados[Number(b.dataset.residencia)]; r.etapa = 'confirmar'; recado('', 'info'); renderResidencia();
      }; });
    }
    if ($('cp-r-busca')) {
      resultados();
      $('cp-r-busca').oninput = function () {
        var termo = this.value.trim();
        if (termo === (r.termo || '')) return;
        r.termo = termo; r.resultados = []; resultados(); if (termo) $('cp-r-resultados').textContent = 'Buscando…'; clearTimeout(timerResidencia); var v = ++buscaResidencia;
        if (!termo) return;
        timerResidencia = setTimeout(async function () {
          try {
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            var resposta = await GI.buscarImoveis({ termo: termo, porPagina: 8 });
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            r.resultados = resposta.itens.slice(0, 8); resultados();
            if (!r.resultados.length) $('cp-r-resultados').textContent = 'Nenhum imóvel encontrado. Você pode usar Não está no catálogo.';
          } catch (_) { if (g === geracao && residencia === r && v === buscaResidencia) recado('Não foi possível buscar os imóveis. Tente de novo.', 'erro'); }
        }, 300);
      };
    }
  }
  async function gravarResidencia(r, g, c) {
    if (gravando || residencia !== r || impedimentoResidencia()) return;
    gravando = true; $('cp-r-confirmar').disabled = true; $('cp-r-voltar').disabled = true; botaoResidencia(); recado('Vinculando residência…', 'info');
    var gravou = false;
    try {
      if (!await atual(g, c) || residencia !== r) return;
      var dados = { contatos: [{ contato_id: id(c.contactId), nome: GI.nomeContato(contato, c), telefone: GI.textoOuNull(contato.phone), papel: 'locatario' }] };
      if (r.imovel) {
        var cat = String(r.imovel.category || '').split(' > ');
        dados.imovel_codigo = String(r.imovel.internalcode);
        dados.imovel = { titulo: String(r.imovel.name || r.imovel.internalcode), tipo: cat[0] || null, cidade: cat[1] || null, bairro: cat[2] || null };
      }
      else dados.imovel = { titulo: String(r.titulo || '').trim(), endereco: r.endereco || '', bairro: r.bairro || '', cidade: r.cidade || '' };
      if (String(r.contrato || '').trim()) dados.contrato_numero = r.contrato.trim();
      var salvo;
      if (r.etapa === 'adicionar') {
        cache.delete('/locacoes/' + r.locacao.id);
        var existente = await GI.locacoesObter(r.locacao.id);
        if (!await atual(g, c) || residencia !== r) return;
        var pessoas = (existente.locacao.contatos || []).slice();
        if (!pessoas.some(function (p) { return Number(p.contato_id) === id(c.contactId) && p.papel === 'locatario'; })) pessoas.push(dados.contatos[0]);
        salvo = await GI.locacoesAtualizar(r.locacao.id, { contatos: pessoas });
      } else salvo = await GI.locacoesCriar(dados);
      gravou = true;
      if (!await atual(g, c)) return;
      residencia = null;
      var lr = await GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
      if (!await atual(g, c)) return;
      locacoes = linhas(lr);
      selecionada = Math.max(0, locacoes.findIndex(function (l) { return String(l.id) === String(salvo.locacao.id); }));
      aba = 'imovel'; cabecalho(); render(); recado('Residência vinculada.', 'sucesso');
      var cr = await GI.chamadosPorContato(c.contactId);
      if (!await atual(g, c)) return;
      chamados = linhas(cr); cabecalho();
    } catch (err) {
      if (g !== geracao) return;
      if (gravou) { residencia = null; cabecalho(); render(); recado('Residência vinculada. Não foi possível atualizar a consulta. Use Atualizar para consultar o vínculo.', 'erro'); }
      else {
        var d = err.dados || {};
        if (d.erro === 'imovel_ja_locado' && id(d.locacao_id)) {
          try {
            var existente = await GI.locacoesObter(d.locacao_id);
            if (!await atual(g, c) || residencia !== r) return;
            r.locacao = existente.locacao; r.etapa = 'adicionar'; renderResidencia(); recado('', 'info');
          } catch (falha) { if (g === geracao) recado(GI.mensagemErro(falha), 'erro'); }
        } else recado(GI.mensagemErro(err), 'erro');
      }
    } finally {
      if (g === geracao) {
        gravando = false; botaoResidencia();
        if ($('cp-r-confirmar')) $('cp-r-confirmar').disabled = false;
        if ($('cp-r-voltar')) $('cp-r-voltar').disabled = false;
      }
    }
  }
  $('cp-vincular-residencia').onclick = function () {
    if (gravando || impedimentoResidencia() || !contato) return;
    clearTimeout(timerResidencia); ++buscaResidencia; residencia = { etapa: 'buscar', fora: false }; recado('', 'info'); render();
  };
  function dado(rotulo, valor) {
    return valor == null || valor === '' || valor === '—' || valor === 'A definir' || valor === 'Não necessária' || valor === 'Não informada' || valor === 'Prazo não informado' || valor === 'Não vinculado' || rotulo === 'Orçamentos' && !valor ? '' : kv(rotulo, valor);
  }
  function renderChamados() {
    var todos = GI.cockpit.listar(lista(), filtro, busca, chat.id), rows = todos.slice(0, limiteLista);
    $('cp-conteudo').innerHTML = (locacoes.length > 1 ? '<label class="gi-cp-form">Imóvel dos chamados<select id="cp-filtro-imovel"><option value="">Todas</option>' + locacoes.map(function (l) { return '<option value="' + e(l.id) + '"' + (String(l.id) === filtroImovel ? ' selected' : '') + '>' + e(rotuloImovel(l)) + '</option>'; }).join('') + '</select></label>' : '') + '<div class="gi-cp-chips">' + ['abertos', 'todos', 'atrasados', 'aguardando'].map(function (k) { return '<button type="button" data-filtro="' + k + '" aria-pressed="' + (filtro === k) + '">' + ({ abertos: 'Abertos', todos: 'Todos', atrasados: 'Atrasados', aguardando: 'Aguardando' })[k] + '</button>'; }).join('') + '</div><label class="gi-cp-form">Buscar título ou O.S.<input id="cp-busca" type="search" value="' + e(busca) + '"></label>' + rows.map(function (c, i) {
      var status = valorMapa(GI.CHAMADO_STATUS, c.status) || 'Status não informado', at = c.atendimento, trilha = GI.chamadoTrilha(c.status);
      return '<details class="gi-cp-acc' + (c.prioridade === 'emergencia' && abertos(c) ? ' gi-cp-urgente' : '') + '" data-os-id="' + e(c.id) + '" data-chamado="' + i + '"' + (i === 0 && abertos(c) ? ' open' : '') + '><summary>' + resumoCartao(c) + '</summary><div class="gi-cp-detalhe"><div class="gi-cp-trilha" aria-label="Trilha de status">' + trilha.map(function (s) { return '<i title="' + e(s.rotulo) + '" class="' + (s.atual ? 'atual' : s.feito ? 'feito' : '') + '"></i>'; }).join('') + '</div>' + edicaoRapida(c) + (escrita() ? '<details class="gi-cp-info"><summary>Dados da O.S.</summary>' : '') + dado('Status', status) + dado('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, c.categoria) || 'Não informada') + dado('Aberto em', instante(c.criado_em)) + dado('Relato', c.descricao) + dado('Solicitante', c.solicitante && c.solicitante.nome) + dado('Atendimento', at ? (id(at.chat_id) ? '#' + id(at.chat_id) : at.protocolo || '') + (at.canal ? ' · ' + at.canal : '') : null) + dado('Atendente', c.atendente && c.atendente.nome) + dado('Quem paga', valorMapa({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária', indefinido: 'A definir' }, c.quem_paga) || 'A definir') + dado('Valor estimado', moeda(c.valor_estimado_centavos)) + dado('Prestador', c.prestador && c.prestador.nome) + dado('Orçamentos', numero(c.orcamentos_total)) + dado('Aprovação do proprietário', valorMapa({ pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada', nao_necessaria: 'Não necessária' }, (c.aprovacao || {}).status) || 'Não informada') + dado('Visita', instante((c.visita || {}).inicio)) + dado('Prazo de solução', instante((c.sla || {}).prazo_solucao_em)) + dado('Prazo', GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + (escrita() ? '</details>' : '') + '<div data-complemento="' + e(c.id) + '"></div><div class="gi-cp-acoes"><button class="btn" type="button" data-detalhes="' + e(c.id) + '">Fotos e observações</button>' + '<button class="btn btn-primario" type="button" data-gestao="' + i + '">Gestão</button>' + (administrador ? '<button class="btn btn-texto" type="button" data-lista-completa>Lista completa</button>' : '') + '<button class="btn" type="button" data-copiar="' + i + '">Copiar protocolo</button><button type="button" class="btn" data-copiar-os="' + i + '">Copiar nº da O.S.</button><button type="button" class="btn" data-resumo-copiar="' + i + '">⧉ Copiar resumo</button>' + (escrita() ? '<button type="button" class="btn" data-aviso="' + i + '">✉ Avisar cliente</button>' + (!GI.cockpit.ligado(c, chat.id) ? '<button type="button" class="btn" data-vincular="' + i + '">↔ Vincular este atendimento</button>' : '') : '') + '<button type="button" class="btn" data-voltar-lista>← Voltar</button></div><div data-acao aria-live="polite"></div></div></details>';
    }).join('') + (todos.length > limiteLista ? '<button type="button" class="btn" id="cp-mais">Mostrar mais 10</button>' : '') + (!rows.length ? '<p class="gi-cartao state">Nenhum chamado deste imóvel.</p>' : '') + (escrita() ? '<button type="button" class="btn btn-primario" id="cp-abrir">Abrir chamado</button>' : '') + '<p class="panel__note">Chamados de todas as residências do contato, inclusive os abertos por outras pessoas.</p>';
    if ($('cp-filtro-imovel')) $('cp-filtro-imovel').onchange = function () { filtroImovel = this.value; limiteLista = 10; cabecalho(); renderChamados(); };
    document.querySelectorAll('[data-filtro]').forEach(function (b) { b.onclick = function () { filtro = b.dataset.filtro; limiteLista = 10; cabecalho(); renderChamados(); }; });
    $('cp-busca').oninput = function () { var pos = this.selectionStart; busca = this.value; limiteLista = 10; renderChamados(); $('cp-busca').focus(); $('cp-busca').setSelectionRange(pos, pos); };
    if ($('cp-mais')) $('cp-mais').onclick = function () { limiteLista += 10; renderChamados(); };
    document.querySelectorAll('[data-chamado]').forEach(function (card, i) { ligarRapida(card, rows[i]); });
    document.querySelectorAll('[data-resumo-copiar]').forEach(function (b) { b.onclick = function () { copiarTexto(resumoTexto(rows[Number(b.dataset.resumoCopiar)]), b); }; });
    document.querySelectorAll('[data-aviso]').forEach(function (b) { b.onclick = function () { avisarCliente(b.closest('details'), rows[Number(b.dataset.aviso)]); }; });
    document.querySelectorAll('[data-vincular]').forEach(function (b) { b.onclick = function () { vincularAtendimento(b.closest('details'), rows[Number(b.dataset.vincular)], b); }; });
    document.querySelectorAll('[data-voltar-lista]').forEach(function (b) { b.onclick = function () { b.closest('details').open = false; b.closest('details').querySelector('summary').focus(); }; });
    document.querySelectorAll('details[data-chamado]').forEach(function (card) { card.addEventListener('toggle', function () { if (card.open) document.querySelectorAll('details[data-chamado]').forEach(function (outro) { if (outro !== card) outro.open = false; }); }); });
    ligarListaCompleta();
    if ($('cp-abrir')) $('cp-abrir').onclick = function () { mudarAba('novo'); };
    document.querySelectorAll('[data-detalhes]').forEach(function (b) { b.onclick = function () { carregarDetalhes(b); }; });
    document.querySelectorAll('[data-gestao]').forEach(function (b) { b.onclick = function () { abrirGestao(rows[Number(b.dataset.gestao)]); }; });
    document.querySelectorAll('[data-copiar-os]').forEach(function (b) { b.onclick = function () { copiarTexto(GI.chamadoNumero(rows[Number(b.dataset.copiarOs)].numero), b); }; });
    document.querySelectorAll('[data-copiar]').forEach(function (b) { b.onclick = function () { copiar(rows[Number(b.dataset.copiar)]); }; });
  }
  function resumoCartao(c) {
    var conhecido = Object.hasOwn(GI.CHAMADO_STATUS, c.status), imovel = locacoes.find(function (l) { return String(l.id) === String(c.locacao_id); }) || c.imovel || {};
    return '<span class="gi-cp-linha"><strong>' + e(GI.chamadoNumero(c.numero)) + '</strong><span class="gi-cp-pill gi-cp-status--' + (conhecido ? c.status : 'novo') + '">' + e(valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado') + '</span></span>' +
      (GI.cockpit.ligado(c, chat.id) ? '<span class="gi-cp-pill">Este atendimento</span>' : '') + '<span class="gi-cp-titulo">' + e(c.titulo) + '</span><span class="gi-cp-meta' + (GI.cockpit.atrasado(c) ? ' gi-cp-prazo-atrasado' : '') + '">' + e(valorMapa(GI.CHAMADO_PRIORIDADES, c.prioridade) || 'Prioridade não informada') + ' · ' + e(GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + '</span>' +
      (locacoes.length > 1 ? '<span class="gi-cp-meta">' + e(imovel.imovel_titulo ? rotuloImovel(imovel) : imovel.titulo) + '</span>' : '') + (c.prestador ? '<span class="gi-cp-meta">' + e(c.prestador.nome) + '</span>' : '') + (c.valor_estimado_centavos != null ? '<span class="gi-cp-meta">' + e(moeda(c.valor_estimado_centavos)) + '</span>' : '');
  }
  function resumoTexto(c) {
    var l = c.imovel || locacao() || {};
    return 'O.S.: ' + GI.chamadoNumero(c.numero) + '\nTítulo: ' + (c.titulo || '—') + '\nImóvel: ' + (l.titulo || l.imovel_titulo || '—') + '\nStatus: ' + (valorMapa(GI.CHAMADO_STATUS, c.status) || '—') + '\nPrazo: ' + GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') + '\nPrestador: ' + (c.prestador && c.prestador.nome || '—') + '\nValor: ' + moeda(c.valor_estimado_centavos);
  }
  function dataLocal(v) {
    var d = new Date(v);
    if (!v || !Number.isFinite(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function edicaoRapida(c) {
    if (!escrita()) return '';
    function select(k, label, mapa, atual) {
      return '<label>' + label + '<select data-rapida="' + k + '">' + Object.keys(mapa).map(function (chave) { return '<option value="' + e(chave) + '"' + (chave === atual ? ' selected' : '') + '>' + e(mapa[chave]) + '</option>'; }).join('') + '</select><span data-salvo="' + k + '" role="status"></span></label>';
    }
    return '<div class="gi-cp-form" data-edicao>' + select('status', 'Status', GI.statusDisponiveis(c.status), c.status) + '<p data-reabrir-ajuda' + (abertos(c) ? ' hidden' : '') + '>Reabrir volta o chamado para Triagem.</p>' + '<div data-cancelar-caixa hidden><p>Cancelar este chamado?</p><label>Motivo (opcional)<input data-cancelar-motivo maxlength="500"></label><button type="button" class="btn" data-cancelar-confirmar>Cancelar chamado</button><button type="button" class="btn" data-cancelar-voltar>Voltar</button></div>' +
      select('prioridade', 'Prioridade', GI.CHAMADO_PRIORIDADES, c.prioridade) + '<label>Atendente responsável<select data-rapida="atendente" disabled><option>Carregando…</option></select><span data-salvo="atendente" role="status"></span></label>' +
      select('quem_paga', 'Quem paga', { '': 'A definir', proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga || '') + '<label>Próxima visita<input type="datetime-local" data-rapida="visita" value="' + e(dataLocal((c.visita || {}).inicio)) + '"><span data-salvo="visita" role="status"></span></label></div>';
  }
  function erroRapido(err) { return GI.mensagemErro(err); }

  function atualizarCartao(card, c, r) {
    if (r && r.chamado) Object.assign(c, r.chamado);
    atualizadoEm = Date.now(); cabecalho(); card.querySelector('summary').innerHTML = resumoCartao(c);
    var valores = { Status: valorMapa(GI.CHAMADO_STATUS, c.status), Atendente: c.atendente && c.atendente.nome, 'Quem paga': valorMapa({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga), Visita: instante((c.visita || {}).inicio), Prazo: GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') };
    card.querySelectorAll('[data-kv]').forEach(function (linha) { if (Object.hasOwn(valores, linha.dataset.kv)) linha.lastElementChild.textContent = valores[linha.dataset.kv] || '—'; });
    var statusSelect = card.querySelector('[data-rapida="status"]');
    if (statusSelect) { statusSelect.innerHTML = Object.keys(GI.statusDisponiveis(c.status)).map(function (k) { return '<option value="' + e(k) + '">' + e(GI.statusDisponiveis(c.status)[k]) + '</option>'; }).join(''); statusSelect.value = c.status; card.querySelector('[data-reabrir-ajuda]').hidden = abertos(c); }
    var trilha = card.querySelector('.gi-cp-trilha');
    trilha.innerHTML = GI.chamadoTrilha(c.status).map(function (s) { return '<i title="' + e(s.rotulo) + '" class="' + (s.atual ? 'atual' : s.feito ? 'feito' : '') + '"></i>'; }).join('');
  }
  function ligarRapida(card, c) {
    var controles = card.querySelector('[data-edicao]');
    if (!controles) return;
    var g = geracao, contexto = chat, ocupado = false, mapaUsuarios = {};
    function atualControle(k) { return k === 'atendente' ? String((c.atendente || {}).user_id || '') : k === 'visita' ? dataLocal((c.visita || {}).inicio) : String(c[k] || ''); }
    function restaurar() { controles.querySelectorAll('[data-rapida]').forEach(function (b) { b.value = atualControle(b.dataset.rapida); }); }
    function bloquear(valor) { controles.querySelectorAll('input, select, button').forEach(function (b) { b.disabled = valor; }); }
    GI.usuarios().then(function (mapa) {
      if (g !== geracao || !card.isConnected) return;
      mapaUsuarios = Object.assign({}, mapa);
      if (c.atendente) mapaUsuarios[c.atendente.user_id] = c.atendente.nome;
      var sel = controles.querySelector('[data-rapida="atendente"]');
      sel.innerHTML = '<option value="">Sem atendente</option>' + Object.keys(mapaUsuarios).filter(function (n) { return id(n); }).map(function (n) { return '<option value="' + e(n) + '">' + e(mapaUsuarios[n]) + '</option>'; }).join('');
      sel.value = atualControle('atendente'); sel.disabled = ocupado;
    });
    async function gravar(k, valor, motivo) {
      if (ocupado || !escrita() || !card.isConnected) { restaurar(); return; }
      ocupado = true; bloquear(true);
      var mensagem = controles.querySelector('[data-salvo="' + k + '"]'); mensagem.textContent = 'Salvando…';
      controles.querySelector('[data-cancelar-caixa]').hidden = true;
      try {
        if (!await atual(g, contexto) || !card.isConnected) return;
        var dados = {}, r;
        if (demo()) { if (k === 'visita') c.visita = { inicio: valor ? new Date(valor).toISOString() : null }; else if (k === 'atendente') c.atendente = valor ? { user_id: Number(valor), nome: mapaUsuarios[valor] } : null; else c[k] = valor || null; r = { chamado: c }; }
        else if (k === 'status') r = await GI.chamadosStatus(c.id, valor, motivo);
        else if (k === 'visita') r = await GI.chamadosVisita(c.id, { inicio: valor ? new Date(valor).toISOString() : null, fim: (c.visita || {}).fim || null });
        else { dados[k] = k === 'atendente' ? (valor ? { user_id: Number(valor), nome: mapaUsuarios[valor] } : null) : valor || null; r = await GI.chamadosAtualizar(c.id, dados); }
        if (!await atual(g, contexto) || !card.isConnected) return;
        atualizarCartao(card, c, r); mensagem.textContent = '✓ salvo'; recado('✓ salvo', 'sucesso');
      } catch (err) { if (g === geracao && card.isConnected) { mensagem.textContent = erroRapido(err); recado(erroRapido(err), 'erro');
        if (err.dados && err.dados.erro === 'aprovacao_pendente') { var gestao = document.createElement('button'); gestao.type = 'button'; gestao.className = 'btn'; gestao.textContent = 'Gestão'; gestao.onclick = function () { abrirGestao(c); }; mensagem.appendChild(gestao); } } }
      finally { ocupado = false; if (g === geracao && card.isConnected) { restaurar(); bloquear(false); } }
    }
    controles.querySelectorAll('[data-rapida]').forEach(function (b) { b.onchange = function () {
      if (b.dataset.rapida === 'status' && b.value === 'cancelado') { controles.querySelector('[data-cancelar-caixa]').hidden = false; controles.querySelector('[data-cancelar-motivo]').focus(); return; }
      gravar(b.dataset.rapida, b.value);
    }; });
    controles.querySelector('[data-cancelar-voltar]').onclick = function () { controles.querySelector('[data-cancelar-caixa]').hidden = true; restaurar(); controles.querySelector('[data-rapida="status"]').focus(); };
    controles.querySelector('[data-cancelar-confirmar]').onclick = function () { gravar('status', 'cancelado', controles.querySelector('[data-cancelar-motivo]').value); };
  }
  async function vincularAtendimento(card, c, botao) {
    var g = geracao, contexto = chat, msg = card.querySelector('[data-acao]'); botao.disabled = true;
    try {
      if (!await atual(g, contexto) || !card.isConnected) return;
      var a = GI.atendimentoPortal(contexto, filasConhecidas);
      var r = demo() ? { chamado: Object.assign({}, c, { atendimento: a }) } : await GI.chamadosAtualizar(c.id, { atendimento: a });
      if (!await atual(g, contexto) || !card.isConnected) return;
      atualizarCartao(card, c, r); var primeiro = card.parentNode.querySelector('details[data-chamado]'); if (primeiro !== card) card.parentNode.insertBefore(card, primeiro); botao.hidden = true; msg.textContent = '✓ salvo · Este atendimento'; recado('Atendimento vinculado.', 'sucesso');
    } catch (err) { if (g === geracao && card.isConnected) { msg.textContent = erroRapido(err); recado(erroRapido(err), 'erro'); } }
    finally { if (card.isConnected) botao.disabled = false; }
  }
  function avisarCliente(card, c) {
    var alvo = card.querySelector('[data-acao]'), g = geracao, contexto = chat, enviado = null, notaInterna = null, ocupado = false;
    alvo.innerHTML = '<form class="gi-cp-form" data-aviso-form novalidate><label>Mensagem ao cliente<textarea data-aviso-texto maxlength="10000" required></textarea></label><p>Revise o texto antes de confirmar o envio nesta conversa.</p><div class="gi-cp-acoes"><button class="btn" type="submit">Confirmar envio</button><button class="btn" type="button" data-aviso-voltar>Voltar</button></div><p role="status" data-aviso-recado></p></form>';
    var campo = alvo.querySelector('textarea'), msg = alvo.querySelector('[data-aviso-recado]');
    campo.value = 'Olá! Sua O.S. ' + GI.chamadoNumero(c.numero) + ' (' + (c.titulo || '') + ') está em ' + (valorMapa(GI.CHAMADO_STATUS, c.status) || 'acompanhamento') + '. ' + GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') + '.';
    campo.focus();
    alvo.querySelector('[data-aviso-voltar]').onclick = function () { if (!ocupado) alvo.textContent = ''; };
    alvo.querySelector('form').onsubmit = async function (ev) {
      ev.preventDefault(); var texto = campo.value.trim(); if (ocupado || !escrita()) return; if (!texto) { recado('Escreva a mensagem antes de enviar.', 'erro'); campo.focus(); return; }
      ocupado = true; alvo.querySelectorAll('button, textarea').forEach(function (b) { b.disabled = true; });
      try {
        if (!await atual(g, contexto) || !card.isConnected) return;
        if (enviado !== texto) {
          var aberto = demo() ? { id: contexto.id, contactId: contexto.contactId, status: 'active' } : await omni.chats.get(contexto.id);
          if (!await atual(g, contexto) || !card.isConnected) return;
          if (!GI.chatAberto(aberto, contexto.contactId)) { msg.textContent = 'Esta conversa não está mais aberta.'; recado(msg.textContent, 'erro'); return; }
          var envio = demo() ? { sent: true } : await omni.chats.sendMessage(contexto.id, { text: texto });
          if (!envio || envio.sent !== true) throw new Error('envio');
          enviado = texto;
        }
        if (!await atual(g, contexto) || !card.isConnected) return;
        if (!demo()) await GI.chamadosNota(c.id, { texto: texto, notificou_cliente: true });
        if (g === geracao && card.isConnected) { alvo.textContent = '✓ Cliente avisado e nota salva.'; recado(alvo.textContent, 'sucesso'); }
      } catch (err) {
        if (g !== geracao || !card.isConnected) return;
        if (err.code === 'forbidden' && enviado !== texto) {
          try {
            if (notaInterna !== texto && !demo()) await GI.chamadosNota(c.id, { texto: texto, notificou_cliente: false });
            if (!await atual(g, contexto) || !card.isConnected) return;
            notaInterna = texto; msg.textContent = 'Nota salva. O cliente não foi avisado porque a janela de 24 h fechou.';
          } catch (falha) { msg.textContent = 'O cliente não foi avisado. Não foi possível salvar a nota: ' + GI.mensagemErro(falha); }
        } else msg.textContent = enviado === texto ? 'Aviso enviado. Não foi possível salvar a nota; tente novamente.' : 'Não foi possível enviar o aviso. Tente novamente.';
        recado(msg.textContent, 'erro');
      } finally { ocupado = false; if (card.isConnected) alvo.querySelectorAll('button, textarea').forEach(function (b) { b.disabled = false; }); }
    };
  }
  function base64(v) { return typeof v === 'string' && v.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v); }
  async function carregarDetalhes(botao) {
    var g = geracao, c = chat, n = id(botao.dataset.detalhes), alvo = botao.closest('details').querySelector('[data-complemento]');
    botao.disabled = true; alvo.textContent = 'Carregando fotos e observações…';
    function valido() { return g === geracao && alvo.isConnected; }
    try {
      var d = demo() ? { chamado: {}, anexos: [], eventos: [] } : await GI.chamadosObter(n);
      if (!await atual(g, c) || !valido()) return;
      alvo.innerHTML = '<div class="gi-cp-fotos" data-fotos></div><div data-foto-inteira hidden><button type="button" class="btn" data-fechar-foto>Fechar foto</button><div data-imagem></div></div><h2>Observações</h2><div data-observacoes></div>' +
        (escrita() && !demo() ? '<form class="gi-cp-form" data-nota-form novalidate><label>Nota para a equipe<textarea data-nota maxlength="10000" required></textarea></label><label class="gi-cp-check"><input type="checkbox" data-avisar>Avisar o cliente nesta conversa</label><button type="submit" class="btn" data-salvar-nota>Salvar nota</button><div data-confirmacao-nota hidden><p data-aviso-texto></p><button type="button" class="btn" data-voltar-nota>Voltar</button><button type="button" class="btn" data-confirmar-nota>Confirmar aviso</button></div><p role="status" data-recado-nota></p></form>' : '<p class="panel__note">Somente consulta. Abertura e notas estão desligadas neste cockpit.</p>');
      function no(q) { return alvo.querySelector('[data-' + q + ']'); }
      function observacoes() {
        no('observacoes').textContent = '';
        var notas = (d.eventos || []).filter(function (ev) { return ev.tipo === 'nota'; });
        if (!notas.length) no('observacoes').textContent = 'Nenhuma observação.';
        notas.forEach(function (ev) {
          var p = document.createElement('p'); p.textContent = (ev.autor || 'Equipe') + ' · ' + instante(ev.em) + ': ' + (ev.texto || '') + (ev.notificou_cliente ? ' · Cliente avisado' : '');
          no('observacoes').appendChild(p);
        });
      }
      observacoes();
      if (!(d.anexos || []).length) no('fotos').textContent = 'Nenhuma foto anexada.';
      (d.anexos || []).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = a.nome || 'Foto';
        no('fotos').appendChild(b);
        function imagem(url) { var img = document.createElement('img'); img.alt = a.nome || 'Foto'; img.src = url; return img; }
        if (base64(a.miniatura_base64)) b.prepend(imagem('data:image/jpeg;base64,' + a.miniatura_base64));
        b.onclick = async function () {
          b.disabled = true;
          try {
            var r = a.origem === 'upload' ? await GI.chamadosAnexoArquivo(n, a.id) : await omni.chats.getFile(a.file_ref);
            if (!await atual(g, c) || !valido()) return;
            var url = a.origem === 'upload' && /^image\/(jpeg|png|webp|gif)$/.test(r.mimetype) && base64(r.dados_base64) ? 'data:' + r.mimetype + ';base64,' + r.dados_base64 : a.origem !== 'upload' && r.url;
            if (!url || !/^(https?:|data:image\/)/i.test(url)) throw new Error('Foto indisponível.');
            no('imagem').textContent = ''; no('imagem').appendChild(imagem(url)); no('foto-inteira').hidden = false; no('fechar-foto').focus();
          } catch (err) { if (valido()) recado('Não foi possível abrir a foto. ' + err.message, 'erro'); }
          finally { if (valido()) b.disabled = false; }
        };
      });
      no('fechar-foto').onclick = function () { no('foto-inteira').hidden = true; };
      if (no('nota-form')) {
        var confirmado = null, enviado = null, salvando = false;
        function mensagem(t, tipo) { if (valido()) { no('recado-nota').textContent = t; recado(t, tipo); } }
        no('nota-form').onsubmit = function (ev) {
          ev.preventDefault(); if (salvando) return;
          var texto = no('nota').value.trim(); if (!texto) { mensagem('Escreva uma nota antes de salvar.', 'erro'); no('nota').focus(); return; }
          if (no('avisar').checked) {
            confirmado = texto; no('aviso-texto').textContent = 'Enviar nesta conversa: ' + texto; no('confirmacao-nota').hidden = false;
          } else salvar(texto, false);
        };
        no('voltar-nota').onclick = function () { confirmado = null; no('confirmacao-nota').hidden = true; };
        no('confirmar-nota').onclick = function () {
          if (confirmado !== no('nota').value.trim() || !no('avisar').checked) { confirmado = null; no('confirmacao-nota').hidden = true; mensagem('A nota mudou. Revise o aviso novamente.', 'info'); return; }
          salvar(confirmado, true);
        };
        async function salvar(texto, avisar) {
          if (salvando || !escrita() || !valido()) return;
          salvando = true; no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = true; no('salvar-nota').textContent = 'Salvando nota…'; mensagem('Salvando nota…', 'info');
          try {
            if (!await atual(g, c) || !valido()) return;
            var falhaEnvio = '';
            if (avisar && enviado !== texto) {
              try {
                var aberto = await omni.chats.get(c.id);
                if (!await atual(g, c) || !valido()) return;
                if (!GI.chatAberto(aberto, c.contactId)) throw new Error('Esta conversa não está mais aberta.');
                var r = await omni.chats.sendMessage(c.id, { text: texto });
                if (r && r.sent === true) enviado = texto;
                if (!await atual(g, c) || !valido()) return;
                if (enviado !== texto) throw new Error('O envio não foi confirmado.');
              } catch (err) {
                if (!valido()) return;
                falhaEnvio = err.code === 'forbidden' ? 'janela de 24 h fechou.' : GI.mensagemErro(err);
              }
            }
            if (!await atual(g, c) || !valido()) return;
            var salvo = await GI.chamadosNota(n, { texto: texto, notificou_cliente: avisar && enviado === texto });
            if (!await atual(g, c) || !valido()) return;
            d.eventos.push(salvo.evento); observacoes(); no('nota').value = ''; no('avisar').checked = false; no('confirmacao-nota').hidden = true; confirmado = enviado = null;
            mensagem(falhaEnvio ? (falhaEnvio === 'janela de 24 h fechou.' ? 'Nota salva. O cliente não foi avisado porque a janela de 24 h fechou.' : 'Nota salva para a equipe. Cliente não avisado: ' + falhaEnvio) : 'Nota salva' + (avisar ? ' e cliente avisado.' : ' para a equipe.'), falhaEnvio ? 'erro' : 'sucesso');
            try {
              var relido = await GI.chamadosObter(n);
              if (!await atual(g, c) || !valido()) return;
              d = relido; observacoes();
            } catch (_) { mensagem('Nota salva. Não foi possível atualizar as observações; atualize o painel.' + (falhaEnvio ? ' Cliente não avisado: ' + falhaEnvio : ''), 'erro'); }
          } catch (err) { mensagem((enviado === texto ? 'Aviso enviado; ' : '') + 'não foi possível salvar a nota. Tente salvar novamente. ' + err.message, 'erro'); }
          finally { salvando = false; if (valido()) { no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = false; no('salvar-nota').textContent = 'Salvar nota'; } }
        }
      }
      botao.hidden = true;
    } catch (err) { if (valido()) { alvo.textContent = 'Não foi possível consultar. ' + GI.mensagemErro(err); recado(alvo.textContent, 'erro'); botao.disabled = false; } }
    GI.ajustarAltura();
  }
  function renderImovel() {
    var l = locacao();
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2>' + e(rotuloImovel(l)) + '</h2>' + kv('Código', l.imovel_codigo || 'Fora do catálogo') + kv('Endereço', l.imovel_endereco) + kv('Bairro', l.imovel_bairro) + kv('Cidade', l.imovel_cidade) + kv('Contrato', l.contrato_numero) + kv('Início', data(l.inicio)) + kv('Fim', data(l.fim)) + kv('Aluguel', moeda(l.valor_aluguel_centavos)) + (l.contatos || []).map(function (c) { return kv(papel(c.papel), c.nome) + (c.telefone ? '<button type="button" class="btn btn-texto" data-copia-texto="' + e(c.telefone) + '">' + e(c.telefone) + ' ⧉</button>' : ''); }).join('') + '<div class="gi-cp-acoes">' + [l.imovel_codigo, l.imovel_endereco].filter(Boolean).map(function (t) { return '<button type="button" class="btn" data-copia-texto="' + e(t) + '">' + e(t) + ' ⧉</button>'; }).join('') + (escrita() ? '<button type="button" class="btn" id="cp-abrir-imovel">Abrir chamado</button>' : '') + '</div></div>';
    document.querySelectorAll('[data-copia-texto]').forEach(function (b) { b.onclick = function () { copiarTexto(b.dataset.copiaTexto, b); }; });
    if ($('cp-abrir-imovel')) $('cp-abrir-imovel').onclick = function () { mudarAba('novo'); };
  }
  function rascunho() {
    if (!formulario) formulario = { titulo: '', descricao: '', categoria: 'hidraulica', prioridade: 'normal', disponibilidade: '', chaves: '', sem_cliente: false, anexos: [] };
    return formulario;
  }
  function vinculo() { return '#' + id(chat.id) + ' · ' + (GI.textoOuNull(chat.protocol) || 'Sem protocolo') + ' · ' + GI.canalAtendimento(chat.channel); }
  function rotuloImovel(l) { return l.imovel_titulo + (l.contrato_numero ? ' · Contrato ' + l.contrato_numero : ''); }
  function ligarEscolhaNovo() {
    if (!$('cp-novo-imovel')) return;
    $('cp-novo-imovel').onchange = function () {
      novoSelecionado = this.value !== '';
      if (novoSelecionado) selecionada = Number(this.value);
      formulario = confirmado = null; cabecalho(); renderNovo();
    };
  }
  function renderNovo() {
    if (!escrita()) { aba = 'chamados'; renderChamados(); return; }
    var escolha = locacoes.length > 1 ? '<label class="gi-cp-form">Escolha o imóvel para o novo chamado<select id="cp-novo-imovel"><option value="">Escolha o imóvel</option>' + locacoes.map(function (l, i) { return '<option value="' + i + '"' + (novoSelecionado && i === selecionada ? ' selected' : '') + '>' + e(rotuloImovel(l)) + '</option>'; }).join('') + '</select></label>' : '';
    if (locacoes.length > 1 && !novoSelecionado) { $('cp-conteudo').innerHTML = escolha; ligarEscolhaNovo(); return; }
    var f = rascunho();
    $('cp-conteudo').innerHTML = escolha + '<form id="cp-form" class="gi-cartao gi-cp-form" novalidate><div><span class="gi-cp-rotulo">Atendimento vinculado</span><p id="cp-vinculo"></p><span class="gi-cp-meta">O chamado fica ligado a esta conversa.</span></div>' + kv('Solicitante', contato.name) + '<h2 class="gi-cp-imovel-novo">' + e(rotuloImovel(locacao())) + '</h2>' + '<div><label for="cp-titulo">Título do chamado</label><input id="cp-titulo" placeholder="' + e('Reparo de ' + valorMapa(GI.CHAMADO_CATEGORIAS, f.categoria)) + '" maxlength="180" required aria-describedby="cp-titulo-erro" value="' + e(f.titulo) + '"><p id="cp-titulo-erro" role="alert" hidden>Informe o título do chamado.</p></div><fieldset><legend>O que aconteceu?</legend><div class="gi-cp-chips">' + Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) { return '<button type="button" data-categoria="' + c + '" aria-pressed="' + (f.categoria === c) + '">' + e(valorMapa(GI.CHAMADO_CATEGORIAS, c)) + '</button>'; }).join('') + '</div></fieldset><fieldset><legend>Urgência</legend><div class="gi-cp-chips">' + ['normal', 'alta', 'emergencia'].map(function (p) { return '<button type="button" data-prioridade="' + p + '" aria-pressed="' + (f.prioridade === p) + '">' + e(valorMapa(GI.CHAMADO_PRIORIDADES, p)) + '</button>'; }).join('') + '</div></fieldset><div><label for="cp-descricao">Descrição</label><textarea id="cp-descricao" maxlength="10000">' + e(f.descricao) + '</textarea><button type="button" class="btn" id="cp-ultima">Usar última mensagem do cliente</button><p id="cp-ultima-recado" aria-live="polite"></p></div><div><span class="gi-cp-rotulo">Fotos da conversa</span><div id="cp-fotos" aria-live="polite"></div></div><details id="cp-mais-detalhes"><summary>Mais detalhes</summary><div><label for="cp-disponibilidade">Quando dá para entrar</label><input id="cp-disponibilidade" maxlength="500" value="' + e(f.disponibilidade) + '"><label class="gi-cp-check"><input id="cp-sem-cliente" type="checkbox"' + (f.sem_cliente ? ' checked' : '') + '>Autoriza entrar sem o cliente</label></div><div><label for="cp-chaves">Chaves / acesso</label><input id="cp-chaves" maxlength="500" value="' + e(f.chaves) + '"></div></details><button class="btn btn-primario" id="cp-revisar" type="submit">Revisar e abrir chamado</button><p class="panel__note">Nada é gravado antes da confirmação.</p></form>';
    ligarEscolhaNovo();
    $('cp-ultima').onclick = async function () {
      var g = geracao, c = chat, botao = this; botao.disabled = true;
      try {
        var msgs = demo() ? [{ direction: 'in', text: 'Relato sintético de manutenção.' }] : linhas(await omni.chats.getMessages(c.id, { limit: 20 }));
        if (!await atual(g, c) || !$('cp-descricao')) return;
        var recebidas = msgs.filter(function (m) { return m.direction === 'in' && typeof m.text === 'string' && m.text.trim() && !m.deleted && !m.fileRef; }).sort(function (a, b) { return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0); });
        if (recebidas.length) { f.descricao = recebidas[0].text.slice(0, 10000); $('cp-descricao').value = f.descricao; $('cp-descricao').focus(); }
        else $('cp-ultima-recado').textContent = 'Nenhuma mensagem de texto do cliente.';
      } catch (_) { if (g === geracao && $('cp-ultima-recado')) $('cp-ultima-recado').textContent = 'Não foi possível ler as mensagens.'; }
      finally { if (botao.isConnected) botao.disabled = false; }
    };
    $('cp-vinculo').textContent = vinculo();
    ['titulo', 'descricao', 'disponibilidade', 'chaves'].forEach(function (k) { $('cp-' + k).oninput = function () { f[k] = this.value; if (k === 'titulo') { this.removeAttribute('aria-invalid'); $('cp-titulo-erro').hidden = true; recado('', 'info'); } }; });
    $('cp-sem-cliente').onchange = function () { f.sem_cliente = this.checked; };
    ['categoria', 'prioridade'].forEach(function (k) {
      document.querySelectorAll('[data-' + k + ']').forEach(function (b) { b.onclick = function () {
        f[k] = b.dataset[k]; if (k === 'categoria') $('cp-titulo').placeholder = 'Reparo de ' + valorMapa(GI.CHAMADO_CATEGORIAS, f.categoria); document.querySelectorAll('[data-' + k + ']').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      }; });
    });
    $('cp-form').onsubmit = function (ev) {
      ev.preventDefault(); recado('', 'info');
      if (!f.titulo.trim()) { $('cp-titulo-erro').hidden = false; $('cp-titulo').setAttribute('aria-invalid', 'true'); recado('Informe o título do chamado.', 'erro'); $('cp-titulo').focus(); return; }
      $('cp-titulo').removeAttribute('aria-invalid'); revisar();
    };
    renderFotos(); if (!fotosLidas) carregarFotos();
  }
  function renderFotos() {
    if (!$('cp-fotos')) return;
    $('cp-fotos').innerHTML = fotos.map(function (m, i) { return '<label class="gi-cp-check"><input type="checkbox" data-foto="' + i + '"' + (rascunho().anexos.indexOf(i) >= 0 ? ' checked' : '') + '>' + e(m.fileName || 'Foto ' + (i + 1)) + '</label>'; }).join('');
    if (!fotos.length) $('cp-fotos').textContent = fotosAviso || (fotosLidas ? 'Mostrando as últimas 50 mensagens da conversa. Nenhuma foto encontrada.' : 'Carregando fotos…');
    document.querySelectorAll('[data-foto]').forEach(function (b) {
      var m = fotos[Number(b.dataset.foto)], g = geracao;
      GI.filaArquivos(function () { return omni.chats.getFile(String(m.fileRef)); }).then(function (r) {
        if (g !== geracao || !b.isConnected || !r || !r.url) return;
        var url = new URL(r.url, location.href);
        if (!/^https?:$/.test(url.protocol) && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(r.url)) return;
        var img = document.createElement('img'); img.src = url.href; img.alt = m.fileName || 'Foto da conversa'; b.parentNode.appendChild(img);
      }).catch(function () {});
    });
    document.querySelectorAll('[data-foto]').forEach(function (b) { b.onchange = function () {
      var f = rascunho(), i = Number(b.dataset.foto); f.anexos = f.anexos.filter(function (n) { return n !== i; }); if (b.checked) f.anexos.push(i);
    }; });
  }
  async function carregarFotos() {
    var g = geracao, c = chat;
    fotosLidas = true;
    try {
      var r = demo() ? [] : await omni.chats.getMessages(c.id, { limit: 50 });
      if (!await atual(g, c)) return;
      fotos = linhas(r).filter(function (m) { return m.fileRef && /^image\//.test(m.mimetype || '') && !m.deleted && !m.viewOnce; });
    } catch (_) { if (g !== geracao) return; fotosAviso = 'Fotos indisponíveis. Atualize o painel para tentar novamente.'; recado(fotosAviso, 'erro'); }
    if (g === geracao && aba === 'novo' && !confirmado) renderFotos();
  }
  function revisar() {
    confirmado = { geracao: geracao, chat: chat, locacao: locacao(), contato: contato, dados: JSON.parse(JSON.stringify(rascunho())) };
    var f = confirmado.dados;
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2 id="cp-confirmacao-titulo" tabindex="-1">Confirme antes de abrir</h2>' + kv('Cliente', contato.name) + '<h2 class="gi-cp-imovel-novo">' + e(rotuloImovel(locacao())) + '</h2>' + kv('Atendimento', vinculo()) + kv('Título', f.titulo) + kv('Descrição', f.descricao) + kv('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, f.categoria)) + kv('Urgência', valorMapa(GI.CHAMADO_PRIORIDADES, f.prioridade)) + kv('Fotos', f.anexos.length) + kv('Acesso', f.disponibilidade) + kv('Sem o cliente', f.sem_cliente ? 'Autorizado' : 'Não autorizado') + kv('Chaves', f.chaves) + '<p class="gi-cp-meta">O portal calcula o SLA pela prioridade configurada.</p></div><div class="gi-cp-acoes"><button type="button" class="btn" id="cp-voltar">Voltar e editar</button><button type="button" class="btn btn-primario" id="cp-confirmar">Abrir chamado</button></div>';
    $('cp-voltar').onclick = function () { confirmado = null; renderNovo(); $('cp-titulo').focus(); };
    $('cp-confirmar').onclick = salvar;
    $('cp-confirmacao-titulo').focus();
  }
  async function salvar() {
    var plano = confirmado;
    if (!plano || gravando || !escrita()) return;
    gravando = true; $('cp-confirmar').textContent = 'Abrindo chamado…'; $('cp-confirmar').disabled = true; $('cp-voltar').disabled = true; recado('Abrindo chamado…', 'info');
    var g = plano.geracao, c = plano.chat, f = plano.dados;
    try {
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.', 'info'); }
        return;
      }
      var u = demo() ? { id: 9990, name: 'Agente Demonstração' } : await omni.session.getUser();
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.', 'info'); }
        return;
      }
      if (!u || !id(u.id)) throw new Error('Usuário da sessão indisponível. Tente novamente.');
      var d = { locacao_id: plano.locacao.id, titulo: f.titulo.trim(), descricao: f.descricao, categoria: f.categoria, prioridade: f.prioridade,
        origem: 'atendimento', solicitante: { contato_id: id(c.contactId), nome: GI.nomeContato(plano.contato, c), telefone: GI.textoOuNull(plano.contato.phone) },
        atendente: { user_id: id(u.id), nome: String(u.name || u.id) }, atendimento: GI.atendimentoPortal(c, filasConhecidas),
        acesso: { disponibilidade: f.disponibilidade, sem_cliente: f.sem_cliente, chaves: f.chaves },
        anexos: f.anexos.map(function (i) { var m = fotos[i]; return { file_ref: String(m.fileRef), nome: m.fileName, mimetype: m.mimetype, origem: 'atendimento' }; }) };
      var r;
      if (demo()) { r = { chamado: Object.assign({}, d, { id: 9001, numero: 9001, status: 'novo', sla: {} }) }; chamados.unshift(r.chamado); }
      else r = await GI.chamadosCriarSeguro(d);
      criacaoIncerta = null;
      if (!await atual(g, c)) return;
      // POST confirmado: mesmo se a releitura falhar, nunca reapresentar o botão de gravar.
      confirmado = null; formulario = null;
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-sucesso" id="cp-sucesso" role="status"><h2 tabindex="-1">' + e(GI.chamadoNumero(r.chamado.numero)) + ' aberta ✓</h2><p>' + (demo() ? 'Demonstração: chamado sintético, sem gravação.' : 'A equipe vê o chamado com o status Novo e este atendimento vinculado.') + '</p></div><div class="gi-cp-acoes">' + '<button class="btn" type="button" id="cp-ver-gestao">Gestão</button>' + (administrador ? '<button class="btn btn-texto" type="button" data-lista-completa>Lista completa</button>' : '') + '<button class="btn" type="button" id="cp-copiar-sucesso">Copiar protocolo</button><button class="btn" type="button" id="cp-copiar-os">Copiar nº da O.S.</button><button class="btn" type="button" id="cp-resumo-sucesso">Copiar resumo</button><button class="btn" type="button" id="cp-lista-sucesso">Voltar à lista</button></div>';
      $('cp-copiar-os').onclick = function () { copiarTexto(GI.chamadoNumero(r.chamado.numero), this); };
      $('cp-resumo-sucesso').onclick = function () { copiarTexto(resumoTexto(r.chamado), this); };
      $('cp-lista-sucesso').onclick = function () { mudarAba('chamados'); };
      ligarListaCompleta();
      if ($('cp-ver-gestao')) $('cp-ver-gestao').onclick = function () { abrirGestao(r.chamado); };
      $('cp-copiar-sucesso').onclick = function () { copiar(r.chamado); };
      recado(GI.chamadoNumero(r.chamado.numero) + ' aberta ✓', 'sucesso'); document.querySelector('#cp-sucesso h2').focus();
      try {
        var l = demo() ? { rows: locacoes } : await GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
        if (!await atual(g, c)) return;
        var ch = demo() ? { rows: chamados } : await GI.chamadosPorContato(c.contactId);
        if (!await atual(g, c)) return;
        locacoes = linhas(l); chamados = linhas(ch); cabecalho();
      } catch (_) { if (g === geracao) recado('Chamado aberto. Não foi possível atualizar a lista; consulte novamente.', 'erro'); }
    } catch (err) {
      if (g === geracao) {
        recado(GI.mensagemErro(err), 'erro');
        if ($('cp-confirmar')) {
          if (err.criacaoIncerta) {
            criacaoIncerta = { chatId: id(c.id), contatoId: id(c.contactId), titulo: f.titulo.trim() };
            $('cp-confirmar').disabled = false; $('cp-confirmar').textContent = 'Conferir se abriu'; $('cp-confirmar').onclick = conferirCriacaoIncerta;
            $('cp-voltar').disabled = false;
          } else { $('cp-confirmar').disabled = false; $('cp-confirmar').textContent = 'Tentar de novo'; $('cp-confirmar').onclick = salvar; $('cp-voltar').disabled = false; }
        }
      }
    } finally { if (g === geracao) gravando = false; }
  }
  async function conferirCriacaoIncerta() {
    if (!criacaoIncerta || gravando || GI.modo !== 'portal') return;
    var incerta = criacaoIncerta, g = geracao, contexto = { id: incerta.chatId, contactId: incerta.contatoId };
    if (!await atual(g, contexto) || criacaoIncerta !== incerta || gravando) return;
    gravando = true;
    var botao = $('cp-confirmar');
    if (botao) { botao.disabled = true; botao.textContent = 'Conferindo…'; }
    try {
      var resposta = await GI.chamadosPorContato(incerta.contatoId);
      if (!await atual(g, contexto) || criacaoIncerta !== incerta) return;
      var encontrado = linhas(resposta).filter(function (c) { return c.titulo === incerta.titulo && c.status !== 'concluido' && c.status !== 'cancelado'; })[0];
      if (encontrado) {
        criacaoIncerta = null; confirmado = null;
        if (botao) { botao.disabled = true; botao.textContent = GI.chamadoNumero(encontrado.numero) + ' aberta ✓'; }
        recado(GI.chamadoNumero(encontrado.numero) + ' aberta ✓', 'sucesso');
      } else {
        criacaoIncerta = null;
        if (botao) { botao.disabled = false; botao.textContent = 'Tentar de novo'; botao.onclick = salvar; }
        recado('Não encontramos o chamado. Você pode tentar abrir de novo.', 'erro');
      }
    } catch (_) {
      if (g !== geracao || criacaoIncerta !== incerta) return;
      if (botao) { botao.disabled = false; botao.textContent = 'Conferir se abriu'; }
      recado('Não foi possível conferir. Tente de novo.', 'erro');
    } finally { if (g === geracao) gravando = false; }
  }
  function ligarListaCompleta() {
    document.querySelectorAll('[data-lista-completa]').forEach(function (b) {
      b.onclick = function () { if (administrador) Promise.resolve().then(function () { return omni.ui.openContribution('gi-chamados'); }).catch(function () { recado('Não foi possível abrir a lista completa.', 'erro'); }); };
    });
  }
  function abrirGestao(c) {
    var g = geracao, l = locacao(), params = { chamadoId: id(c.id), contatoId: id(chat && chat.contactId) || id(contato && contato.id), locacaoId: id(c.locacao_id || l && l.id) };
    Promise.resolve().then(function () {
      return omni.storage.set('gi-os-alvo', { chamadoId: params.chamadoId, contatoId: params.contatoId, em: Date.now() });
    }).catch(function () { /* Os parâmetros continuam disponíveis se o storage falhar. */ }).then(function () {
      if (g !== geracao) return;
      return omni.ui.openContribution('gi-os', params);
    }).catch(function () { if (g === geracao) recado('Não foi possível abrir a gestão deste chamado. Atualize a extensão e tente de novo.', 'erro'); });
  }
  function copiar(c) { copiarTexto(c.atendimento && c.atendimento.protocolo || GI.chamadoNumero(c.numero)); }
  function copiarTexto(texto, botao) {
    var foco = document.activeElement, campo = document.createElement('textarea');
    campo.value = String(texto); campo.style.position = 'fixed'; campo.style.opacity = '0'; campo.setAttribute('aria-label', 'Texto para copiar'); document.body.appendChild(campo); campo.select();
    var copiado = false;
    try { copiado = document.execCommand('copy'); } catch (_) { /* O host pode negar cópia. */ }
    campo.remove(); if (foco && foco.isConnected) foco.focus();
    if (copiado) { if (botao) botao.textContent = '✓ Copiado'; recado('Copiado.', 'sucesso'); }
    else recado('Selecione para copiar: ' + texto, 'info');
  }
  function mudarAba(nova) { if (gravando || nova === 'novo' && !escrita()) return; if (nova === 'novo') novoSelecionado = false; aba = nova; confirmado = null; recado('', 'info'); render(); }
  $('cp-abas').onclick = function (ev) { var b = ev.target.closest('[data-aba]'); if (b) mudarAba(b.dataset.aba); };
  $('cp-abas').onkeydown = function (ev) {
    var botoes = Array.from(document.querySelectorAll('[data-aba]')), i = botoes.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault(); var n = ev.key === 'Home' ? 0 : ev.key === 'End' ? 2 : (i + (ev.key === 'ArrowRight' ? 1 : 2)) % 3;
    mudarAba(botoes[n].dataset.aba); botoes[n].focus();
  };
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.matches('[data-cancelar-motivo]')) { ev.preventDefault(); ev.target.closest('[data-cancelar-caixa]').querySelector('[data-cancelar-confirmar]').click(); return; }
    if (ev.key === 'Enter' && ev.target.matches('[data-rapida="visita"]')) { ev.preventDefault(); ev.target.dispatchEvent(new Event('change')); }
    if (ev.key !== 'Escape' || gravando) return;
    ev.preventDefault();
    var aberto = document.querySelector('[data-confirmacao-nota]:not([hidden])');
    if (aberto) { aberto.querySelector('[data-voltar-nota]').click(); return; }
    aberto = document.querySelector('[data-cancelar-caixa]:not([hidden]), [data-aviso-form]');
    if (aberto) { var voltar = aberto.querySelector('[data-cancelar-voltar], [data-aviso-voltar]'); if (voltar) voltar.click(); return; }
    if (confirmado && $('cp-voltar')) { $('cp-voltar').click(); return; }
    if (residencia) { residencia = null; render(); return; }
    if (aba === 'novo' || aba === 'imovel') { mudarAba('chamados'); return; }
    aberto = document.querySelector('details[data-chamado][open]');
    if (aberto) { aberto.open = false; aberto.querySelector('summary').focus(); }
  });
  $('cp-imovel').onchange = function () { if (gravando) { this.value = String(selecionada); return; } selecionada = Number(this.value); formulario = confirmado = null; cabecalho(); render(); };
  $('cp-atualizar').onclick = function () {
    if (gravando || Date.now() - ultimaAtualizacao < 5000) return;
    ultimaAtualizacao = Date.now(); this.disabled = true; this.title = 'Aguarde 5 segundos entre atualizações';
    $('cp-idade').textContent = 'Aguarde 5 segundos entre atualizações';
    atualizarTimer = setTimeout(function () { $('cp-atualizar').disabled = false; $('cp-atualizar').title = 'Atualizar consulta'; }, 5000);
    iniciar(true);
  };
  function trocarChat() {
    ++geracao; clearTimeout(temporizador); limpar(); estado('Carregando atendimento selecionado…');
    temporizador = setTimeout(iniciar, 400);
  }
  var desassinar, desassinarDestroy, destruido = false;
  function destruir() {
    if (destruido) return;
    destruido = true; ++geracao; clearTimeout(temporizador); clearTimeout(timerResidencia); clearTimeout(inicioTimer); clearTimeout(atualizarTimer); ++buscaResidencia; observer.disconnect(); fixo = true;
    if (typeof desassinar === 'function') desassinar();
    if (typeof desassinarDestroy === 'function') desassinarDestroy();
  }
  inicioTimer = setTimeout(falhaPainel, 20000);
  GI.pronto(function () {
    if (destruido) return;
    GI.manutencaoMostrarModo();
    if (demo()) $('gi-modo').textContent = 'DEMONSTRAÇÃO · dados sintéticos · sem rede nem gravação no portal.';
    if (window.omni && omni.on) {
      desassinar = omni.on('omniChatSelected', trocarChat);
      desassinarDestroy = omni.on('destroy', destruir);
    }
    if (!demo() && omni.queues && omni.queues.list) Promise.resolve().then(function () { return omni.queues.list(); }).then(function (r) { filasConhecidas = linhas(r); }).catch(function () {});
    return iniciar();
  });
  window.addEventListener('pagehide', destruir);
})();
