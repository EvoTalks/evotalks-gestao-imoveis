/* Gestão de chamados: gravações apenas no portal, dados externos sempre escapados. */
(function () {
  'use strict';
  var e = GI.escapar, el = function (id) { return document.getElementById(id); };
  var pagina = 1, geracao = 0, total = 0, itens = [];
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function idValido(v) { var n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function data(v) {
    var s = String(v || '');
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s)) ? GI.dataHora(s) : '—';
  }
  function opcoes(mapa, atual) {
    return Object.keys(mapa).map(function (k) { return '<option value="' + e(k) + '"' + (k === atual ? ' selected' : '') + '>' + e(mapa[k]) + '</option>'; }).join('');
  }
  function status(c) {
    return '<span class="gi-estado ' + (GI.CHAMADO_STATUS_CLASSES[c.status] || 'gi-estado-off') + '"><span class="gi-ponto"></span>' + e(GI.CHAMADO_STATUS[c.status] || 'Não informado') + '</span>';
  }
  function icone(tipo) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      (tipo === 'editar' ? '<path d="M12 20h9M16 4l4 4L7 21H3v-4Z"/>' : '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>') + '</svg>';
  }
  function erro(err) {
    var d = err.dados || {}, codigos = { locacao_encerrada: 'Esta locação foi encerrada. Escolha outra locação ativa.', chamado_encerrado: 'O chamado foi encerrado. Reabra antes de alterar.',
      sem_orcamento_escolhido: 'Escolha um orçamento antes de mudar para Aprovação.', sem_visita: 'Agende a visita antes de mudar para Agendado.', aprovacao_pendente: 'A aprovação do proprietário ainda está pendente.' };
    if (err.status === 429 || err.code === 'rate_limit') return 'Limite de consultas atingido. Aguarde um minuto e tente novamente.';
    return (err.status ? err.status + ' · ' : '') + (d.campos ? Object.keys(d.campos).map(function (k) { return d.campos[k]; }).join(' · ') : codigos[d.erro] || d.detalhe || err.message || 'Não foi possível concluir.');
  }
  function sdk(grupo, metodo, args) {
    return Promise.resolve().then(function () {
      if (!window.omni || !omni[grupo] || !omni[grupo][metodo]) throw new Error('Recurso indisponível: ' + grupo + '.' + metodo);
      return omni[grupo][metodo].apply(omni[grupo], args || []);
    });
  }
  function carregar() {
    if (GI.modo !== 'portal') return Promise.resolve();
    var atual = ++geracao;
    el('gi-erro').style.display = 'none';
    el('gi-corpo').innerHTML = '<tr><td colspan="9">buscando chamados…</td></tr>';
    return GI.chamados({ busca: el('f-busca').value.trim(), status: el('f-status').value, prioridade: el('f-prioridade').value,
      pagina: pagina, por_pagina: el('f-porpagina').value }).then(function (r) {
      if (atual !== geracao) return;
      itens = r.rows || []; total = numero(r.total);
      var resumo = r.resumo || {};
      el('gi-resumo').textContent = numero(resumo.abertos) + ' chamados abertos · ' + numero(resumo.prazo_estourado) + ' com prazo estourado · ' +
        numero(resumo.aguardando_proprietario) + ' aguardando o proprietário · ' + numero(resumo.emergencia_sem_triagem) + ' emergências sem triagem';
      el('gi-pagina').textContent = String(pagina); el('gi-total').textContent = itens.length + ' nesta página · ' + total + ' no total';
      el('b-anterior').disabled = pagina <= 1; el('b-proxima').disabled = pagina * numero(r.pageSize) >= total;
      el('gi-corpo').innerHTML = itens.length ? itens.map(function (c, i) {
        var a = c.atendimento, im = c.imovel || {}, solicitante = c.solicitante || {};
        return '<tr><td class="gi-nowrap"><strong>' + e(GI.chamadoNumero(c.numero)) + '</strong><div class="gi-ajuda">' + e(data(c.criado_em)) + '</div></td>' +
          '<td>' + e(c.titulo) + '<div class="gi-ajuda">' + e(GI.CHAMADO_CATEGORIAS[c.categoria] || '—') + '</div></td>' +
          '<td>' + e(im.titulo) + '<div class="gi-ajuda">' + e(solicitante.nome) + '</div></td>' +
          '<td>' + (a ? '<strong>' + (idValido(a.chat_id) ? '#' + idValido(a.chat_id) : e(a.protocolo || 'Informado')) + '</strong><div class="gi-ajuda">' + e(a.canal || '') + '</div>' : '—') +
          '<div class="gi-ajuda">' + e(c.atendente && c.atendente.nome || 'Sem atendente') + '</div></td>' +
          '<td><span class="gi-prio ' + (GI.CHAMADO_PRIORIDADE_CLASSES[c.prioridade] || '') + '">' + e(GI.CHAMADO_PRIORIDADES[c.prioridade] || '—') + '</span></td>' +
          '<td>' + e(GI.chamadoPrazo(c)) + '</td><td>' + e(c.prestador && c.prestador.nome || '—') + '<div class="gi-ajuda">' +
          (c.valor_estimado_centavos != null && Number.isFinite(Number(c.valor_estimado_centavos)) ? e(GI.dinheiro(Number(c.valor_estimado_centavos))) : '') + '</div></td>' +
          '<td>' + status(c) + '</td><td><div class="gi-acoes"><button type="button" class="btn btn-slim btn-icone" data-editar="' + e(c.id) + '" aria-label="Editar ' + e(GI.chamadoNumero(c.numero)) + '" title="Editar chamado">' + icone('editar') + '</button>' +
          (!terminal(c) ? '<button type="button" class="btn btn-slim btn-icone btn-perigo" data-cancelar-chamado="' + i + '" aria-label="Cancelar ' + e(GI.chamadoNumero(c.numero)) + '" title="Cancelar chamado">' + icone('cancelar') + '</button>' : '') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="9"><div class="gi-vazio">Nenhum chamado com esses filtros.</div></td></tr>';
      el('gi-corpo').querySelectorAll('[data-editar]').forEach(function (b) { b.onclick = function () { abrirEdicao(b.dataset.editar).catch(GI.erroFatal); }; });
      el('gi-corpo').querySelectorAll('[data-cancelar-chamado]').forEach(function (b) { b.onclick = function () { cancelar(itens[Number(b.dataset.cancelarChamado)]).catch(GI.erroFatal); }; });
      GI.ajustarAltura();
    }).catch(function (err) {
      if (atual !== geracao) return;
      el('gi-corpo').innerHTML = '<tr><td colspan="9">Não foi possível carregar. Tente Buscar novamente.</td></tr>';
      GI.erroFatal(new Error(erro(err)));
    });
  }
  function terminal(c) { return c.status === 'concluido' || c.status === 'cancelado'; }
  function moeda(v) { return v != null && Number.isFinite(Number(v)) ? GI.dinheiro(Number(v)) : '—'; }
  function valorMonetario(v) {
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(v)) throw new Error('Informe um valor em reais, com até duas casas decimais.');
    var n = Math.round(Number(v.replace(',', '.')) * 100);
    if (!Number.isSafeInteger(n)) throw new Error('Valor fora do limite.');
    return n;
  }
  function dataLocal(v) {
    if (data(v) === '—') return '';
    var d = new Date(v);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function instanteLocal(v) {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error('Informe uma data e hora válidas.');
    return new Date(v).toISOString();
  }
  function campo(id, rotulo, valor, tipo, extra) {
    return '<div class="gi-campo-caixa"><label for="c-' + id + '">' + rotulo + '</label><input id="c-' + id + '" type="' + (tipo || 'text') + '" value="' + e(valor || '') + '" ' + (extra || '') + '></div>';
  }
  function seletor(id, rotulo, mapa, valor) {
    return '<div class="gi-campo-caixa"><label for="c-' + id + '">' + rotulo + '</label><select id="c-' + id + '">' + opcoes(mapa, valor) + '</select></div>';
  }
  function atendimentoTexto(a) {
    return a ? (idValido(a.chat_id) ? '#' + idValido(a.chat_id) + ' · ' : '') + (a.protocolo || '') + ' · ' + (a.canal || 'Canal não informado') : 'Sem atendimento vinculado';
  }
  function seletorAtendimento() {
    return '<p class="gi-ajuda">Mostrando os atendimentos em andamento e os já vinculados. O SDK não consulta os encerrados por contato. Você pode informar o protocolo e o número, ou não vincular.</p>' +
      '<div id="c-atendimentos" class="gi-lista-atend" role="radiogroup" aria-label="Atendimento vinculado"></div>' +
      '<div id="c-manual" class="gi-grade-modal" hidden>' + campo('chat-id', 'Número do atendimento · obrigatório para vincular', '', 'number', 'min="1" step="1"') +
      campo('protocolo', 'Protocolo informado', '') + '<p class="gi-ajuda gi-campo-caixa--todo">Não verificado. Se você só conhece o protocolo, obtenha também o número do atendimento no EvoTalks.</p></div>' +
      '<p id="c-atendimento-aviso" class="gi-ajuda" aria-live="polite"></p>';
  }
  function formulario(detalhe) {
    var c = detalhe && detalhe.chamado || {}, editando = !!c.id, fechado = terminal(c), acesso = c.acesso || {};
    var contato = editando ? { id: c.solicitante.contato_id, name: c.solicitante.nome, phone: c.solicitante.telefone } : null;
    var locacoes = [], usuarios = c.atendente ? [{ id: c.atendente.user_id, name: c.atendente.nome }] : [], atendimentos = [];
    var atendimentoOriginal = c.atendimento || null, selecionado = atendimentoOriginal, modoAtendimento = selecionado ? 'atual' : 'nenhum';
    var caixa, no, revisao = null, mudou = false, ocupado = false, dadosAlterados = false, versaoContato = 0, versaoFotos = 0, timerBusca, anexos = [], enviado = null;
    var prestadores = [], configManutencao = null, envioProprietario = null;
    var corpo = '<div class="gi-form-chamado"><div id="c-mensagem" class="gi-chamado-msg" role="alert" aria-live="polite"></div>';
    if (editando) corpo += '<div class="gi-modal-imovel"><div class="gi-modal-imovel-titulo">' + e(c.titulo) + '</div><div class="gi-ajuda">' +
      e(GI.chamadoNumero(c.numero)) + ' · ' + e(c.imovel && c.imovel.titulo) + ' · ' + e(c.solicitante.nome) + ' · ' + e(c.solicitante.telefone) + ' · contrato ' + e(c.contrato_numero) + ' · aberto em ' + e(data(c.criado_em)) + '</div></div>' +
      '<div class="gi-secao"><strong>Status</strong><span id="c-status-atual">' + status(c) + '</span><span class="gi-ajuda" id="c-sla">' + e(GI.chamadoPrazo(c)) + '</span></div>' +
      '<ol class="gi-trilha" aria-label="Status do chamado">' + GI.chamadoTrilha(c.status).map(function (s) { return '<li class="' + (s.atual ? 'gi-trilha-atual' : s.feito ? 'gi-trilha-feito' : '') + '"' + (s.atual ? ' aria-current="step"' : '') + '>' + e(s.rotulo) + '</li>'; }).join('') + '</ol>' +
      (fechado ? '<button class="btn btn-slim" type="button" id="c-reabrir">Reabrir em Triagem</button>' : '<div class="gi-barra">' + seletor('status', 'Status', GI.CHAMADO_STATUS, c.status) + campo('motivo', 'Motivo da mudança (opcional)', '') + '<button class="btn btn-slim" type="button" id="c-mudar-status">Alterar status</button></div>');
    corpo += '<fieldset id="c-dados"' + (fechado ? ' disabled' : '') + '><div class="gi-secao"><strong>Cliente e imóvel</strong><span class="gi-ajuda">o imóvel vem dos locados do cliente</span></div><div class="gi-grade-modal">' +
      campo('cliente', editando ? 'Solicitante' : 'Cliente · buscar contato', contato && contato.name, 'search', editando ? 'readonly' : 'autocomplete="off" placeholder="Digite ao menos 2 caracteres"') +
      (editando ? campo('imovel', 'Imóvel locado', c.imovel && c.imovel.titulo, 'text', 'readonly') : '<div class="gi-campo-caixa"><label for="c-locacao">Imóvel locado</label><select id="c-locacao" disabled><option value="">Escolha um cliente</option></select></div>') +
      '</div><div id="c-contatos" class="gi-resultados" aria-live="polite"></div>' +
      '<div class="gi-secao"><strong>Atendimento</strong><span class="gi-ajuda">quem atende e a conversa que originou o chamado</span></div>' +
      '<div class="gi-campo-caixa"><label for="c-atendente">Atendente</label><select id="c-atendente" disabled><option value="">Sem atendente</option>' + (c.atendente ? '<option value="0" selected>' + e(c.atendente.nome) + '</option>' : '') + '</select></div>' +
      (editando ? '<div class="gi-atend"><div class="gi-atend__corpo"><div id="c-vinculo">' + e(atendimentoTexto(c.atendimento)) + '</div><div class="gi-ajuda" id="c-verificacao">' + (c.atendimento ? 'Vínculo informado · não verificado nesta tela' : '') + '</div></div><button type="button" class="btn btn-slim" id="c-abrir-atendimento"' + (!idValido(c.atendimento && c.atendimento.chat_id) ? ' disabled' : '') + '>Abrir atendimento</button><button type="button" class="btn btn-slim" id="c-trocar">Trocar</button></div>' : '') +
      '<div id="c-escolha-atendimento"' + (editando ? ' hidden' : '') + '>' + seletorAtendimento() + '</div>' +
      '<div class="gi-secao"><strong>Dados do chamado</strong></div><div class="gi-grade-modal">' +
      campo('titulo', 'Título', c.titulo) + seletor('categoria', 'Categoria', GI.CHAMADO_CATEGORIAS, c.categoria || 'outros') +
      seletor('prioridade', 'Prioridade', GI.CHAMADO_PRIORIDADES, c.prioridade || 'normal') +
      campo('disponibilidade', 'Quando dá para entrar', acesso.disponibilidade) + seletor('sem-cliente', 'Entrar sem o cliente', { nao: 'Não', sim: 'Sim' }, acesso.sem_cliente ? 'sim' : 'nao') + campo('chaves', 'Onde estão as chaves', acesso.chaves) +
      '<div class="gi-campo-caixa gi-campo-caixa--todo"><label for="c-descricao">Relato do cliente · descrição</label><textarea id="c-descricao" rows="3">' + e(c.descricao) + '</textarea></div></div>' +
      (editando ? '<div class="gi-secao"><strong>Custos</strong><span class="gi-ajuda">salve os dados antes de escolher um orçamento</span></div><div class="gi-grade-modal">' +
        seletor('quem-paga', 'Quem paga', { '': 'Não informado', proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga || '') +
        campo('valor', 'Valor estimado (R$)', c.valor_estimado_centavos == null || !Number.isFinite(Number(c.valor_estimado_centavos)) ? '' : (Number(c.valor_estimado_centavos) / 100).toFixed(2), 'text', 'inputmode="decimal"') +
        seletor('repasse', 'Lançar no repasse do proprietário', { nao: 'Não', sim: 'Sim' }, c.repasse ? 'sim' : 'nao') + '</div><p class="gi-ajuda">A baixa financeira segue no sistema da imobiliária.</p>' : '') +
      '<div class="gi-secao"><strong>Fotos do atendimento</strong><button class="btn btn-slim" type="button" id="c-carregar-fotos">Buscar fotos</button></div><div id="c-fotos" class="gi-fotos" aria-live="polite"></div></fieldset>';
    if (editando) corpo += '<!-- FATIA 4: ações independentes, com releitura do portal e histórico. -->' +
      '<div id="c-orcamentos"></div><div id="c-aprovacao"></div><div id="c-prestador"></div><div id="c-visita"></div>' +
      '<div class="gi-secao"><strong>Histórico</strong><span class="gi-ajuda">do mais antigo ao mais novo</span></div><ul id="c-historico" class="gi-historico"></ul>' +
      '<div class="gi-secao"><strong>Nota interna</strong><span class="gi-ajuda">só a equipe vê; o aviso envia o texto ao cliente</span></div>' +
      '<div class="gi-campo-caixa"><label for="c-nota">Observação</label><textarea id="c-nota" rows="3"></textarea></div>' +
      '<label class="gi-nota-check"><input id="c-avisar" type="checkbox">Avisar o cliente no WhatsApp</label><button class="btn btn-slim" id="c-salvar-nota" type="button">Salvar nota</button>' +
      '<p id="c-ultima" class="gi-ajuda">Última alteração: ' + e(data(c.atualizado_em)) + '</p>';
    corpo += '<div id="c-confirmacao" class="gi-confirmacao" hidden><strong>Confirmar operação</strong><p id="c-confirmacao-texto"></p><div class="gi-barra"><button class="btn" type="button" id="c-voltar">Voltar</button><button class="btn btn-primario" type="button" id="c-confirmar-acao">Confirmar</button></div></div>' +
      (!editando ? '<p class="gi-ajuda">Nada é gravado antes de você confirmar.</p>' : '') + '</div>';

    function mensagem(t) { if (caixa && caixa.isConnected) no('mensagem').textContent = t || ''; }
    function guardado(fn) {
      if (ocupado) return Promise.resolve();
      ocupado = true;
      var botoes = Array.from(caixa.closest('.gi-modal').querySelectorAll('button')).filter(function (b) { return !b.disabled; });
      var campos = Array.from(caixa.querySelectorAll('input, select, textarea')).filter(function (b) { return !b.disabled; });
      botoes.forEach(function (b) { b.disabled = true; });
      campos.forEach(function (b) { b.disabled = true; });
      return Promise.resolve().then(fn).catch(function (err) { mensagem(erro(err)); }).finally(function () {
        ocupado = false; botoes.concat(campos).forEach(function (b) { b.disabled = false; });
      });
    }
    function historico(eventos) {
      no('historico').innerHTML = eventos.length ? eventos.slice().sort(function (a, b) { return String(a.em).localeCompare(String(b.em)) || numero(a.id) - numero(b.id); }).map(function (ev) {
        var d = ev.detalhe || {}, texto = ev.texto || (ev.tipo === 'status' ? 'Status: ' + (GI.CHAMADO_STATUS[d.de] || d.de || '') + ' → ' + (GI.CHAMADO_STATUS[d.para] || d.para || '') + (d.motivo ? ' · ' + d.motivo : '') :
          { criou: 'Chamado aberto', atualizou: 'Dados atualizados', vinculou_atendimento: 'Atendimento vinculado alterado', nota: 'Nota interna', anexo: 'Anexo incluído',
            orcamento: 'Orçamento · ' + (d.acao || 'registrado'), aprovacao: 'Aprovação · ' + (d.acao || d.status || 'atualizada'), prestador: 'Prestador alterado', sla: 'SLA · ' + (d.acao || 'atualizado') }[ev.tipo] || ev.tipo);
        return '<li><time class="gi-ajuda">' + e(data(ev.em)) + ' · ' + e(ev.autor) + '</time><p>' + e(texto) + '</p>' + (ev.notificou_cliente ? '<span class="gi-chip">Cliente avisado</span>' : '') + '</li>';
      }).join('') : '<li>Sem eventos.</li>';
    }
    function confirmarAcao(texto, fn) {
      mensagem(''); no('confirmacao').hidden = false; no('confirmacao-texto').textContent = texto;
      no('confirmar-acao').hidden = false;
      no('confirmar-acao').onclick = function () { guardado(function () { return fn().then(function () { no('confirmacao').hidden = true; }); }); };
      no('confirmacao').scrollIntoView({ block: 'nearest' }); no('confirmar-acao').focus();
    }
    function atualizarFatia4() {
      return GI.chamadosObter(c.id).then(function (r) {
        if (!caixa.isConnected) return;
        detalhe = r; c = r.chamado; mudou = true;
        no('status-atual').innerHTML = status(c); if (no('status')) no('status').value = c.status;
        caixa.querySelector('.gi-trilha').innerHTML = GI.chamadoTrilha(c.status).map(function (s) { return '<li class="' + (s.atual ? 'gi-trilha-atual' : s.feito ? 'gi-trilha-feito' : '') + '"' + (s.atual ? ' aria-current="step"' : '') + '>' + e(s.rotulo) + '</li>'; }).join('');
        no('valor').value = c.valor_estimado_centavos == null || !Number.isFinite(Number(c.valor_estimado_centavos)) ? '' : (Number(c.valor_estimado_centavos) / 100).toFixed(2);
        historico(r.eventos || []); no('ultima').textContent = 'Última alteração: ' + data(c.atualizado_em);
        no('sla').textContent = GI.chamadoPrazo(c) + ' · resposta: ' + data(c.sla && c.sla.prazo_resposta_em) + ' · solução: ' + data(c.sla && c.sla.prazo_solucao_em);
        desenharFatia4();
      }).catch(function (err) { throw new Error('Operação registrada; não repita sem consultar o chamado. A releitura falhou. ' + erro(err)); });
    }
    function acaoFatia4(fn) {
      return guardado(function () {
        if (fechado) throw new Error('Reabra o chamado antes de alterar.');
        if (dadosAlterados || no('nota').value.trim()) throw new Error('Salve os dados e a nota antes desta operação.');
        return fn().then(function () { mudou = true; return atualizarFatia4(); });
      });
    }
    function opcoesPrestadores(atual, vazio) {
      var lista = prestadores.filter(function (p) { return p.ativo || Number(p.id) === Number(atual); });
      if (atual && !lista.some(function (p) { return Number(p.id) === Number(atual); })) lista.push({ id: atual, nome: c.prestador && c.prestador.nome || 'Prestador vinculado', ativo: false });
      return '<option value="">' + vazio + '</option>' + lista.filter(function (p) { return idValido(p.id); }).map(function (p) {
        return '<option value="' + idValido(p.id) + '"' + (Number(p.id) === Number(atual) ? ' selected' : '') + '>' + e(p.nome) + (p.ativo ? '' : ' (inativo)') + '</option>';
      }).join('');
    }
    function desenharFatia4() {
      var orcamentos = detalhe.orcamentos || [], ap = c.aprovacao || { status: 'nao_necessaria' }, visita = c.visita || {};
      var escolhido = orcamentos.find(function (o) { return o.escolhido; });
      var desabilitado = fechado ? ' disabled' : '';
      no('orcamentos').innerHTML = '<div class="gi-secao"><strong>Orçamentos</strong><span class="gi-ajuda">' + orcamentos.length + ' recebidos · um escolhido por chamado</span></div>' +
        '<fieldset class="gi-fatia4"' + desabilitado + '><div class="gi-tabela-rolagem"><table><thead><tr><th>Prestador</th><th>Valor</th><th>Prazo</th><th>Visita</th><th>Funções</th></tr></thead><tbody>' +
        (orcamentos.length ? orcamentos.map(function (o, i) {
          var dias = o.prazo_dias == null || !Number.isFinite(Number(o.prazo_dias)) ? '—' : Number(o.prazo_dias) + ' dia(s)';
          return '<tr><td>' + e(o.prestador_nome) + '<div class="gi-ajuda">' + e(o.observacao) + '</div></td><td>' + e(moeda(o.valor_centavos)) + '</td><td>' + e(dias) + '</td><td>' + e(data(o.visita_em)) + '</td><td>' +
            (o.escolhido ? '<span class="gi-estado gi-estado-ok">Escolhido</span>' : '<button class="btn btn-slim" type="button" data-escolher-orcamento="' + i + '">Escolher</button>') +
            (!o.escolhido || ['novo', 'triagem', 'orcamento'].includes(c.status) ? ' <button class="btn btn-slim btn-perigo" type="button" data-apagar-orcamento="' + i + '">Remover</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="5">Nenhum orçamento registrado.</td></tr>') + '</tbody></table></div>' +
        '<button class="btn btn-slim" type="button" id="c-novo-orcamento">' + (orcamentos.length === 2 ? '+ Pedir a terceira cotação' : '+ Registrar orçamento') + '</button>' +
        '<div id="c-form-orcamento" hidden><p class="gi-ajuda">Registre a cotação recebida. Este formulário não envia pedidos ao prestador.</p><div class="gi-grade-modal">' +
        '<div class="gi-campo-caixa"><label for="c-orc-prestador">Prestador cadastrado</label><select id="c-orc-prestador">' + opcoesPrestadores(null, 'Informar nome avulso') + '</select></div>' +
        campo('orc-nome', 'Nome do prestador avulso', '') + campo('orc-valor', 'Valor do orçamento (R$)', '', 'text', 'inputmode="decimal"') +
        campo('orc-prazo', 'Prazo (dias)', '', 'number', 'min="0" step="1"') + campo('orc-visita', 'Visita proposta', '', 'datetime-local') +
        campo('orc-observacao', 'Observação do orçamento', '') + '</div><button class="btn btn-slim" type="button" id="c-salvar-orcamento">Registrar orçamento</button></div></fieldset>';
      no('aprovacao').innerHTML = '<div class="gi-secao"><strong>Aprovação do proprietário</strong><span class="gi-chip">' + e({ nao_necessaria: 'Não necessária', pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' }[ap.status] || 'Não informada') + '</span></div>' +
        '<div class="gi-aviso"><span>Alçada: ' + e(configManutencao ? moeda(configManutencao.alcada_centavos) : 'não foi possível consultar') + '. ' +
        (ap.status === 'pendente' ? 'Aprovação pendente bloqueia Agendado e Em execução.' : ap.status === 'recusada' ? 'Orçamento recusado. Defina outra cotação ou registre nova decisão antes de prosseguir.' : 'A alçada se aplica ao orçamento escolhido pago pelo proprietário.') + '</span>' +
        '<div class="gi-ajuda">Envio registrado em: ' + e(data(ap.enviada_em)) + ' · Resposta: ' + e(data(ap.resposta_em)) + ' · ' + e(ap.por || '') + ' · ' + e(ap.canal || '') + '</div><p class="gi-pequeno">' + e(ap.observacao || '') + '</p></div>' +
        '<fieldset class="gi-fatia4"' + (fechado || ap.status === 'nao_necessaria' ? ' disabled' : '') + '><div class="gi-grade-modal">' +
        '<div class="gi-campo-caixa"><label for="c-proprietario">Proprietário da locação</label><select id="c-proprietario">' +
        ((detalhe.locacao && detalhe.locacao.contatos || []).filter(function (p) { return p.papel === 'proprietario'; }).map(function (p, i) { return '<option value="' + i + '">' + e(p.nome) + (idValido(p.contato_id) ? '' : ' (sem vínculo)') + '</option>'; }).join('') || '<option value="">Sem proprietário cadastrado</option>') + '</select></div>' +
        campo('aprovacao-por', 'Quem respondeu', ap.por) + campo('aprovacao-canal', 'Canal da resposta', ap.canal || 'telefone') + campo('aprovacao-observacao', 'Observação da resposta', '') +
        '</div><div class="gi-barra"><button class="btn btn-slim" type="button" id="c-enviar-proprietario">Enviar ao proprietário</button><button class="btn btn-slim" type="button" id="c-aprovar">Registrar aprovação</button><button class="btn btn-slim btn-perigo" type="button" id="c-recusar">Registrar recusa</button></div></fieldset>';
      no('prestador').innerHTML = '<div class="gi-secao"><strong>Prestador</strong></div><fieldset class="gi-fatia4"' + desabilitado + '><div class="gi-grade-modal"><div class="gi-campo-caixa"><label for="c-prestador-id">Prestador responsável</label><select id="c-prestador-id">' +
        opcoesPrestadores(c.prestador && c.prestador.id, 'Sem prestador') + '</select></div></div><button class="btn btn-slim" type="button" id="c-salvar-prestador">Salvar prestador</button></fieldset>';
      no('visita').innerHTML = '<div class="gi-secao"><strong>Visita</strong><span class="gi-ajuda">obrigatória antes de mudar para Agendado</span></div><fieldset class="gi-fatia4"' + desabilitado + '><div class="gi-grade-modal">' +
        campo('visita-inicio', 'Início da visita', dataLocal(visita.inicio), 'datetime-local') + campo('visita-fim', 'Fim da visita (opcional)', dataLocal(visita.fim), 'datetime-local') +
        '</div><div class="gi-barra"><button class="btn btn-slim" type="button" id="c-salvar-visita">Salvar visita</button><button class="btn btn-slim" type="button" id="c-remover-visita">Remover visita</button></div></fieldset>';
      if (fechado) return;
      no('novo-orcamento').onclick = function () { no('form-orcamento').hidden = !no('form-orcamento').hidden; };
      no('salvar-orcamento').onclick = function () { acaoFatia4(function () {
        var prestadorId = idValido(no('orc-prestador').value), nome = no('orc-nome').value.trim(), prazo = no('orc-prazo').value;
        if (!prestadorId && !nome) throw new Error('Informe o prestador do orçamento.');
        if (prazo && (!/^\d+$/.test(prazo) || !Number.isSafeInteger(Number(prazo)))) throw new Error('O prazo deve ser um número inteiro de dias.');
        return GI.chamadosOrcamentoCriar(c.id, { prestador_id: prestadorId, prestador_nome: nome, valor_centavos: valorMonetario(no('orc-valor').value.trim()),
          prazo_dias: prazo === '' ? null : Number(prazo), visita_em: instanteLocal(no('orc-visita').value), observacao: no('orc-observacao').value.trim() || null });
      }); };
      no('orcamentos').querySelectorAll('[data-escolher-orcamento]').forEach(function (b) { b.onclick = function () {
        var o = orcamentos[Number(b.dataset.escolherOrcamento)];
        confirmarAcao('Escolher o orçamento de ' + o.prestador_nome + ' por ' + moeda(o.valor_centavos) + '? O anterior será desmarcado.', function () {
          if (dadosAlterados || no('nota').value.trim()) return Promise.reject(new Error('Salve os dados e a nota antes de escolher um orçamento.'));
          return GI.chamadosOrcamentoEscolher(c.id, o.id).then(function () { envioProprietario = null; mudou = true; return atualizarFatia4(); });
        });
      }; });
      no('orcamentos').querySelectorAll('[data-apagar-orcamento]').forEach(function (b) { b.onclick = function () {
        var o = orcamentos[Number(b.dataset.apagarOrcamento)];
        confirmarAcao('Remover o orçamento de ' + o.prestador_nome + '?', function () {
          return GI.chamadosOrcamentoApagar(c.id, o.id).then(function () { mudou = true; return atualizarFatia4(); });
        });
      }; });
      no('salvar-prestador').onclick = function () { acaoFatia4(function () { return GI.chamadosPrestador(c.id, idValido(no('prestador-id').value)); }); };
      no('salvar-visita').onclick = function () { acaoFatia4(function () {
        var inicio = instanteLocal(no('visita-inicio').value), fim = instanteLocal(no('visita-fim').value);
        if (!inicio) throw new Error('Informe o início da visita.');
        if (fim && fim < inicio) throw new Error('O fim da visita deve ser posterior ao início.');
        return GI.chamadosVisita(c.id, { inicio: inicio, fim: fim });
      }); };
      no('remover-visita').onclick = function () { acaoFatia4(function () { return GI.chamadosVisita(c.id, { inicio: null }); }); };
      ['aprovar', 'recusar'].forEach(function (id) { no(id).onclick = function () {
        var d = { acao: id === 'aprovar' ? 'aprovada' : 'recusada', por: no('aprovacao-por').value.trim(), canal: no('aprovacao-canal').value.trim(), observacao: no('aprovacao-observacao').value.trim() };
        if (!d.por || !d.canal) { mensagem('Informe quem respondeu e por qual canal.'); return; }
        confirmarAcao('Registrar decisão ' + d.acao + ' por ' + d.por + ' via ' + d.canal + '?\n' + d.observacao, function () {
          return GI.chamadosAprovacao(c.id, d).then(function () { mudou = true; return atualizarFatia4(); });
        });
      }; });
      no('enviar-proprietario').onclick = function () {
        if (!escolhido) { mensagem('Escolha um orçamento antes de solicitar aprovação.'); return; }
        var donos = (detalhe.locacao && detalhe.locacao.contatos || []).filter(function (p) { return p.papel === 'proprietario'; });
        var dono = donos[Number(no('proprietario').value)];
        var texto = 'Solicitação de aprovação · ' + GI.chamadoNumero(c.numero) + '\nImóvel: ' + (c.imovel && c.imovel.titulo || '') + '\n' + c.titulo +
          '\nPrestador: ' + escolhido.prestador_nome + '\nValor: ' + moeda(escolhido.valor_centavos) + '\nPrazo: ' + (escolhido.prazo_dias == null ? 'não informado' : numero(escolhido.prazo_dias) + ' dia(s)') +
          '\nVisita proposta: ' + data(escolhido.visita_em) + '\nVocê aprova este orçamento?';
        confirmarAcao('Solicitar aprovação de ' + (dono && dono.nome || 'proprietário não vinculado') + '?\n\n' + texto + '\n\nSó será enviado se houver atendimento aberto acessível deste proprietário. Caso contrário, será registrada uma nota interna.', function () {
          return solicitarAprovacao(dono, texto);
        });
      };
    }
    function chatAberto(chat, contatoId) {
      // Aceita somente estados explicitamente abertos; estado desconhecido nunca autoriza envio.
      return chat && idValido(chat.id) && Number(chat.contactId) === Number(contatoId) && ['active', 'waiting', 'open', 'pending', 'queued'].includes(chat.status);
    }
    function localizarChatProprietario(contatoId) {
      if (!idValido(contatoId)) return Promise.resolve(null);
      return Promise.allSettled([sdk('chats', 'listMine'), sdk('chats', 'getSelected'), sdk('session', 'getPermissions')]).then(function (rs) {
        var chats = rs[0].status === 'fulfilled' && Array.isArray(rs[0].value) ? rs[0].value : [];
        if (rs[1].status === 'fulfilled' && rs[1].value) chats = chats.concat(rs[1].value);
        var perm = rs[2].status === 'fulfilled' && rs[2].value || {};
        var filas = Array.from(new Set(chats.map(function (a) { return idValido(a.queueId); }).filter(Boolean)));
        return (perm.isAdmin || perm.isSupervisor ? Promise.allSettled(filas.map(function (n) { return sdk('chats', 'listByQueue', [n]); })) : Promise.resolve([])).then(function (filasRs) {
          filasRs.forEach(function (r) { if (r.status === 'fulfilled' && Array.isArray(r.value)) chats = chats.concat(r.value); });
          return chats.find(function (a) { return chatAberto(a, contatoId); }) || null;
        });
      });
    }
    function solicitarAprovacao(dono, texto) {
      if (dadosAlterados || no('nota').value.trim()) return Promise.reject(new Error('Salve os dados e a nota antes de solicitar aprovação.'));
      var contatoId = dono && idValido(dono.contato_id), chave = String(contatoId) + '\n' + texto;
      if (envioProprietario && envioProprietario.chave === chave && envioProprietario.registrado) { mensagem('Solicitação já registrada nesta edição. Consulte o histórico antes de repetir.'); return Promise.resolve(); }
      if (!envioProprietario || envioProprietario.chave !== chave) envioProprietario = { chave: chave, enviado: false, registrado: false };
      var estado = envioProprietario;
      return (estado.enviado ? Promise.resolve({ id: estado.chatId }) : localizarChatProprietario(contatoId)).then(function (chat) {
        if (!chat) {
          var aviso = 'Solicitação de aprovação registrada internamente. Mensagem não enviada: ' + (contatoId ? 'nenhum atendimento aberto acessível do proprietário foi localizado.' : 'proprietário sem contato vinculado.') + ' Vincule o contato e abra o atendimento, ou contate o proprietário por outro canal e registre a resposta.';
          return GI.chamadosNota(c.id, { texto: aviso + '\n' + texto, notificou_cliente: false }).then(function () { estado.registrado = true; return aviso; });
        }
        return (estado.enviado ? Promise.resolve() : sdk('chats', 'get', [chat.id]).then(function (atual) {
          if (!chatAberto(atual, contatoId)) throw new Error('O atendimento não está mais aberto para este proprietário. Nenhuma mensagem foi enviada.');
          return sdk('chats', 'sendMessage', [atual.id, { text: texto }]);
        }).then(function (r) {
          if (!r || r.sent !== true) throw new Error('O SDK não confirmou o envio. Confira o atendimento antes de repetir.');
          estado.enviado = true; estado.chatId = chat.id;
        })).then(function () {
          return GI.chamadosAprovacao(c.id, { acao: 'enviada', canal: 'EvoTalks', observacao: 'Solicitação enviada no atendimento #' + estado.chatId });
        }).then(function () { estado.registrado = true; return 'Solicitação enviada ao proprietário e registrada no histórico.'; });
      }).then(function (aviso) { mudou = true; return atualizarFatia4().then(function () { mensagem(aviso); }); }).catch(function (err) {
        if (err.code === 'forbidden') throw new Error('Envio não permitido: verifique a permissão e a janela de 24 horas. Nenhum envio foi registrado.');
        if (estado.enviado && !estado.registrado) throw new Error('Mensagem enviada, mas o registro no portal falhou. Tente confirmar novamente para registrar sem reenviar. ' + erro(err));
        throw err;
      });
    }
    function atendimentoEscolhido() {
      if (modoAtendimento === 'manual') {
        var n = idValido(no('chat-id').value);
        if (!n) throw new Error('Informe o número do atendimento. O portal exige esse número mesmo quando há protocolo.');
        return { chat_id: n, protocolo: no('protocolo').value.trim() || null, canal: null, fila: null, iniciado_em: null };
      }
      return selecionado;
    }
    function redesenharAtendimentos() {
      var rows = atendimentos.map(function (a, i) {
        return '<label class="gi-atend"><input type="radio" name="c-atendimento" value="' + i + '"><span class="gi-atend__corpo"><span class="gi-atend__t"><strong>' +
          e(atendimentoTexto(a)) + '</strong><span class="gi-chip">' + e(a.vivo ? 'Em andamento' : 'Já vinculado') + '</span></span><span class="gi-ajuda">' +
          e(a.fila || '') + ' · ' + e(data(a.iniciado_em)) + (a.chamados && a.chamados.length ? ' · já vinculado: ' + e(a.chamados.map(function (os) { return GI.chamadoNumero(os.numero); }).join(', ')) : '') + '</span></span></label>';
      }).join('');
      if (atendimentoOriginal && !atendimentos.some(function (a) { return a.chat_id === atendimentoOriginal.chat_id; })) rows += '<label class="gi-atend"><input type="radio" name="c-atendimento" value="atual"><span>' + e(atendimentoTexto(atendimentoOriginal)) + ' · vínculo registrado</span></label>';
      rows += '<label class="gi-atend"><input type="radio" name="c-atendimento" value="manual"><span>Buscar por protocolo ou número · informado, não verificado</span></label>' +
        '<label class="gi-atend"><input type="radio" name="c-atendimento" value="nenhum"><span>Não vincular a um atendimento</span></label>';
      no('atendimentos').innerHTML = rows;
      no('atendimentos').querySelectorAll('input').forEach(function (radio) {
        var a = atendimentos[Number(radio.value)];
        radio.checked = modoAtendimento === radio.value || (modoAtendimento === 'atual' && a && selecionado && a.chat_id === selecionado.chat_id);
        radio.onchange = function () {
          modoAtendimento = radio.value;
          if (a) selecionado = { chat_id: a.chat_id, protocolo: a.protocolo, canal: a.canal, fila: a.fila, iniciado_em: a.iniciado_em };
          if (radio.value === 'atual') selecionado = atendimentoOriginal;
          if (radio.value === 'nenhum') selecionado = null;
          no('manual').hidden = modoAtendimento !== 'manual';
          ++versaoFotos; anexos = []; no('fotos').textContent = '';
          if (editando) {
            no('vinculo').textContent = modoAtendimento === 'manual' ? 'Informado, não verificado' : atendimentoTexto(selecionado);
            no('verificacao').textContent = 'Alteração pendente: atualize o chamado para gravar.';
          }
        };
      });
    }
    function carregarAtendimentos(contatoId, versao) {
      return Promise.allSettled([sdk('chats', 'listMine'), sdk('chats', 'getSelected'), sdk('session', 'getPermissions'),
        GI.chamadosAtendimentosVinculados(contatoId)]).then(function (resultados) {
        var mine = resultados[0].status === 'fulfilled' ? resultados[0].value : [], atual = resultados[1].status === 'fulfilled' ? resultados[1].value : null;
        var perm = resultados[2].status === 'fulfilled' ? resultados[2].value : {}, vivos = mine.slice();
        if (atual) vivos.push(atual);
        var filas = perm.isSupervisor || perm.isAdmin ? sdk('queues', 'list').catch(function () { return []; }) : Promise.resolve([]);
        return filas.then(function (fs) {
          var ids = Array.from(new Set(fs.map(function (f) { return f.id; }).concat(vivos.map(function (a) { return a.queueId; })).filter(idValido)));
          return (perm.isSupervisor || perm.isAdmin ? Promise.allSettled(ids.map(function (id) { return sdk('chats', 'listByQueue', [Number(id)]); })) : Promise.resolve([])).then(function (rs) {
            if (versao !== versaoContato || !caixa.isConnected) return;
            rs.forEach(function (r) { if (r.status === 'fulfilled') vivos = vivos.concat(r.value); });
            atendimentos = [];
            vivos.filter(function (a) { return Number(a.contactId) === Number(contatoId) && !['closed', 'finished', 'ended', 'cancelled'].includes(a.status); }).forEach(function (a) {
              if (atendimentos.some(function (x) { return x.chat_id === Number(a.id); })) return;
              atendimentos.push({ chat_id: Number(a.id), protocolo: a.protocol, canal: a.channel, fila: a.queueId == null ? null : 'Fila ' + a.queueId, iniciado_em: a.startedAt, vivo: true });
            });
            if (resultados[3].status === 'fulfilled') (resultados[3].value.rows || []).forEach(function (a) {
              var existente = atendimentos.find(function (x) { return x.chat_id === a.chat_id; });
              if (existente) existente.chamados = a.chamados; else atendimentos.push(a);
            });
            redesenharAtendimentos();
            no('atendimento-aviso').textContent = resultados.some(function (r) { return r.status === 'rejected'; }) || rs.some(function (r) { return r.status === 'rejected'; }) ?
              'Parte dos atendimentos não pôde ser consultada. Você pode tentar selecionar o cliente novamente ou informar o vínculo manualmente.' : '';
          });
        });
      });
    }
    function escolherContato(p) {
      contato = p; no('cliente').value = p.name; no('contatos').textContent = '';
      var v = ++versaoContato;
      selecionado = null; modoAtendimento = 'nenhum'; atendimentos = []; redesenharAtendimentos();
      no('manual').hidden = true; no('chat-id').value = ''; no('protocolo').value = ''; ++versaoFotos; anexos = []; no('fotos').textContent = '';
      no('locacao').disabled = true; no('locacao').innerHTML = '<option value="">carregando…</option>';
      GI.chamarPortal('/contatos/' + encodeURIComponent(p.id) + '/locacoes').then(function (r) {
        if (v !== versaoContato || !caixa.isConnected) return;
        locacoes = r.rows || [];
        no('locacao').innerHTML = '<option value="">' + (locacoes.length ? 'Escolha o imóvel' : 'Nenhum imóvel locado para este contato') + '</option>' + locacoes.map(function (l, i) {
          return '<option value="' + i + '">' + e(l.imovel_titulo) + ' · contrato ' + e(l.contrato_numero || '—') + '</option>';
        }).join(''); no('locacao').disabled = false;
      }).catch(function (err) { if (v === versaoContato) { no('locacao').innerHTML = '<option value="">Falha ao consultar imóveis; selecione o cliente novamente</option>'; mensagem(erro(err)); } });
      carregarAtendimentos(p.id, v).catch(function (err) { if (v === versaoContato) mensagem(erro(err)); });
    }
    function dados() {
      if (!contato) throw new Error('Busque e selecione um cliente da lista.');
      var l = !editando && no('locacao').value !== '' && locacoes[Number(no('locacao').value)];
      if (!editando && !l) throw new Error('Escolha um imóvel locado do cliente.');
      var titulo = no('titulo').value.trim(); if (!titulo) throw new Error('Informe o título do chamado.');
      var u = no('atendente').value === '' ? null : usuarios[Number(no('atendente').value)];
      var d = { titulo: titulo, descricao: no('descricao').value.trim(), categoria: no('categoria').value, prioridade: no('prioridade').value,
        atendente: u ? { user_id: idValido(u.id), nome: u.name } : null, atendimento: atendimentoEscolhido(),
        acesso: { disponibilidade: no('disponibilidade').value.trim(), sem_cliente: no('sem-cliente').value === 'sim', chaves: no('chaves').value.trim() } };
      if (!editando) { d.locacao_id = idValido(l.id); d.origem = 'gestao'; d.solicitante = { contato_id: idValido(contato.id), nome: contato.name, telefone: contato.phone }; d.anexos = anexosSelecionados(); }
      else { d.quem_paga = no('quem-paga').value || null; d.valor_estimado_centavos = no('valor').value.trim() === '' ? null : valorMonetario(no('valor').value.trim()); d.repasse = no('repasse').value === 'sim'; }
      return d;
    }
    function anexosSelecionados() {
      return Array.from(no('fotos').querySelectorAll('[data-foto]:checked')).map(function (b) { return anexos[Number(b.dataset.foto)]; });
    }
    function resolverFoto(a, alvo) {
      sdk('chats', 'getFile', [a.file_ref]).then(function (r) {
        if (!alvo.isConnected || !r || !/^image\//.test(r.mimetype || a.mimetype || '')) return;
        var url = new URL(r.url, location.href);
        // SVG e esquemas executáveis nunca entram na prévia. A URL do SDK só vai para img.src.
        if (!['https:', 'http:', 'blob:'].includes(url.protocol) && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(r.url)) return;
        var img = document.createElement('img'); img.alt = a.nome || 'Foto do atendimento'; img.src = url.href; alvo.prepend(img);
      }).catch(function () { alvo.title = 'Prévia indisponível; a referência do arquivo foi preservada.'; });
    }
    function fotosSalvas() {
      no('fotos').textContent = '';
      (detalhe && detalhe.anexos || []).forEach(function (a) {
        var alvo = document.createElement('div'); alvo.className = 'gi-foto'; alvo.textContent = a.nome || a.file_ref; no('fotos').appendChild(alvo); resolverFoto(a, alvo);
      });
    }
    function buscarFotos() {
      var a;
      try { a = atendimentoEscolhido(); } catch (err) { mensagem(erro(err)); return; }
      if (!a || !idValido(a.chat_id) || modoAtendimento === 'manual') { mensagem('Selecione um atendimento consultado no EvoTalks para buscar as fotos.'); return; }
      var v = ++versaoFotos; no('fotos').textContent = 'buscando fotos…';
      sdk('chats', 'getMessages', [a.chat_id, { limit: 50 }]).then(function (msgs) {
        if (v !== versaoFotos || !caixa.isConnected) return;
        anexos = msgs.filter(function (m) { return m.fileRef && /^image\//.test(m.mimetype || ''); }).map(function (m) { return { file_ref: String(m.fileRef), nome: m.fileName, mimetype: m.mimetype, origem: 'atendimento' }; });
        fotosSalvas();
        if (!anexos.length) { var p = document.createElement('p'); p.textContent = 'Nenhuma foto nas últimas 50 mensagens. Mídias anteriores podem ser consultadas no atendimento.'; p.className = 'gi-ajuda'; no('fotos').appendChild(p); }
        anexos.forEach(function (a, i) {
          var label = document.createElement('label'); label.className = 'gi-atend gi-foto';
          label.innerHTML = '<input type="checkbox" data-foto="' + i + '"><span>' + e(a.nome || a.file_ref) + '</span>';
          no('fotos').appendChild(label); resolverFoto(a, label);
        });
      }).catch(function (err) { if (v === versaoFotos) { fotosSalvas(); mensagem(erro(err)); } });
    }
    function salvarNota() {
      var texto = no('nota').value.trim(), avisar = no('avisar').checked, a = c.atendimento;
      if (!texto) { mensagem('Escreva uma nota antes de salvar.'); return; }
      function gravar() {
        var chave = texto + '\n' + (a && a.chat_id);
        return Promise.resolve().then(function () {
          if (!avisar || enviado === chave) return;
          if (!a || !idValido(a.chat_id) || !/whatsapp/i.test(a.canal || '')) throw new Error('Vincule um atendimento WhatsApp e salve o chamado antes de avisar o cliente.');
          return sdk('chats', 'get', [a.chat_id]).then(function (chat) {
            if (Number(chat.contactId) !== Number(c.solicitante.contato_id)) throw new Error('O atendimento não pertence ao solicitante. Confira o vínculo antes de enviar.');
            return sdk('chats', 'sendMessage', [a.chat_id, { text: texto }]);
          }).then(function () { enviado = chave; }).catch(function (err) {
            if (err.code === 'forbidden') throw new Error('Envio não permitido: a janela de 24 horas pode estar encerrada ou faltar permissão. A nota foi mantida. Desmarque o aviso para salvar só internamente.');
            throw err;
          });
        }).then(function () { return GI.chamadosNota(c.id, { texto: texto, notificou_cliente: avisar || enviado === chave }); }).then(function () {
          mudou = true;
          if (no('nota').value.trim() === texto) no('nota').value = '';
          no('avisar').checked = false; enviado = null;
          return GI.chamadosObter(c.id).then(function (r) { historico(r.eventos || []); no('ultima').textContent = 'Última alteração: ' + data(r.chamado.atualizado_em); mensagem('Nota salva.'); });
        });
      }
      if (avisar) confirmarAcao('Enviar esta nota ao cliente ' + c.solicitante.nome + ' no atendimento ' + atendimentoTexto(a) + '?\n\n' + texto, gravar);
      else guardado(gravar);
    }
    return GI.modal({ titulo: editando ? 'Editar chamado ' + GI.chamadoNumero(c.numero) : 'Novo chamado', largura: 920, corpo: corpo,
      rotuloOk: editando ? 'Atualizar chamado' : 'Abrir chamado', rotuloCancelar: 'Fechar',
      aoAbrir: function (elemento) {
        caixa = elemento; no = function (id) { return caixa.querySelector('#c-' + id); };
        var ok = caixa.closest('.gi-modal').querySelector('[data-ok]'); ok.hidden = fechado;
        if (!editando) ok.textContent = 'Revisar e abrir chamado';
        caixa.closest('.gi-modal').querySelector('.gi-modal-recado').setAttribute('role', 'alert');
        sdk('users', 'list').then(function (r) {
          if (!caixa.isConnected) return;
          usuarios = (Array.isArray(r) ? r : []).filter(function (u) { return idValido(u.id) && u.name; });
          preencherUsuarios();
        }).catch(function () { if (caixa.isConnected) { usuarios = []; preencherUsuarios(); mensagem('Não foi possível listar atendentes. O vínculo existente foi preservado; reabra para tentar novamente.'); } });
        function preencherUsuarios() {
          var original = c.atendente, atual = original || GI.ctx() && GI.ctx().user;
          if (original && !usuarios.some(function (u) { return Number(u.id) === Number(original.user_id); })) usuarios.push({ id: original.user_id, name: original.nome });
          no('atendente').innerHTML = '<option value="">Sem atendente</option>' + usuarios.map(function (u, i) { return '<option value="' + i + '"' + (atual && Number(u.id) === Number(atual.user_id || atual.id) ? ' selected' : '') + '>' + e(u.name) + '</option>'; }).join('');
          no('atendente').disabled = fechado;
        }
        redesenharAtendimentos();
        no('carregar-fotos').onclick = buscarFotos;
        no('voltar').onclick = function () { revisao = null; no('confirmacao').hidden = true; if (!editando) { no('dados').disabled = false; ok.textContent = 'Revisar e abrir chamado'; } };
        if (!editando) {
          no('cliente').oninput = function () {
            contato = null; ++versaoContato; ++versaoFotos; anexos = []; no('fotos').textContent = ''; selecionado = null; modoAtendimento = 'nenhum'; atendimentos = []; redesenharAtendimentos();
            no('locacao').disabled = true; no('locacao').innerHTML = '<option value="">Escolha um cliente</option>'; clearTimeout(timerBusca);
            var termo = no('cliente').value.trim(), v = versaoContato; no('contatos').textContent = '';
            if (termo.length < 2) return;
            timerBusca = setTimeout(function () {
              GI.buscarContatos(termo).then(function (ps) {
                if (v !== versaoContato || !caixa.isConnected) return;
                no('contatos').innerHTML = ps.length ? ps.map(function (p, i) { return '<button type="button" class="btn btn-slim" data-contato="' + i + '">' + e(p.name) + ' · ' + e(p.phone) + '</button>'; }).join('') : 'Nenhum contato encontrado.';
                no('contatos').querySelectorAll('[data-contato]').forEach(function (b) { b.onclick = function () { escolherContato(ps[Number(b.dataset.contato)]); }; });
              }).catch(function (err) { if (v === versaoContato) mensagem(erro(err)); });
            }, 400);
          };
          ok.addEventListener('click', function (ev) {
            if (revisao) return;
            ev.stopImmediatePropagation();
            try {
              revisao = dados(); mensagem('');
              no('confirmacao-texto').textContent = 'Abrir chamado para ' + contato.name + '\nImóvel: ' + locacoes[Number(no('locacao').value)].imovel_titulo + '\nAtendente: ' +
                (revisao.atendente && revisao.atendente.nome || 'Sem atendente') + '\nAtendimento: ' + atendimentoTexto(revisao.atendimento) + (modoAtendimento === 'manual' ? ' · informado, não verificado' : '') +
                '\n' + GI.CHAMADO_CATEGORIAS[revisao.categoria] + ' · ' + GI.CHAMADO_PRIORIDADES[revisao.prioridade] + '\n' + revisao.titulo + '\n' + revisao.descricao + '\nAcesso: ' +
                revisao.acesso.disponibilidade + ' · ' + (revisao.acesso.sem_cliente ? 'Pode entrar sem o cliente' : 'Com o cliente') + '\nChaves: ' + revisao.acesso.chaves + '\nFotos: ' + revisao.anexos.length;
              no('confirmacao').hidden = false; no('confirmar-acao').hidden = true; no('dados').disabled = true; ok.textContent = 'Abrir chamado'; no('confirmacao').scrollIntoView({ block: 'nearest' }); ok.focus();
            } catch (err) { mensagem(erro(err)); }
          }, true);
        } else {
          no('dados').addEventListener('input', function () { dadosAlterados = true; });
          no('orcamentos').textContent = 'Carregando orçamentos, prestadores e alçada…';
          Promise.allSettled([GI.prestadores(), GI.manutencaoConfig()]).then(function (rs) {
            if (!caixa.isConnected) return;
            if (rs[0].status === 'fulfilled') prestadores = rs[0].value.rows || [];
            if (rs[1].status === 'fulfilled') configManutencao = rs[1].value;
            desenharFatia4();
            no('sla').textContent = GI.chamadoPrazo(c) + ' · resposta: ' + data(c.sla && c.sla.prazo_resposta_em) + ' · solução: ' + data(c.sla && c.sla.prazo_solucao_em);
            if (rs.some(function (r) { return r.status === 'rejected'; })) mensagem('Não foi possível consultar todos os prestadores ou a alçada. Feche e reabra para tentar novamente. Os dados do chamado foram preservados.');
          });
          if (c.atendimento && idValido(c.atendimento.chat_id)) sdk('chats', 'get', [c.atendimento.chat_id]).then(function (chat) {
            if (!caixa.isConnected || dadosAlterados) return;
            no('verificacao').textContent = Number(chat.contactId) === Number(c.solicitante.contato_id) ? 'Atendimento consultado no EvoTalks para este solicitante' : 'Vínculo não verificado para este solicitante. Confira antes de avisar o cliente.';
          }).catch(function () { /* O vínculo informado continua explicitamente não verificado. */ });
          historico(detalhe.eventos || []); fotosSalvas();
          no('trocar').onclick = function () {
            no('escolha-atendimento').hidden = !no('escolha-atendimento').hidden;
            if (!no('escolha-atendimento').hidden && c.solicitante.contato_id) carregarAtendimentos(c.solicitante.contato_id, versaoContato).catch(function (err) { mensagem(erro(err)); });
          };
          no('abrir-atendimento').onclick = function () { sdk('chats', 'select', [c.atendimento.chat_id]).catch(function (err) { mensagem(erro(err)); }); };
          function mudarStatus(destino) {
            if (no('nota').value.trim()) { mensagem('Salve a nota antes de alterar o status.'); return; }
            if (dadosAlterados) { mensagem('Atualize os dados digitados antes de alterar o status.'); return; }
            var motivo = no('motivo') && no('motivo').value.trim();
            confirmarAcao('Alterar ' + GI.chamadoNumero(c.numero) + ' de ' + GI.CHAMADO_STATUS[c.status] + ' para ' + GI.CHAMADO_STATUS[destino] + '?' + (motivo ? '\nMotivo: ' + motivo : ''), function () {
              if (dadosAlterados || no('nota').value.trim()) return Promise.reject(new Error('Salve os dados e a nota antes de alterar o status.'));
              return GI.chamadosStatus(c.id, destino, motivo).then(function () { mudou = true; return GI.chamadosObter(c.id); }).then(function () {
                // A releitura confirma o estado antes de remontar o formulário.
                var fechar = caixa.closest('.gi-modal').querySelector('[data-cancelar]');
                fechar.disabled = false; fechar.click();
                return abrirEdicao(c.id);
              });
            });
          }
          if (fechado) no('reabrir').onclick = function () { mudarStatus('triagem'); };
          else no('mudar-status').onclick = function () { mudarStatus(no('status').value); };
          no('salvar-nota').onclick = salvarNota;
        }
      },
      aoConfirmar: function () {
        if (ocupado) throw new Error('Aguarde a operação em andamento.');
        if (editando && no('nota').value.trim()) throw new Error('Salve a nota interna antes de atualizar o chamado.');
        var d = editando ? dados() : revisao;
        if (!d) throw new Error('Revise o chamado antes de confirmar.');
        ocupado = true;
        no('dados').disabled = true;
        if (editando) { no('nota').disabled = true; no('avisar').disabled = true; }
        return (editando ? GI.chamadosAtualizar(c.id, d) : GI.chamadosCriar(d)).then(function (r) {
          mudou = true;
          var novos = editando ? anexosSelecionados() : [];
          return (novos.length ? GI.chamadosAnexos(c.id, novos) : Promise.resolve()).then(function () { return GI.chamadosObter(r.chamado.id); }).then(function (lido) { return lido.chamado; });
        }).catch(function (err) {
          if (!editando && !mudou) { revisao = null; no('dados').disabled = false; no('confirmacao').hidden = true; caixa.closest('.gi-modal').querySelector('[data-ok]').textContent = 'Revisar e abrir chamado'; }
          if (mudou) {
            // Nunca repete uma criação aceita só porque a releitura falhou.
            caixa.closest('.gi-modal').querySelector('[data-ok]').hidden = true;
            mensagem('Dados gravados. Não repita a criação. Feche e consulte a lista para confirmar o resultado. ' + erro(err));
          }
          throw new Error(erro(err));
        }).finally(function () {
          ocupado = false;
          if (editando && !mudou) { no('dados').disabled = fechado; no('nota').disabled = false; no('avisar').disabled = false; }
        });
      }
    }).then(function (r) { clearTimeout(timerBusca); ++versaoContato; ++versaoFotos; return (r || mudou) ? carregar().then(function () { return r; }) : null; });
  }
  function abrirEdicao(id) { return GI.chamadosObter(id).then(formulario); }
  function cancelar(c) {
    return GI.modal({ titulo: 'Cancelar ' + GI.chamadoNumero(c.numero), largura: 480,
      corpo: '<p>Confirme o cancelamento. O chamado e seu histórico serão mantidos.</p><div class="gi-campo-caixa"><label for="c-cancelamento">Motivo (opcional)</label><input id="c-cancelamento"></div>', rotuloOk: 'Confirmar cancelamento', perigo: true,
      aoConfirmar: function (caixa) { return GI.chamadosStatus(c.id, 'cancelado', caixa.querySelector('input').value.trim()).then(function () { return GI.chamadosObter(c.id); }).catch(function (err) { throw new Error(erro(err)); }); }
    }).then(function (r) { if (r) return carregar(); });
  }
  GI.pronto(function () {
    el('gi-nav').innerHTML = GI.cabecalho('gi-chamados'); GI.ligarNavegacao(); GI.manutencaoMostrarModo();
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
    return carregar();
  });
})();
