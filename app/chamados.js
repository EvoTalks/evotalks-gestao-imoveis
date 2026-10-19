/* Gestão de chamados: gravações apenas no portal, dados externos sempre escapados. */
(function () {
  'use strict';
  var e = GI.escapar, el = function (id) { return document.getElementById(id); };
  var pagina = 1, geracao = 0, total = 0, itens = [], resumoAtual = {};
  var form = GI.criarChamadoForm({ carregar: carregar, atualizarLinha: atualizarLinha, itens: function () { return itens; } });
  var abrirEdicao = form.abrirEdicao, formulario = form.formulario, cancelar = form.cancelar;
  var controleStatus = form.controleStatus, ligarControleStatus = form.ligarControleStatus;
  function terminal(c) { return c.status === 'concluido' || c.status === 'cancelado'; }
  function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function idValido(v) { var n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function data(v) {
    var s = String(v || '');
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s)) ? GI.dataHora(s).replace(/\/\d{4}/, '').replace(/,? (\d{2}:\d{2})$/, ' · $1') : '—';
  }
  function opcoes(mapa, atual) {
    return Object.keys(mapa).map(function (k) { return '<option value="' + e(k) + '"' + (k === atual ? ' selected' : '') + '>' + e(mapa[k]) + '</option>'; }).join('');
  }
  function icone(tipo) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (tipo === 'editar' ? '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' : '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>') + '</svg>';
  }
  function erro(err) { return GI.mensagemErro(err); }
  function carregar() {
    if (GI.modo !== 'portal') return Promise.resolve();
    var atual = ++geracao;
    el('gi-erro').style.display = 'none';
    el('gi-corpo').innerHTML = '<tr><td colspan="9">buscando chamados…</td></tr>';
    return GI.chamados({ busca: el('f-busca').value.trim(), status: el('f-status').value, prioridade: el('f-prioridade').value,
      pagina: pagina, por_pagina: el('f-porpagina').value }).then(function (r) {
      if (atual !== geracao) return;
      itens = r.rows || []; total = numero(r.total);
      resumoAtual = r.resumo || {}; desenharResumo();
      el('gi-pagina').textContent = String(pagina); el('gi-total').textContent = itens.length + ' nesta página · ' + total + ' no total';
      el('b-anterior').disabled = pagina <= 1; el('b-proxima').disabled = pagina * numero(r.pageSize) >= total;
      el('gi-corpo').innerHTML = itens.length ? itens.map(linha).join('') : '<tr><td colspan="9"><div class="gi-vazio">Nenhum chamado com esses filtros.</div></td></tr>';
      el('gi-corpo').querySelectorAll('tr').forEach(ligarLinha);
      GI.ajustarAltura();
    }).catch(function (err) {
      if (atual !== geracao) return;
      el('gi-corpo').innerHTML = '<tr><td colspan="9">Não foi possível carregar. Tente Buscar novamente.</td></tr>';
      GI.erroFatal(new Error(erro(err)));
    });
  }
  function desenharResumo() {
    var resumo = resumoAtual;
    el('gi-resumo').title = numero(resumo.emergencia_sem_triagem) + ' ' + GI.plural(numero(resumo.emergencia_sem_triagem), 'emergência', 'emergências') + ' sem triagem';
    el('gi-resumo').textContent = numero(resumo.abertos) + ' ' + GI.plural(numero(resumo.abertos), 'chamado aberto', 'chamados abertos') + ' · ' + numero(resumo.prazo_estourado) + ' com prazo estourado · ' +
      numero(resumo.aguardando_proprietario) + ' aguardando o proprietário';
  }
  function linha(c, i) {
    var a = c.atendimento, im = c.imovel || {}, solicitante = c.solicitante || {};
    return '<tr><td class="gi-nowrap"><strong>' + e(String(c.numero).padStart(4, '0')) + '</strong><div class="gi-ajuda">' + e(data(c.criado_em)) + '</div></td>' +
      '<td>' + e(c.titulo) + '<div class="gi-ajuda">' + e(valorMapa(GI.CHAMADO_CATEGORIAS, c.categoria) || '—') + (c.origem === 'ia' ? ' · via IA' : !a && c.origem === 'gestao' ? ' · na gestão' : '') + '</div></td>' +
      '<td>' + e(im.titulo) + '<div class="gi-ajuda">' + e(solicitante.nome) + '</div></td>' +
      '<td class="gi-nowrap">' + (a ? '<strong>' + (idValido(a.chat_id) ? '#' + idValido(a.chat_id) : e(a.protocolo || 'Informado')) + '</strong><div class="gi-ajuda">' + e([a.canal, c.atendente && c.atendente.nome].filter(Boolean).join(' · ')) + '</div>' : '<span class="gi-mudo gi-pequeno">sem atendimento</span><div class="gi-ajuda">' + e(c.atendente && c.atendente.nome || '') + '</div>') + '</td>' +
      '<td><span class="gi-prio ' + (valorMapa(GI.CHAMADO_PRIORIDADE_CLASSES, c.prioridade) || '') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4M6 5h11l-2 4 2 4H6"/></svg>' + e(valorMapa(GI.CHAMADO_PRIORIDADES, c.prioridade) || '—') + '</span></td>' +
      '<td class="gi-nowrap">' + prazo(c) + '</td><td>' + (c.orcamentos_total ? '<span class="gi-chip">' + e(c.orcamentos_total) + ' cotações</span>' : c.prestador ? e(c.prestador.nome) : terminal(c) ? '—' : '<span class="gi-mudo gi-pequeno">a definir</span>') +
      (c.valor_estimado_centavos != null && Number.isFinite(Number(c.valor_estimado_centavos)) ? '<div class="gi-ajuda">' + e(GI.dinheiro(Number(c.valor_estimado_centavos))) + '</div>' : '') + '</td>' +
      '<td>' + controleStatus(c, false) + '</td><td><div class="gi-acoes"><button type="button" class="btn btn-slim btn-icone" data-editar="' + e(c.id) + '" aria-label="Editar ' + e(GI.chamadoNumero(c.numero)) + '" title="Editar chamado">' + icone('editar') + '</button>' +
      ('<button type="button" class="btn btn-slim btn-icone btn-perigo" data-cancelar-chamado="' + i + '"' + (terminal(c) ? ' disabled' : '') + ' aria-label="Cancelar ' + e(GI.chamadoNumero(c.numero)) + '" title="Cancelar chamado">' + icone('cancelar') + '</button>') + '</div></td></tr>';
  }
  function prazo(c) {
    var original = GI.chamadoPrazo(c), texto = original.replace(/^SLA /, '').toLowerCase().replace(/(\d+h) \d+min/, '$1'), legenda = '', classe = '';
    if (terminal(c)) texto = (c.status === 'cancelado' ? 'cancelado ' : 'concluído ') + data(c.cancelado_em || c.concluido_em).split(' · ')[0];
    else if (texto.indexOf('pausado') === 0) { texto = texto.replace('pausado', 'parada').split(' · ')[0].replace(/(\d+d).*/, '$1'); legenda = 'espera o proprietário'; classe = 'gi-prazo--warn'; }
    else if (texto.indexOf('atrasado') === 0) { texto = texto.replace('atrasado', 'atrasada').replace(/(\d+d).*/, '$1'); legenda = 'prazo era ' + data(c.sla && c.sla.prazo_solucao_em).split(' · ')[0]; classe = 'gi-prazo--bad'; }
    else if (texto === 'responder já') { legenda = c.status === 'novo' ? 'sem triagem' : ''; classe = 'gi-prazo--bad'; }
    else if (c.status === 'agendado' && c.visita && c.visita.inicio) { texto = new Date(c.visita.inicio).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') + ' ' + data(c.visita.inicio).replace(':00', 'h'); legenda = 'visita agendada'; }
    else if (c.status === 'execucao' && c.sla && c.sla.prazo_solucao_em) texto = 'até ' + data(c.sla.prazo_solucao_em).split(' · ')[0];
    else if (texto.indexOf('vence em') === 0) { legenda = c.prioridade === 'alta' ? 'solução em 72h' : ''; if (Date.parse(c.sla && c.sla.prazo_solucao_em) - Date.now() <= 6 * 3600000) classe = 'gi-prazo--warn'; }
    return '<span title="' + e(original) + '"' + (classe ? ' class="' + classe + '"' : '') + '>' + e(texto) + '</span>' + (legenda ? '<div class="gi-ajuda">' + e(legenda) + '</div>' : '');
  }
  function ligarLinha(tr) {
    var editar = tr.querySelector('[data-editar]'), cancelarBotao = tr.querySelector('[data-cancelar-chamado]');
    if (!editar) return;
    editar.onclick = function () { abrirEdicao(editar.dataset.editar).catch(GI.erroFatal); };
    var obter = function () { return itens.find(function (c) { return String(c.id) === editar.dataset.editar; }); };
    if (cancelarBotao) cancelarBotao.onclick = function () { cancelar(obter()).catch(GI.erroFatal); };
    ligarControleStatus(tr.querySelector('[data-status-controle]'), obter);
  }
  function contribuicaoResumo(c) {
    var sla = c.sla || {}, aberto = !terminal(c), agora = Date.now();
    // O resumo recebido respeita os filtros; a diferença usa o mesmo recorte.
    if (el('f-status').value && c.status !== el('f-status').value) return {};
    return { abertos: aberto ? 1 : 0,
      prazo_estourado: aberto && ((!sla.pausado && Date.parse(sla.prazo_solucao_em) < agora) || (!sla.primeira_resposta_em && Date.parse(sla.prazo_resposta_em) < agora)) ? 1 : 0,
      aguardando_proprietario: aberto && c.aprovacao && c.aprovacao.status === 'pendente' ? 1 : 0,
      emergencia_sem_triagem: c.status === 'novo' && c.prioridade === 'emergencia' ? 1 : 0 };
  }
  function atualizarLinha(c) {
    var i = itens.findIndex(function (item) { return String(item.id) === String(c.id); });
    if (i < 0) return;
    var antes = contribuicaoResumo(itens[i]), depois = contribuicaoResumo(c);
    Object.keys(resumoAtual).forEach(function (k) { resumoAtual[k] = numero(resumoAtual[k]) + numero(depois[k]) - numero(antes[k]); });
    itens[i] = c; desenharResumo();
    var botao = el('gi-corpo').querySelector('[data-editar="' + idValido(c.id) + '"]');
    if (botao) {
      var tr = botao.closest('tr'), temporario = document.createElement('tbody');
      temporario.innerHTML = linha(c, i); tr.innerHTML = temporario.firstElementChild.innerHTML; ligarLinha(tr);
    }
  }
  GI.pronto(function (ctx) {
    el('gi-nav').innerHTML = GI.cabecalho('gi-chamados');
    GI.ligarNavegacao(); GI.manutencaoMostrarModo();
    if (GI.modo === 'portal') el('gi-modo').innerHTML = '🟢 <strong>Conectado ao portal</strong> — o que você grava aqui aparece no cockpit do atendimento e para a assistente de IA.';
    el('f-status').innerHTML += opcoes(GI.CHAMADO_STATUS); el('f-prioridade').innerHTML += opcoes(GI.CHAMADO_PRIORIDADES);
    if (GI.modo !== 'portal') {
      el('gi-sem-portal').hidden = false; el('gi-resumo').textContent = 'Manutenção exige o portal conectado';
      el('gi-corpo').innerHTML = '<tr><td colspan="9">Conecte o portal para consultar e abrir chamados.</td></tr>';
      document.querySelectorAll('#gi-lista input, #gi-lista select, #gi-lista button').forEach(function (b) { b.disabled = true; }); return;
    }
    el('b-buscar').onclick = function () { pagina = 1; carregar(); };
    el('f-busca').onkeydown = function (ev) { if (ev.key === 'Enter') el('b-buscar').click(); };
    el('b-limpar').onclick = function () { el('f-busca').value = ''; el('f-status').value = ''; el('f-prioridade').value = ''; el('f-porpagina').value = '25'; pagina = 1; carregar(); };
    el('f-porpagina').onchange = function () { pagina = 1; carregar(); };
    el('b-anterior').onclick = function () { if (pagina > 1) { pagina--; carregar(); } };
    el('b-proxima').onclick = function () { if (pagina * Number(el('f-porpagina').value) < total) { pagina++; carregar(); } };
    el('b-novo').onclick = function () { formulario().catch(GI.erroFatal); };
    return carregar().then(function () {
      var params = ctx && ctx.contribution && ctx.contribution.params;
      var chamadoId = idValido(params && params.chamadoId);
      if (chamadoId) abrirEdicao(chamadoId).catch(GI.erroFatal);
    });
  });
})();
