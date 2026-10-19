/* Cockpit do atendimento. O imóvel é o foco; o contato identifica as locações. */
(function () {
  'use strict';
  var e = GI.escapar, $ = function (id) { return document.getElementById(id); };
  var queryDemo = new URLSearchParams(location.search).get('demonstracao') === '1';
  function demo() { return queryDemo || GI.cfg('modoDemonstracao', false) === true; }
  function escrita() { return GI.cfg('cockpitAbreChamado', false) === true; }
  var geracao = 0, temporizador, chat = null, contato = null, locacoes = [], chamados = [], selecionada = 0;
  var aba = 'chamados', formulario = null, fotos = [], fotosLidas = false, fotosAviso = '', confirmado = null, gravando = false;
  var administrador = false, residencia = null, timerResidencia, buscaResidencia = 0;
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
    if (post && rota !== '/locacoes' && !escrita()) return Promise.reject(new Error('Abertura de chamados desligada neste cockpit.'));
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

  function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function id(v) { var n = numero(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function linhas(r) { return Array.isArray(r) ? r : r && Array.isArray(r.rows) ? r.rows : []; }
  function locacao() { return locacoes[selecionada]; }
  function abertos(c) { return c.status !== 'concluido' && c.status !== 'cancelado'; }
  function lista() { return chamados.filter(function (c) { return String(c.locacao_id) === String(locacao() && locacao().id); }); }
  function papel(v) { return valorMapa({ locatario: 'LOCATÁRIO', proprietario: 'PROPRIETÁRIO', fiador: 'FIADOR', outro: 'OUTRO' }, v) || 'CONTATO'; }
  function moeda(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function data(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—'; }
  function instante(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('pt-BR') : '—'; }
  function kv(rotulo, valor) { return '<div class="gi-cp-kv"><span>' + e(rotulo) + '</span><span>' + e(valor == null || valor === '' ? '—' : valor) + '</span></div>'; }
  function recado(t) { $('cp-recado').textContent = t || ''; }
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
  async function iniciar(forcar) {
    if (forcar) cache.clear();
    var g = ++geracao;
    limpar(); estado('Carregando contato, imóvel e chamados…');
    $('cp-demo').hidden = !demo();
    if (demo()) { dadosDemo(); cabecalho(); render(); return; }
    if (GI.modo !== 'portal') {
      botaoResidencia();
      estado('Manutenção exige o portal conectado. ' + (GI.portalErro || ''), true);
      $('cp-tentar').onclick = async function () { await GI.definirModo(); if (g === geracao) { GI.manutencaoMostrarModo(); iniciar(true); } };
      return;
    }
    try {
      var c = await omni.chats.getSelected();
      if (g !== geracao) return;
      if (!c || !id(c.contactId)) { estado(c ? 'Sem contato vinculado ao atendimento. Vincule um contato para consultar a manutenção.' : 'Nenhum atendimento selecionado. Abra uma conversa para consultar a manutenção.'); return; }
      var permissoes = await omni.session.getPermissions();
      if (!await atual(g, c)) return;
      administrador = !!(permissoes && permissoes.isAdmin === true);
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
    $('cp-resumo').innerHTML = rows.filter(abertos).length + ' ' + GI.plural(rows.filter(abertos).length, 'aberto', 'abertos') + ' · ' + rows.filter(function (c) { return c.status === 'concluido'; }).length + ' ' + GI.plural(rows.filter(function (c) { return c.status === 'concluido'; }).length, 'concluído', 'concluídos') + ' · <em class="panel__updated">atualizado às ' + e(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + '</em>';
    $('cp-selecao').hidden = locacoes.length < 2;
    $('cp-imovel').innerHTML = locacoes.map(function (l, i) { return '<option value="' + i + '">' + e(l.imovel_titulo) + '</option>'; }).join('');
    $('cp-imovel').value = String(selecionada);
    $('cp-abas').hidden = !l;
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
    if (r.etapa === 'confirmar') {
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-form"><p>Vincular <strong>' + e(r.imovel ? r.imovel.name : r.titulo) + '</strong> a <strong>' + e(contato.name) + '</strong>?</p>' +
        (r.contrato ? kv('Contrato', r.contrato) : '') + '<button type="button" class="btn btn-primario" id="cp-r-confirmar">Vincular</button><button type="button" class="btn" id="cp-r-voltar">Voltar</button></div>';
      $('cp-r-voltar').onclick = function () { if (!gravando) { r.etapa = 'buscar'; renderResidencia(); } };
      $('cp-r-confirmar').onclick = function () { gravarResidencia(r, g, c); };
      return;
    }
    $('cp-conteudo').innerHTML = '<form class="gi-cartao gi-cp-form" id="cp-r-form"><h2>Vincular residência</h2>' +
      (r.fora ? campoResidencia('titulo', 'Título do imóvel (obrigatório)') + campoResidencia('endereco', 'Endereço (opcional)') + campoResidencia('bairro', 'Bairro (opcional)') + campoResidencia('cidade', 'Cidade (opcional)') :
      '<div><label for="cp-r-busca">Buscar por código, título ou bairro</label><input type="search" id="cp-r-busca" value="' + e(r.termo || '') + '" autocomplete="off"></div><div id="cp-r-resultados" class="gi-cp-form" aria-live="polite"></div>') +
      '<button type="button" class="btn" id="cp-r-fora">' + (r.fora ? 'Buscar no catálogo' : 'Não está no catálogo') + '</button>' + campoResidencia('contrato', 'Contrato (opcional)') +
      (r.fora ? '<button type="submit" class="btn btn-primario">Revisar vínculo</button>' : '') + '<button type="button" class="btn" id="cp-r-cancelar">Voltar</button><p class="panel__note">Nada é gravado antes de Vincular.</p></form>';
    ['titulo', 'endereco', 'bairro', 'cidade', 'contrato'].forEach(function (k) {
      if ($('cp-r-' + k)) $('cp-r-' + k).oninput = function () { r[k] = this.value; };
    });
    $('cp-r-cancelar').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); residencia = null; recado(''); cabecalho(); render(); };
    $('cp-r-fora').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); r.fora = !r.fora; r.imovel = null; renderResidencia(); };
    $('cp-r-form').onsubmit = function (ev) {
      ev.preventDefault();
      if (!r.fora) return;
      if (!String(r.titulo || '').trim()) { recado('Informe o título do imóvel.'); return; }
      r.etapa = 'confirmar'; recado(''); renderResidencia();
    };
    function resultados() {
      if (!$('cp-r-resultados')) return;
      $('cp-r-resultados').innerHTML = (r.resultados || []).slice(0, 8).map(function (p, i) {
        return '<button type="button" class="btn" data-residencia="' + i + '">' + e(p.internalcode) + ' · ' + e(p.name) + '</button>';
      }).join('');
      $('cp-r-resultados').querySelectorAll('[data-residencia]').forEach(function (b) { b.onclick = function () {
        ++buscaResidencia; clearTimeout(timerResidencia); r.imovel = r.resultados[Number(b.dataset.residencia)]; r.etapa = 'confirmar'; recado(''); renderResidencia();
      }; });
    }
    if ($('cp-r-busca')) {
      resultados();
      $('cp-r-busca').oninput = function () {
        var termo = this.value.trim();
        if (termo === (r.termo || '')) return;
        r.termo = termo; r.resultados = []; resultados(); clearTimeout(timerResidencia); var v = ++buscaResidencia;
        if (!termo) return;
        timerResidencia = setTimeout(async function () {
          try {
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            var resposta = await GI.buscarImoveis({ termo: termo, porPagina: 8 });
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            r.resultados = resposta.itens.slice(0, 8); resultados();
            if (!r.resultados.length) $('cp-r-resultados').textContent = 'Nenhum imóvel encontrado. Você pode usar Não está no catálogo.';
          } catch (_) { if (g === geracao && residencia === r && v === buscaResidencia) recado('Não foi possível buscar os imóveis. Tente de novo.'); }
        }, 300);
      };
    }
  }
  async function gravarResidencia(r, g, c) {
    if (gravando || residencia !== r || impedimentoResidencia()) return;
    gravando = true; $('cp-r-confirmar').disabled = true; $('cp-r-voltar').disabled = true; botaoResidencia(); recado('Vinculando residência…');
    var gravou = false;
    try {
      if (!await atual(g, c) || residencia !== r) return;
      var dados = { contatos: [{ contato_id: id(c.contactId), nome: contato.name, telefone: contato.phone || null, papel: 'locatario' }] };
      if (r.imovel) dados.imovel_codigo = r.imovel.internalcode;
      else dados.imovel = { titulo: String(r.titulo || '').trim(), endereco: r.endereco || '', bairro: r.bairro || '', cidade: r.cidade || '' };
      if (String(r.contrato || '').trim()) dados.contrato_numero = r.contrato.trim();
      var salvo = await GI.locacoesCriar(dados); gravou = true;
      if (!await atual(g, c)) return;
      residencia = null;
      var lr = await GI.chamarPortal('/contatos/' + id(c.contactId) + '/locacoes');
      if (!await atual(g, c)) return;
      locacoes = linhas(lr);
      selecionada = Math.max(0, locacoes.findIndex(function (l) { return String(l.id) === String(salvo.locacao.id); }));
      aba = 'imovel'; cabecalho(); render(); recado('Residência vinculada.');
      var cr = await GI.chamadosPorContato(c.contactId);
      if (!await atual(g, c)) return;
      chamados = linhas(cr); cabecalho();
    } catch (err) {
      if (g !== geracao) return;
      if (gravou) { residencia = null; cabecalho(); render(); recado('Residência vinculada. Não foi possível atualizar a consulta. Use Atualizar para consultar o vínculo.'); }
      else {
        var d = err.dados || {};
        recado(d.erro === 'imovel_ja_locado' ? 'Este imóvel já está locado para outro cliente. Peça ao administrador para incluir este contato na locação.' :
          err.status === 422 && d.campos ? Object.keys(d.campos).map(function (k) { return d.campos[k]; }).join(' · ') : 'Não foi possível vincular a residência. Tente de novo.');
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
    clearTimeout(timerResidencia); ++buscaResidencia; residencia = { etapa: 'buscar', fora: false }; recado(''); render();
  };
  function dado(rotulo, valor) {
    return valor == null || valor === '' || valor === '—' || valor === 'A definir' || valor === 'Não necessária' || valor === 'Não informada' || valor === 'Prazo não informado' || valor === 'Não vinculado' || rotulo === 'Orçamentos' && !valor ? '' : kv(rotulo, valor);
  }
  function renderChamados() {
    var prioridade = { emergencia: 0, alta: 1, normal: 2 };
    function urgencia(c) {
      var prazo = GI.chamadoPrazo(c);
      return prazo === 'Responder já' || prazo.indexOf('Atrasado') === 0 ? 0 : c.sla && c.sla.pausado ? 2 : 1;
    }
    var rows = lista().slice().sort(function (a, b) { return Number(!abertos(a)) - Number(!abertos(b)) || (valorMapa(prioridade, a.prioridade) ?? 3) - (valorMapa(prioridade, b.prioridade) ?? 3) || urgencia(a) - urgencia(b) || numero(b.numero) - numero(a.numero); });
    $('cp-conteudo').innerHTML = rows.map(function (c, i) {
      var status = valorMapa(GI.CHAMADO_STATUS, c.status) || 'Status não informado', at = c.atendimento, trilha = GI.chamadoTrilha(c.status);
      return '<details class="gi-cp-acc' + (c.prioridade === 'emergencia' && abertos(c) ? ' gi-cp-urgente' : '') + '" data-chamado="' + i + '"' + (i === 0 && abertos(c) ? ' open' : '') + '><summary><span class="gi-cp-linha"><strong>' + e(GI.chamadoNumero(c.numero)) + '</strong><span class="gi-cp-pill gi-cp-status--' + (Object.hasOwn(GI.CHAMADO_STATUS, c.status) ? c.status : 'novo') + '">' + e(status) + '</span></span><span class="gi-cp-titulo">' + e(c.titulo) + '</span><span class="gi-cp-meta">' + e(valorMapa(GI.CHAMADO_PRIORIDADES, c.prioridade) || 'Prioridade não informada') + ' · ' + e(GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + '</span></summary><div class="gi-cp-detalhe"><div class="gi-cp-trilha" aria-label="Trilha de status">' + trilha.map(function (s) { return '<i title="' + e(s.rotulo) + '" class="' + (s.atual ? 'atual' : s.feito ? 'feito' : '') + '"></i>'; }).join('') + '</div>' + dado('Status', status) + dado('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, c.categoria) || 'Não informada') + dado('Aberto em', instante(c.criado_em)) + dado('Relato', c.descricao) + dado('Solicitante', c.solicitante && c.solicitante.nome) + dado('Atendimento', at ? (id(at.chat_id) ? '#' + id(at.chat_id) : at.protocolo || '') + (at.canal ? ' · ' + at.canal : '') : null) + dado('Atendente', c.atendente && c.atendente.nome) + dado('Quem paga', valorMapa({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária', indefinido: 'A definir' }, c.quem_paga) || 'A definir') + dado('Valor estimado', moeda(c.valor_estimado_centavos)) + dado('Prestador', c.prestador && c.prestador.nome) + dado('Orçamentos', numero(c.orcamentos_total)) + dado('Aprovação do proprietário', valorMapa({ pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada', nao_necessaria: 'Não necessária' }, (c.aprovacao || {}).status) || 'Não informada') + dado('Visita', instante((c.visita || {}).inicio)) + dado('Prazo de solução', instante((c.sla || {}).prazo_solucao_em)) + dado('Prazo', GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + '<div data-complemento="' + e(c.id) + '"></div><div class="gi-cp-acoes"><button class="btn" type="button" data-detalhes="' + e(c.id) + '">Fotos e observações</button>' + (administrador ? '<button class="btn btn-primario" type="button" data-gestao="' + i + '">Abrir na gestão</button>' : '') + '<button class="btn" type="button" data-copiar="' + i + '">Copiar protocolo</button></div></div></details>';
    }).join('') + (!rows.length ? '<p class="gi-cartao state">Nenhum chamado deste imóvel.</p>' : '') + '<button type="button" class="btn btn-primario" id="cp-abrir">Abrir chamado</button><p class="panel__note">Chamados da locação selecionada, inclusive os abertos por outras pessoas.</p>';
    $('cp-abrir').onclick = function () { mudarAba('novo'); };
    document.querySelectorAll('[data-detalhes]').forEach(function (b) { b.onclick = function () { carregarDetalhes(b); }; });
    document.querySelectorAll('[data-gestao]').forEach(function (b) { b.onclick = function () { abrirGestao(rows[Number(b.dataset.gestao)]); }; });
    document.querySelectorAll('[data-copiar]').forEach(function (b) { b.onclick = function () { copiar(rows[Number(b.dataset.copiar)]); }; });
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
        (escrita() && !demo() ? '<form class="gi-cp-form" data-nota-form><label>Nota para a equipe<textarea data-nota maxlength="10000" required></textarea></label><label class="gi-cp-check"><input type="checkbox" data-avisar>Avisar o cliente nesta conversa</label><button type="submit" class="btn" data-salvar-nota>Salvar nota</button><div data-confirmacao-nota hidden><p data-aviso-texto></p><button type="button" class="btn" data-voltar-nota>Voltar</button><button type="button" class="btn" data-confirmar-nota>Confirmar aviso</button></div><p role="status" data-recado-nota></p></form>' : '<p class="panel__note">Somente consulta. Abertura e notas estão desligadas neste cockpit.</p>');
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
          } catch (err) { if (valido()) recado('Não foi possível abrir a foto. ' + err.message); }
          finally { if (valido()) b.disabled = false; }
        };
      });
      no('fechar-foto').onclick = function () { no('foto-inteira').hidden = true; };
      if (no('nota-form')) {
        var confirmado = null, enviado = null, salvando = false;
        function mensagem(t) { if (valido()) no('recado-nota').textContent = t; }
        no('nota-form').onsubmit = function (ev) {
          ev.preventDefault(); if (salvando) return;
          var texto = no('nota').value.trim(); if (!texto) return;
          if (no('avisar').checked) {
            confirmado = texto; no('aviso-texto').textContent = 'Enviar nesta conversa: ' + texto; no('confirmacao-nota').hidden = false;
          } else salvar(texto, false);
        };
        no('voltar-nota').onclick = function () { confirmado = null; no('confirmacao-nota').hidden = true; };
        no('confirmar-nota').onclick = function () {
          if (confirmado !== no('nota').value.trim() || !no('avisar').checked) { confirmado = null; no('confirmacao-nota').hidden = true; mensagem('A nota mudou. Revise o aviso novamente.'); return; }
          salvar(confirmado, true);
        };
        async function salvar(texto, avisar) {
          if (salvando || !escrita() || !valido()) return;
          salvando = true; no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = true; mensagem('Salvando nota…');
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
                falhaEnvio = err.code === 'forbidden' ? 'Janela de 24 horas encerrada.' : err.message;
              }
            }
            if (!await atual(g, c) || !valido()) return;
            var salvo = await GI.chamadosNota(n, { texto: texto, notificou_cliente: avisar && enviado === texto });
            if (!await atual(g, c) || !valido()) return;
            d.eventos.push(salvo.evento); observacoes(); no('nota').value = ''; no('avisar').checked = false; no('confirmacao-nota').hidden = true; confirmado = enviado = null;
            mensagem(falhaEnvio ? 'Nota salva para a equipe. Cliente não avisado: ' + falhaEnvio : 'Nota salva' + (avisar ? ' e cliente avisado.' : ' para a equipe.'));
            try {
              var relido = await GI.chamadosObter(n);
              if (!await atual(g, c) || !valido()) return;
              d = relido; observacoes();
            } catch (_) { mensagem('Nota salva. Não foi possível atualizar as observações; atualize o painel.' + (falhaEnvio ? ' Cliente não avisado: ' + falhaEnvio : '')); }
          } catch (err) { mensagem((enviado === texto ? 'Aviso enviado; ' : '') + 'não foi possível salvar a nota. Tente salvar novamente. ' + err.message); }
          finally { salvando = false; if (valido()) no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = false; }
        }
      }
      botao.hidden = true;
    } catch (err) { if (valido()) { alvo.textContent = 'Não foi possível consultar. ' + err.message; botao.disabled = false; } }
    GI.ajustarAltura();
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
    $('cp-conteudo').innerHTML = '<form id="cp-form" class="gi-cartao gi-cp-form"><div><span class="gi-cp-rotulo">Atendimento vinculado</span><p id="cp-vinculo"></p><span class="gi-cp-meta">O chamado fica ligado a esta conversa.</span></div>' + kv('Solicitante', contato.name) + kv('Imóvel', locacao().imovel_titulo) + '<div><label for="cp-titulo">Título do chamado</label><input id="cp-titulo" maxlength="180" required value="' + e(f.titulo) + '"></div><fieldset><legend>O que aconteceu?</legend><div class="gi-cp-chips">' + Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) { return '<button type="button" data-categoria="' + c + '" aria-pressed="' + (f.categoria === c) + '">' + e(valorMapa(GI.CHAMADO_CATEGORIAS, c)) + '</button>'; }).join('') + '</div></fieldset><fieldset><legend>Urgência</legend><div class="gi-cp-chips">' + ['normal', 'alta', 'emergencia'].map(function (p) { return '<button type="button" data-prioridade="' + p + '" aria-pressed="' + (f.prioridade === p) + '">' + e(valorMapa(GI.CHAMADO_PRIORIDADES, p)) + '</button>'; }).join('') + '</div></fieldset><div><label for="cp-descricao">Descrição</label><textarea id="cp-descricao" maxlength="10000">' + e(f.descricao) + '</textarea></div><div><span class="gi-cp-rotulo">Fotos da conversa</span><div id="cp-fotos" aria-live="polite"></div></div><div><label for="cp-disponibilidade">Quando dá para entrar</label><input id="cp-disponibilidade" maxlength="500" value="' + e(f.disponibilidade) + '"><label class="gi-cp-check"><input id="cp-sem-cliente" type="checkbox"' + (f.sem_cliente ? ' checked' : '') + '>Autoriza entrar sem o cliente</label></div><div><label for="cp-chaves">Chaves / acesso</label><input id="cp-chaves" maxlength="500" value="' + e(f.chaves) + '"></div><button class="btn btn-primario" id="cp-revisar" type="submit">Revisar e abrir chamado</button><p class="panel__note">Nada é gravado antes da confirmação.</p></form>';
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
    if (!fotos.length) $('cp-fotos').textContent = fotosAviso || (fotosLidas ? 'Nenhuma foto nesta conversa.' : 'Carregando fotos…');
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
    } catch (_) { if (g !== geracao) return; fotosAviso = 'Fotos indisponíveis. Atualize o painel para tentar novamente.'; }
    if (g === geracao && aba === 'novo' && !confirmado) renderFotos();
  }
  function revisar() {
    confirmado = { geracao: geracao, chat: chat, locacao: locacao(), contato: contato, dados: JSON.parse(JSON.stringify(rascunho())) };
    var f = confirmado.dados;
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2 id="cp-confirmacao-titulo" tabindex="-1">Confirme antes de abrir</h2>' + kv('Cliente', contato.name) + kv('Imóvel', locacao().imovel_titulo) + kv('Atendimento', vinculo()) + kv('Título', f.titulo) + kv('Descrição', f.descricao) + kv('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, f.categoria)) + kv('Urgência', valorMapa(GI.CHAMADO_PRIORIDADES, f.prioridade)) + kv('Fotos', f.anexos.length) + kv('Acesso', f.disponibilidade) + kv('Sem o cliente', f.sem_cliente ? 'Autorizado' : 'Não autorizado') + kv('Chaves', f.chaves) + '<p class="gi-cp-meta">O portal calcula o SLA pela prioridade configurada.</p></div><div class="gi-cp-acoes"><button type="button" class="btn" id="cp-voltar">Voltar e editar</button><button type="button" class="btn btn-primario" id="cp-confirmar">Abrir chamado</button></div>';
    $('cp-voltar').onclick = function () { confirmado = null; renderNovo(); $('cp-titulo').focus(); };
    $('cp-confirmar').onclick = salvar;
    $('cp-confirmacao-titulo').focus();
  }
  async function salvar() {
    var plano = confirmado;
    if (!plano || gravando || !escrita()) return;
    gravando = true; $('cp-confirmar').disabled = true; $('cp-voltar').disabled = true; recado('Abrindo chamado…');
    var g = plano.geracao, c = plano.chat, f = plano.dados;
    try {
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.'); }
        return;
      }
      var u = demo() ? { id: 9990, name: 'Agente Demonstração' } : await omni.session.getUser();
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.'); }
        return;
      }
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
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-sucesso" id="cp-sucesso" role="status"><h2 tabindex="-1">' + e(GI.chamadoNumero(r.chamado.numero)) + ' aberta</h2><p>A equipe vê o chamado com o status Novo e este atendimento vinculado.</p></div><div class="gi-cp-acoes">' + (administrador ? '<button class="btn" type="button" id="cp-ver-gestao">Ver na gestão</button>' : '') + '<button class="btn" type="button" id="cp-copiar-sucesso">Copiar protocolo</button></div>';
      if ($('cp-ver-gestao')) $('cp-ver-gestao').onclick = function () { abrirGestao(r.chamado); };
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
    if (!administrador) return;
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
  $('cp-atualizar').onclick = function () { if (!gravando) iniciar(true); };
  function trocarChat() {
    ++geracao; clearTimeout(temporizador); limpar(); estado('Carregando atendimento selecionado…');
    temporizador = setTimeout(iniciar, 400);
  }
  var desassinar, desassinarDestroy, destruido = false;
  function destruir() {
    if (destruido) return;
    destruido = true; ++geracao; clearTimeout(temporizador); clearTimeout(timerResidencia); ++buscaResidencia; observer.disconnect(); fixo = true;
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
