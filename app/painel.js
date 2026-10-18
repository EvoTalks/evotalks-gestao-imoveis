/* Cockpit do atendimento. O imóvel é o foco; o contato identifica as locações. */
(function () {
  'use strict';
  var e = GI.escapar, $ = function (id) { return document.getElementById(id); };
  var queryDemo = new URLSearchParams(location.search).get('demonstracao') === '1';
  function demo() { return queryDemo || GI.cfg('modoDemonstracao', false) === true; }
  function escrita() { return GI.cfg('cockpitAbreChamado', false) === true; }
  var geracao = 0, temporizador, chat = null, contato = null, locacoes = [], chamados = [], selecionada = 0;
  var aba = 'chamados', formulario = null, fotos = [], fotosLidas = false, fotosAviso = '', confirmado = null, gravando = false;
  var cache = new Map(), requisicoes = [], esperarAte = 0;
  var transporte = GI.chamarPortal;

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
    if (post && !escrita()) return Promise.reject(new Error('Abertura de chamados desligada neste cockpit.'));
    if (post && GI.modo !== 'portal') return Promise.reject(new Error('Manutenção exige o portal conectado.'));
    var agora = Date.now(), anterior = cache.get(rota);
    if (!post && anterior && agora - anterior.em < 60000) return anterior.promessa;
    requisicoes = requisicoes.filter(function (t) { return agora - t < 60000; });
    if (agora < esperarAte || requisicoes.length >= 30) return Promise.reject(limite());
    requisicoes.push(agora);
    var promessa = Promise.resolve().then(function () { return transporte(rota, op); }).catch(function (err) {
      cache.delete(rota);
      if (err.status === 429 || err.code === 'rate_limit' || /rate.limit/i.test(err.message)) { esperarAte = Date.now() + 60000; throw limite(); }
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

  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function id(v) { var n = numero(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function linhas(r) { return Array.isArray(r) ? r : r && Array.isArray(r.rows) ? r.rows : []; }
  function locacao() { return locacoes[selecionada]; }
  function abertos(c) { return c.status !== 'concluido' && c.status !== 'cancelado'; }
  function lista() { return chamados.filter(function (c) { return String(c.locacao_id) === String(locacao() && locacao().id); }); }
  function papel(v) { return ({ locatario: 'LOCATÁRIO', proprietario: 'PROPRIETÁRIO', fiador: 'FIADOR', outro: 'OUTRO' })[v] || 'CONTATO'; }
  function moeda(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function data(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—'; }
  function instante(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('pt-BR') : '—'; }
  function kv(rotulo, valor) { return '<div class="gi-cp-kv"><span>' + e(rotulo) + '</span><span>' + e(valor == null || valor === '' ? '—' : valor) + '</span></div>'; }
  function recado(t) { $('cp-recado').textContent = t || ''; }
  function estado(t, tentar) {
    $('cp-conteudo').innerHTML = '<div class="gi-cartao state"><p id="cp-estado"></p>' + (tentar ? '<button type="button" class="btn" id="cp-tentar">Tentar novamente</button>' : '') + '</div>';
    $('cp-estado').textContent = t;
    $('cp-conteudo').setAttribute('aria-busy', t.indexOf('Carregando') === 0 ? 'true' : 'false');
    if (tentar) $('cp-tentar').onclick = function () { iniciar(); };
  }
  async function atual(g, c) {
    if (g !== geracao) return false;
    if (demo()) return true;
    var s = await omni.chats.getSelected();
    return g === geracao && !!s && String(s.id) === String(c.id) && String(s.contactId) === String(c.contactId);
  }
  function limpar() {
    chat = contato = null; locacoes = []; chamados = []; selecionada = 0; formulario = confirmado = null;
    fotos = []; fotosLidas = false; fotosAviso = ''; aba = 'chamados'; gravando = false;
    $('cp-abas').hidden = true; $('cp-selecao').hidden = true;
    $('cp-nome').textContent = 'Contato do atendimento'; $('cp-contexto').textContent = ''; $('cp-resumo').textContent = ''; recado('');
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
  async function iniciar() {
    var g = ++geracao;
    limpar(); estado('Carregando contato, imóvel e chamados…');
    $('cp-demo').hidden = !demo();
    if (demo()) { dadosDemo(); cabecalho(); render(); return; }
    if (GI.modo !== 'portal') {
      estado('Manutenção exige o portal conectado. ' + (GI.portalErro || ''), true);
      $('cp-tentar').onclick = async function () { await GI.definirModo(); if (g === geracao) { GI.manutencaoMostrarModo(); iniciar(); } };
      return;
    }
    try {
      var c = await omni.chats.getSelected();
      if (g !== geracao) return;
      if (!c || !id(c.contactId)) { estado(c ? 'Sem contato vinculado ao atendimento. Vincule um contato para consultar a manutenção.' : 'Nenhum atendimento selecionado. Abra uma conversa para consultar a manutenção.'); return; }
      var pessoa = await omni.contacts.get(c.contactId);
      if (!await atual(g, c)) return;
      var lr = await GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
      if (!await atual(g, c)) return;
      var cr = await GI.chamadosPorContato(c.contactId);
      if (!await atual(g, c)) return;
      chat = c; contato = pessoa; locacoes = linhas(lr); chamados = linhas(cr);
      cabecalho(); render();
    } catch (err) { if (g === geracao) estado(err.message || 'Não foi possível consultar a manutenção.', true); }
  }
  function cabecalho() {
    var l = locacao(), rows = lista();
    $('cp-nome').textContent = contato.name || 'Contato do atendimento';
    $('cp-contexto').innerHTML = '<span class="panel__tax-id">' + e(GI.mascaraDocumento(contato.document)) + '</span><span class="gi-cp-pill">' + e(papel(l && l.papel_do_contato)) + '</span>';
    $('cp-resumo').innerHTML = rows.filter(abertos).length + ' abertos · ' + rows.filter(function (c) { return c.status === 'concluido'; }).length + ' concluídos · <em class="panel__updated">atualizado às ' + e(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + '</em>';
    $('cp-selecao').hidden = locacoes.length < 2;
    $('cp-imovel').innerHTML = locacoes.map(function (l, i) { return '<option value="' + i + '">' + e(l.imovel_titulo) + '</option>'; }).join('');
    $('cp-imovel').value = String(selecionada);
    $('cp-abas').hidden = !l;
    $('cp-tab-chamados').textContent = 'Chamados (' + rows.length + ')';
  }
  function render() {
    if (!locacao()) { estado('Nenhum imóvel locado vinculado a este contato. Cadastre a locação na gestão.'); return; }
    $('cp-conteudo').setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-aba]').forEach(function (b) { var ativo = b.dataset.aba === aba; b.setAttribute('aria-selected', String(ativo)); b.tabIndex = ativo ? 0 : -1; });
    $('cp-conteudo').setAttribute('aria-labelledby', 'cp-tab-' + aba);
    if (aba === 'chamados') renderChamados();
    else if (aba === 'imovel') renderImovel();
    else renderNovo();
    GI.ajustarAltura();
  }
  function renderChamados() {
    var prioridade = { emergencia: 0, alta: 1, normal: 2 };
    function urgencia(c) {
      var prazo = GI.chamadoPrazo(c);
      return prazo === 'Responder já' || prazo.indexOf('Atrasado') === 0 ? 0 : c.sla && c.sla.pausado ? 2 : 1;
    }
    var rows = lista().slice().sort(function (a, b) { return Number(!abertos(a)) - Number(!abertos(b)) || (prioridade[a.prioridade] ?? 3) - (prioridade[b.prioridade] ?? 3) || urgencia(a) - urgencia(b) || numero(b.numero) - numero(a.numero); });
    $('cp-conteudo').innerHTML = rows.map(function (c, i) {
      var status = GI.CHAMADO_STATUS[c.status] || 'Status não informado', at = c.atendimento, trilha = GI.chamadoTrilha(c.status);
      return '<details class="gi-cp-acc' + (c.prioridade === 'emergencia' && abertos(c) ? ' gi-cp-urgente' : '') + '" data-chamado="' + i + '"' + (i === 0 && abertos(c) ? ' open' : '') + '><summary><span class="gi-cp-linha"><strong>' + e(GI.chamadoNumero(c.numero)) + '</strong><span class="gi-cp-pill gi-cp-status--' + (Object.hasOwn(GI.CHAMADO_STATUS, c.status) ? c.status : 'novo') + '">' + e(status) + '</span></span><span class="gi-cp-titulo">' + e(c.titulo) + '</span><span class="gi-cp-meta">' + e(GI.CHAMADO_PRIORIDADES[c.prioridade] || 'Prioridade não informada') + ' · ' + e(GI.chamadoPrazo(c)) + '</span></summary><div class="gi-cp-detalhe"><div class="gi-cp-trilha" aria-label="Trilha de status">' + trilha.map(function (s) { return '<i title="' + e(s.rotulo) + '" class="' + (s.atual ? 'atual' : s.feito ? 'feito' : '') + '"></i>'; }).join('') + '</div>' + kv('Status', status) + kv('Categoria', GI.CHAMADO_CATEGORIAS[c.categoria] || 'Não informada') + kv('Aberto em', instante(c.criado_em)) + kv('Relato', c.descricao) + kv('Solicitante', c.solicitante && c.solicitante.nome) + kv('Atendimento', at ? '#' + (id(at.chat_id) || '—') + ' · ' + (at.canal || '—') : 'Não vinculado') + kv('Atendente', c.atendente && c.atendente.nome) + kv('Quem paga', ({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária', indefinido: 'A definir' })[c.quem_paga] || 'A definir') + kv('Valor estimado', moeda(c.valor_estimado_centavos)) + kv('Prestador', c.prestador && c.prestador.nome) + kv('Orçamentos', numero(c.orcamentos_total)) + kv('Aprovação do proprietário', ({ pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada', nao_necessaria: 'Não necessária' })[(c.aprovacao || {}).status] || 'Não informada') + kv('Visita', instante((c.visita || {}).inicio)) + kv('Prazo de solução', instante((c.sla || {}).prazo_solucao_em)) + kv('SLA', GI.chamadoPrazo(c)) + '<div class="gi-cp-acoes"><button class="btn btn-primario" type="button" data-gestao="' + i + '">Abrir na gestão</button><button class="btn" type="button" data-copiar="' + i + '">Copiar protocolo</button></div></div></details>';
    }).join('') + (!rows.length ? '<p class="gi-cartao state">Nenhum chamado deste imóvel.</p>' : '') + '<button type="button" class="btn btn-primario" id="cp-abrir">Abrir chamado</button><p class="panel__note">Chamados da locação selecionada, inclusive os abertos por outras pessoas.</p>';
    $('cp-abrir').onclick = function () { mudarAba('novo'); };
    document.querySelectorAll('[data-gestao]').forEach(function (b) { b.onclick = function () { abrirGestao(rows[Number(b.dataset.gestao)]); }; });
    document.querySelectorAll('[data-copiar]').forEach(function (b) { b.onclick = function () { copiar(rows[Number(b.dataset.copiar)]); }; });
  }
  function renderImovel() {
    var l = locacao();
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2>' + e(l.imovel_titulo) + '</h2>' + kv('Código', l.imovel_codigo || 'Fora do catálogo') + kv('Endereço', l.imovel_endereco) + kv('Bairro', l.imovel_bairro) + kv('Cidade', l.imovel_cidade) + kv('Contrato', l.contrato_numero) + kv('Início', data(l.inicio)) + kv('Fim', data(l.fim)) + kv('Aluguel', moeda(l.valor_aluguel_centavos)) + (l.contatos || []).map(function (c) { return kv(papel(c.papel), c.nome + (c.telefone ? ' · ' + c.telefone : '')); }).join('') + '</div>';
  }
  function rascunho() {
    if (!formulario) formulario = { titulo: '', descricao: '', categoria: 'hidraulica', prioridade: 'normal', disponibilidade: '', chaves: '', sem_cliente: false, anexos: [] };
    return formulario;
  }
  function vinculo() { return '#' + id(chat.id) + ' · ' + (chat.protocol || 'Sem protocolo') + ' · ' + (chat.channel || 'Canal não informado'); }
  function renderNovo() {
    if (!escrita()) { $('cp-conteudo').innerHTML = '<p class="gi-cartao state">Abertura de chamados desligada neste cockpit. Peça ao administrador para habilitar a opção de abertura.</p>'; return; }
    var f = rascunho();
    $('cp-conteudo').innerHTML = '<form id="cp-form" class="gi-cartao gi-cp-form"><div><span class="gi-cp-rotulo">Atendimento vinculado</span><p id="cp-vinculo"></p><span class="gi-cp-meta">O chamado fica ligado a esta conversa.</span></div>' + kv('Solicitante', contato.name) + kv('Imóvel', locacao().imovel_titulo) + '<div><label for="cp-titulo">Título do chamado</label><input id="cp-titulo" maxlength="180" required value="' + e(f.titulo) + '"></div><fieldset><legend>O que aconteceu?</legend><div class="gi-cp-chips">' + Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) { return '<button type="button" data-categoria="' + c + '" aria-pressed="' + (f.categoria === c) + '">' + e(GI.CHAMADO_CATEGORIAS[c]) + '</button>'; }).join('') + '</div></fieldset><fieldset><legend>Urgência</legend><div class="gi-cp-chips">' + ['normal', 'alta', 'emergencia'].map(function (p) { return '<button type="button" data-prioridade="' + p + '" aria-pressed="' + (f.prioridade === p) + '">' + e(GI.CHAMADO_PRIORIDADES[p]) + '</button>'; }).join('') + '</div></fieldset><div><label for="cp-descricao">Descrição</label><textarea id="cp-descricao" maxlength="10000">' + e(f.descricao) + '</textarea></div><div><span class="gi-cp-rotulo">Fotos da conversa</span><div id="cp-fotos" aria-live="polite"></div></div><div><label for="cp-disponibilidade">Quando dá para entrar</label><input id="cp-disponibilidade" maxlength="500" value="' + e(f.disponibilidade) + '"><label class="gi-cp-check"><input id="cp-sem-cliente" type="checkbox"' + (f.sem_cliente ? ' checked' : '') + '>Autoriza entrar sem o cliente</label></div><div><label for="cp-chaves">Chaves / acesso</label><input id="cp-chaves" maxlength="500" value="' + e(f.chaves) + '"></div><button class="btn btn-primario" id="cp-revisar" type="submit">Revisar e abrir chamado</button><p class="panel__note">Nada é gravado antes da confirmação.</p></form>';
    $('cp-vinculo').textContent = vinculo();
    ['titulo', 'descricao', 'disponibilidade', 'chaves'].forEach(function (k) { $('cp-' + k).oninput = function () { f[k] = this.value; }; });
    $('cp-sem-cliente').onchange = function () { f.sem_cliente = this.checked; };
    ['categoria', 'prioridade'].forEach(function (k) {
      document.querySelectorAll('[data-' + k + ']').forEach(function (b) { b.onclick = function () {
        f[k] = b.dataset[k]; document.querySelectorAll('[data-' + k + ']').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      }; });
    });
    $('cp-form').onsubmit = function (ev) { ev.preventDefault(); if (f.titulo.trim()) revisar(); };
    renderFotos(); if (!fotosLidas) carregarFotos();
  }
  function renderFotos() {
    if (!$('cp-fotos')) return;
    $('cp-fotos').innerHTML = fotos.map(function (m, i) { return '<label class="gi-cp-check"><input type="checkbox" data-foto="' + i + '"' + (rascunho().anexos.indexOf(i) >= 0 ? ' checked' : '') + '>' + e(m.fileName || 'Foto ' + (i + 1)) + '</label>'; }).join('');
    if (!fotos.length) $('cp-fotos').textContent = fotosAviso || (fotosLidas ? 'Nenhuma foto nesta conversa. Anexe depois, na gestão.' : 'Carregando fotos…');
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
    } catch (_) { if (g !== geracao) return; fotosAviso = 'Fotos indisponíveis. Você pode anexar depois, na gestão.'; }
    if (g === geracao && aba === 'novo' && !confirmado) renderFotos();
  }
  function revisar() {
    confirmado = { geracao: geracao, chat: chat, locacao: locacao(), contato: contato, dados: JSON.parse(JSON.stringify(rascunho())) };
    var f = confirmado.dados;
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2 id="cp-confirmacao-titulo" tabindex="-1">Confirme antes de abrir</h2>' + kv('Cliente', contato.name) + kv('Imóvel', locacao().imovel_titulo) + kv('Atendimento', vinculo()) + kv('Título', f.titulo) + kv('Descrição', f.descricao) + kv('Categoria', GI.CHAMADO_CATEGORIAS[f.categoria]) + kv('Urgência', GI.CHAMADO_PRIORIDADES[f.prioridade]) + kv('Fotos', f.anexos.length) + kv('Acesso', f.disponibilidade) + kv('Sem o cliente', f.sem_cliente ? 'Autorizado' : 'Não autorizado') + kv('Chaves', f.chaves) + '<p class="gi-cp-meta">O portal calcula o SLA pela prioridade configurada.</p><label class="gi-cp-check"><input type="checkbox" id="cp-conferi">Conferi os dados com o cliente</label></div><div class="gi-cp-acoes"><button type="button" class="btn" id="cp-voltar">Voltar e editar</button><button type="button" class="btn btn-primario" id="cp-confirmar" disabled>Abrir chamado</button></div>';
    $('cp-conferi').onchange = function () { $('cp-confirmar').disabled = !this.checked; };
    $('cp-voltar').onclick = function () { confirmado = null; renderNovo(); $('cp-titulo').focus(); };
    $('cp-confirmar').onclick = salvar;
    $('cp-confirmacao-titulo').focus();
  }
  async function salvar() {
    var plano = confirmado;
    if (!plano || gravando || !escrita() || !$('cp-conferi').checked) return;
    gravando = true; $('cp-confirmar').disabled = true; $('cp-voltar').disabled = true; recado('Abrindo chamado…');
    var g = plano.geracao, c = plano.chat, f = plano.dados;
    try {
      if (!await atual(g, c)) return;
      var u = demo() ? { id: 9990, name: 'Agente Demonstração' } : await omni.session.getUser();
      if (!await atual(g, c)) return;
      if (!u || !id(u.id)) throw new Error('Usuário da sessão indisponível. Tente novamente.');
      var d = { locacao_id: plano.locacao.id, titulo: f.titulo.trim(), descricao: f.descricao, categoria: f.categoria, prioridade: f.prioridade,
        origem: 'atendimento', solicitante: { contato_id: c.contactId, nome: plano.contato.name, telefone: plano.contato.phone || null },
        atendente: { user_id: u.id, nome: u.name || String(u.id) }, atendimento: { chat_id: c.id, protocolo: c.protocol || null, canal: c.channel || null, fila: c.queueId == null ? null : String(c.queueId), iniciado_em: c.startedAt || null },
        acesso: { disponibilidade: f.disponibilidade, sem_cliente: f.sem_cliente, chaves: f.chaves },
        anexos: f.anexos.map(function (i) { var m = fotos[i]; return { file_ref: m.fileRef, nome: m.fileName, mimetype: m.mimetype, origem: 'atendimento' }; }) };
      var r;
      if (demo()) { r = { chamado: Object.assign({}, d, { id: 9001, numero: 9001, status: 'novo', sla: {} }) }; chamados.unshift(r.chamado); }
      else r = await GI.chamadosCriar(d);
      if (!await atual(g, c)) return;
      // POST confirmado: mesmo se a releitura falhar, nunca reapresentar o botão de gravar.
      confirmado = null; formulario = null;
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-sucesso" id="cp-sucesso" role="status"><h2 tabindex="-1">' + e(GI.chamadoNumero(r.chamado.numero)) + ' aberta</h2><p>A equipe vê o chamado com o status Novo e este atendimento vinculado.</p></div><div class="gi-cp-acoes"><button class="btn" type="button" id="cp-ver-gestao">Ver na gestão</button><button class="btn" type="button" id="cp-copiar-sucesso">Copiar protocolo</button></div>';
      $('cp-ver-gestao').onclick = function () { abrirGestao(r.chamado); };
      $('cp-copiar-sucesso').onclick = function () { copiar(r.chamado); };
      document.querySelector('#cp-sucesso h2').focus(); recado('');
      try {
        var l = demo() ? { rows: locacoes } : await GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
        if (!await atual(g, c)) return;
        var ch = demo() ? { rows: chamados } : await GI.chamadosPorContato(c.contactId);
        if (!await atual(g, c)) return;
        locacoes = linhas(l); chamados = linhas(ch); cabecalho();
      } catch (_) { if (g === geracao) recado('Chamado aberto. Não foi possível atualizar a lista; consulte novamente.'); }
    } catch (err) {
      if (g === geracao) {
        var campos = err.dados && err.dados.campos;
        recado(campos ? Object.values(campos).join(' · ') : err.message);
        if ($('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; }
      }
    } finally { if (g === geracao) gravando = false; }
  }
  function abrirGestao(c) {
    var g = geracao, l = locacao();
    Promise.resolve().then(function () { return omni.ui.openContribution('gi-chamados', { chamadoId: id(c.id), locacaoId: id(l.id) }); }).catch(function (err) { if (g === geracao) recado(err.message); });
  }
  async function copiar(c) {
    var g = geracao, protocolo = c.atendimento && c.atendimento.protocolo || GI.chamadoNumero(c.numero);
    try { await navigator.clipboard.writeText(String(protocolo)); if (g === geracao) recado('Protocolo copiado.'); }
    catch (_) { if (g === geracao) recado('Protocolo: ' + protocolo + '. Selecione o texto para copiar.'); }
  }
  function mudarAba(nova) { if (gravando) return; aba = nova; confirmado = null; recado(''); render(); }
  $('cp-abas').onclick = function (ev) { var b = ev.target.closest('[data-aba]'); if (b) mudarAba(b.dataset.aba); };
  $('cp-abas').onkeydown = function (ev) {
    var botoes = Array.from(document.querySelectorAll('[data-aba]')), i = botoes.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault(); var n = ev.key === 'Home' ? 0 : ev.key === 'End' ? 2 : (i + (ev.key === 'ArrowRight' ? 1 : 2)) % 3;
    mudarAba(botoes[n].dataset.aba); botoes[n].focus();
  };
  $('cp-imovel').onchange = function () { if (gravando) { this.value = String(selecionada); return; } selecionada = Number(this.value); formulario = confirmado = null; cabecalho(); render(); };
  $('cp-atualizar').onclick = function () { if (!gravando) iniciar(); };
  function trocarChat() {
    ++geracao; clearTimeout(temporizador); limpar(); estado('Carregando atendimento selecionado…');
    temporizador = setTimeout(iniciar, 400);
  }
  var desassinar, desassinarDestroy, destruido = false;
  function destruir() {
    if (destruido) return;
    destruido = true; ++geracao; clearTimeout(temporizador); observer.disconnect(); fixo = true;
    if (typeof desassinar === 'function') desassinar();
    if (typeof desassinarDestroy === 'function') desassinarDestroy();
  }
  GI.pronto(function () {
    if (destruido) return;
    GI.manutencaoMostrarModo();
    if (demo()) $('gi-modo').textContent = 'DEMONSTRAÇÃO · dados sintéticos · sem rede nem gravação no portal.';
    if (window.omni && omni.on) {
      desassinar = omni.on('omniChatSelected', trocarChat);
      desassinarDestroy = omni.on('destroy', destruir);
    }
    return iniciar();
  });
  window.addEventListener('pagehide', destruir);
})();
