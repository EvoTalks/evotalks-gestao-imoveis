/* Contrato compartilhado pelas telas de manutenção. Nenhum fallback para storage. */
(function () {
  'use strict';
  GI.plural = function (n, singular, plural) { return Number(n) === 1 ? singular : plural; };
  GI.CHAMADO_STATUS = { novo: 'Novo', triagem: 'Triagem', orcamento: 'Orçamento', aprovacao: 'Aprovação',
    agendado: 'Agendado', execucao: 'Em execução', concluido: 'Concluído', cancelado: 'Cancelado' };
  GI.CHAMADO_STATUS_CLASSES = { novo: 'gi-estado-off', triagem: 'gi-estado-off', orcamento: 'gi-estado-pendente',
    aprovacao: 'gi-estado-pendente', agendado: 'gi-estado-azul', execucao: 'gi-estado-azul', concluido: 'gi-estado-ok', cancelado: 'gi-estado-cancelado' };
  GI.CHAMADO_PRIORIDADES = { emergencia: 'Emergência', alta: 'Alta', normal: 'Normal' };
  GI.CHAMADO_PRIORIDADE_CLASSES = { emergencia: 'gi-prio--emerg', alta: 'gi-prio--alta', normal: 'gi-prio--normal' };
  GI.CHAMADO_CATEGORIAS = { hidraulica: 'Hidráulica', eletrica: 'Elétrica', gas: 'Gás', estrutura: 'Estrutura',
    esquadrias: 'Esquadrias', pintura: 'Pintura', chaveiro: 'Chaveiro', outros: 'Outros' };
  GI.CHAMADO_CATEGORIA_CLASSES = {};
  Object.keys(GI.CHAMADO_CATEGORIAS).forEach(function (k) { GI.CHAMADO_CATEGORIA_CLASSES[k] = 'gi-categoria--' + k; });

  function demonstracao() { return GI.cfg('modoDemonstracao', false) === true; }
  /* GI.pronto verifica /info antes de chamar a tela. A barreira precisa existir antes disso. */
  var definirModo = GI.definirModo, chamarPortal = GI.chamarPortal;
  GI.definirModo = function () {
    if (demonstracao()) { GI.modo = 'demonstracao'; return Promise.resolve(GI.modo); }
    return definirModo();
  };
  GI.chamarPortal = function (rota, op) {
    if (demonstracao()) return Promise.reject(new Error('Demonstração sem rede: use os dados sintéticos da tela.'));
    return chamarPortal(rota, op);
  };
  GI.manutencaoMostrarModo = function () {
    var no = document.getElementById('gi-modo');
    if (!no) return;
    no.textContent = demonstracao() ? 'DEMONSTRAÇÃO · dados sintéticos · sem rede nem gravação no portal.' :
      GI.modo === 'portal' ? 'Conectado ao portal · manutenção.' : 'Manutenção exige o portal conectado. Nenhuma alteração será gravada.';
  };
  function pedir(rota, corpo) {
    if (GI.modo !== 'portal' || demonstracao()) return Promise.reject(new Error('Manutenção exige o portal conectado.'));
    return GI.chamarPortal(rota, corpo === undefined ? undefined : { corpo: corpo });
  }
  function query(filtros) {
    var partes = [];
    Object.keys(filtros || {}).forEach(function (k) {
      var v = filtros[k];
      if (v !== '' && v !== null && v !== undefined) partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return partes.length ? '?' + partes.join('&') : '';
  }
  function id(v) { return encodeURIComponent(v); }
  GI.chamados = function (f) { return pedir('/chamados' + query(f)); };
  GI.chamadosObter = function (n) { return pedir('/chamados/' + id(n)); };
  GI.chamadosCriar = function (d) { return pedir('/chamados', d); };
  GI.chamadosAtualizar = function (n, d) { return pedir('/chamados/' + id(n), d); };
  GI.chamadosStatus = function (n, status, motivo) { return pedir('/chamados/' + id(n) + '/status', { status: status, motivo: motivo }); };
  GI.chamadosNota = function (n, d) { return pedir('/chamados/' + id(n) + '/notas', d); };
  GI.chamadosAnexos = function (n, anexos) { return pedir('/chamados/' + id(n) + '/anexos', { anexos: anexos }); };
  GI.chamadosAnexoUpload = function (n, corpo) { return pedir('/chamados/' + id(n) + '/anexos/upload', corpo); };
  GI.chamadosAnexoArquivo = function (n, aid) { return pedir('/chamados/' + id(n) + '/anexos/' + id(aid) + '/arquivo'); };
  GI.chamadosPorLocacao = function (n, f) { return pedir('/locacoes/' + id(n) + '/chamados' + query(f)); };
  GI.chamadosPorContato = function (n, f) { return pedir('/contatos/' + id(n) + '/chamados' + query(f)); };
  GI.chamadosAtendimentosVinculados = function (n) { return pedir('/atendimentos/vinculados' + query({ contato_id: n })); };
  GI.chamadosPrestador = function (n, prestador) { return pedir('/chamados/' + id(n) + '/prestador', { prestador_id: prestador }); };
  GI.chamadosVisita = function (n, d) { return pedir('/chamados/' + id(n) + '/visita', d); };
  GI.chamadosOrcamentoCriar = function (n, d) { return pedir('/chamados/' + id(n) + '/orcamentos', d); };
  GI.chamadosOrcamentoEscolher = function (n, o) { return pedir('/chamados/' + id(n) + '/orcamentos/' + id(o) + '/escolher', {}); };
  GI.chamadosOrcamentoApagar = function (n, o) { return pedir('/chamados/' + id(n) + '/orcamentos/' + id(o) + '/apagar', {}); };
  GI.chamadosAprovacao = function (n, d) { return pedir('/chamados/' + id(n) + '/aprovacao', d); };
  GI.prestadores = function (f) { return pedir('/prestadores' + query(f)); };
  GI.prestadoresCriar = function (d) { return pedir('/prestadores', d); };
  GI.prestadoresAtualizar = function (n, d) { return pedir('/prestadores/' + id(n), d); };
  GI.prestadoresAtivar = function (n) { return pedir('/prestadores/' + id(n) + '/ativar', {}); };
  GI.prestadoresDesativar = function (n) { return pedir('/prestadores/' + id(n) + '/desativar', {}); };
  GI.manutencaoConfig = function () { return pedir('/config/manutencao'); };
  GI.manutencaoConfigSalvar = function (d) { return pedir('/config/manutencao', d); };

  /* Retornam apenas texto ou dados: o consumidor escapa texto antes de usar innerHTML. */
  GI.chamadoNumero = function (numero) {
    var n = Number(numero);
    return Number.isSafeInteger(n) && n > 0 ? 'OS-' + n : '—';
  };
  GI.normalizarPrestador = function (v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  };
  GI.chatAberto = function (chat, contatoId) {
    return !!(chat && Number.isSafeInteger(Number(chat.id)) && Number(chat.id) > 0 && Number(contatoId) > 0 &&
      Number(chat.contactId) === Number(contatoId) && ['active', 'waiting', 'open', 'pending', 'queued'].includes(chat.status));
  };
  GI.mesclarAtendimentos = function (listas, contatoId, filas) {
    var rows = [];
    listas.forEach(function (lista) { (Array.isArray(lista) ? lista : []).forEach(function (a) {
      if (!GI.chatAberto(a, contatoId) || rows.some(function (r) { return r.chat_id === Number(a.id); })) return;
      var fila = (filas || []).find(function (f) { return Number(f.id) === Number(a.queueId); });
      var inicio = a.startedAt;
      if (typeof inicio === 'number') inicio = Number.isFinite(new Date(inicio).getTime()) ? new Date(inicio).toISOString() : null;
      rows.push({ chat_id: Number(a.id), protocolo: a.protocol || null, canal: GI.canalAtendimento(a.channel),
        fila: fila && fila.name || (a.queueId ? 'Fila ' + a.queueId : null), iniciado_em: inicio || null, vivo: true, ultima: '' });
    }); });
    return rows;
  };
  GI.unirHistoricoAtendimentos = function (historico, abertos) {
    var mapa = Object.create(null);
    (abertos || []).forEach(function (a) { mapa[a.chat_id] = Object.assign({}, a); });
    (historico || []).forEach(function (a) {
      var n = Number(a.id);
      if (!Number.isSafeInteger(n) || n <= 0) return;
      var anterior = mapa[n] || {};
      mapa[n] = { chat_id: n, protocolo: a.protocol || null, canal: GI.canalAtendimento(a.origin),
        fila: a.qname || anterior.fila || null, iniciado_em: a.begintime || anterior.iniciado_em || null,
        vivo: Number(a.status) === 1, motivo: a.endreason || '', ultima: anterior.ultima || '' };
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
      return (Date.parse(b.iniciado_em) || 0) - (Date.parse(a.iniciado_em) || 0) || b.chat_id - a.chat_id;
    });
  };
  GI.canalAtendimento = function (origem) {
    // Os números pertencem ao host; não deduzir o canal pelo número da origem.
    var tipos = window.omni && window.omni.queueTypes || {};
    var rotulos = { WHATSAPP: 'WhatsApp', WABA: 'WhatsApp', TELEGRAM: 'Telegram', MESSENGER: 'Messenger',
      FACEBOOK: 'Messenger', WEBCHAT: 'WebChat', INSTAGRAM: 'Instagram', EMAIL: 'E-mail', SMS: 'SMS' };
    var nome = Object.keys(tipos).find(function (k) { return tipos[k] != null && String(tipos[k]) === String(origem); });
    var chave = nome && nome.split('_')[0];
    if (Object.hasOwn(rotulos, chave)) return rotulos[chave];
    // Compatibilidade com atendimentos e vínculos antigos que já trazem o rótulo.
    return Object.keys(rotulos).some(function (k) { return rotulos[k] === origem; }) ? origem : 'Atendimento';
  };
  GI.atendimentoPortal = function (chat) {
    function texto(v) { return typeof v === 'string' ? v.trim() || null : typeof v === 'number' && Number.isFinite(v) ? String(v) : null; }
    var inicio = chat.startedAt;
    var data = typeof inicio === 'number' || typeof inicio === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(inicio) ? new Date(inicio) : null;
    return { chat_id: chat.id, protocolo: texto(chat.protocol), canal: GI.canalAtendimento(chat.channel),
      fila: texto(chat.queueId), iniciado_em: data && Number.isFinite(data.getTime()) ? data.toISOString() : null };
  };
  GI.erroAbrirChamado = function (err) {
    if (err.status === 429) return 'Limite de consultas atingido. Aguarde cerca de um minuto e tente novamente.';
    if (!err.status || [502, 503, 504].indexOf(err.status) >= 0) return 'O portal não respondeu. Tente de novo em instantes.';
    var mensagens = { titulo: 'Informe o título do chamado.', descricao: 'Revise a descrição do chamado.',
      categoria: 'Selecione a categoria do chamado.', prioridade: 'Selecione a urgência do chamado.',
      locacao_id: 'A residência não pôde ser lida. Atualize o painel e tente de novo.',
      'solicitante.nome': 'O nome do solicitante não pôde ser lido. Atualize o painel e tente de novo.',
      'solicitante.contato_id': 'O contato não pôde ser lido. Atualize o painel e tente de novo.',
      'solicitante.telefone': 'O telefone do solicitante não pôde ser lido. Atualize o painel e tente de novo.',
      solicitante: 'O solicitante não pôde ser lido. Atualize o painel e tente de novo.',
      atendente: 'O atendente não pôde ser lido. Atualize o painel e tente de novo.',
      'atendente.nome': 'O nome do atendente não pôde ser lido. Atualize o painel e tente de novo.',
      'atendente.user_id': 'O atendente não pôde ser lido. Atualize o painel e tente de novo.',
      atendimento: 'O atendimento não pôde ser lido. Atualize o painel e tente de novo.',
      'atendimento.canal': 'O canal do atendimento não pôde ser lido. Atualize o painel e tente de novo.',
      'atendimento.iniciado_em': 'O início do atendimento não pôde ser lido. Atualize o painel e tente de novo.',
      'atendimento.protocolo': 'O protocolo do atendimento não pôde ser lido. Atualize o painel e tente de novo.',
      'atendimento.fila': 'A fila do atendimento não pôde ser lida. Atualize o painel e tente de novo.',
      'atendimento.chat_id': 'O atendimento não pôde ser lido. Atualize o painel e tente de novo.',
      acesso: 'Revise os dados de acesso ao imóvel.', 'acesso.disponibilidade': 'Revise quando é possível entrar no imóvel.',
      'acesso.chaves': 'Revise as informações das chaves.', 'acesso.sem_cliente': 'Revise a autorização para entrar sem o cliente.',
      anexos: 'Revise as fotos selecionadas.', origem: 'A origem do chamado não pôde ser lida. Atualize o painel e tente de novo.' };
    if ((err.status === 400 || err.status === 422) && err.dados && err.dados.campos) {
      var campos = Object.keys(err.dados.campos);
      if (campos.length && campos.every(function (k) { return Object.hasOwn(mensagens, k); })) {
        return campos.map(function (k) { return mensagens[k]; }).join(' ');
      }
    }
    return 'Não foi possível abrir o chamado. Confira os dados e tente de novo.';
  };
  GI.atendimentoTexto = function (a) {
    if (!a) return 'Nenhum atendimento vinculado';
    var chat = Number.isSafeInteger(Number(a.chat_id)) && Number(a.chat_id) > 0;
    if (!chat) return 'Protocolo ' + (a.protocolo || 'informado') + ' · sem conversa vinculada';
    var partes = ['#' + Number(a.chat_id)];
    if (a.canal != null && a.canal !== '') partes.push(typeof a.canal === 'number' ? GI.canalAtendimento(a.canal) : a.canal);
    if (a.protocolo) partes.push(a.protocolo);
    if (typeof a.iniciado_em === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a.iniciado_em) && Number.isFinite(Date.parse(a.iniciado_em))) partes.push(GI.dataHora(a.iniciado_em));
    return partes.join(' · ');
  };
  GI.chamadoTrilha = function (status) {
    var ordem = ['novo', 'triagem', 'orcamento', 'aprovacao', 'agendado', 'execucao', 'concluido'];
    var atual = ordem.indexOf(status);
    return ordem.map(function (s, i) { return { status: s, rotulo: GI.CHAMADO_STATUS[s], feito: atual > i,
      atual: atual === i, cancelado: status === 'cancelado' }; });
  };
  function instante(v) {
    if (typeof v === 'number' || v instanceof Date) return Number(new Date(v));
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : NaN;
  }
  function duracao(ms) {
    var min = Math.max(1, Math.ceil(Math.abs(ms) / 60000));
    var h = Math.floor(min / 60), d = Math.floor(h / 24);
    return d ? d + 'd' + (h % 24 ? ' ' + h % 24 + 'h' : '') : h ? h + 'h' + (min % 60 ? ' ' + min % 60 + 'min' : '') : min + 'min';
  }
  GI.chamadoPrazo = function (chamado, agora) {
    chamado = chamado || {};
    if (chamado.status === 'concluido') return 'Concluído';
    if (chamado.status === 'cancelado') return 'Cancelado';
    var sla = chamado.sla || {}, t = instante(agora === undefined ? Date.now() : agora);
    if (!Number.isFinite(t)) return 'Prazo não informado';
    var resposta = instante(sla.prazo_resposta_em), solucao = instante(sla.prazo_solucao_em);
    if (!sla.primeira_resposta_em && Number.isFinite(resposta) && resposta <= t) return 'Responder já';
    if (sla.pausado) {
      var desde = instante(sla.pausado_desde || chamado.sla_pausado_desde || chamado.status_desde);
      return 'SLA pausado' + (Number.isFinite(desde) && desde <= t ? ' há ' + duracao(t - desde) : '') + ' · espera o proprietário';
    }
    var limite = !sla.primeira_resposta_em && Number.isFinite(resposta) ? resposta : solucao;
    if (!Number.isFinite(limite)) return 'Prazo não informado';
    return limite <= t ? 'Atrasado há ' + duracao(t - limite) : 'Vence em ' + duracao(limite - t);
  };
  GI.mascaraDocumento = function (valor) {
    var n = String(valor || '').replace(/\D/g, '');
    if (n.length === 11) return '***.' + n.slice(3, 6) + '.' + n.slice(6, 9) + '-**';
    if (n.length === 14) return '**.' + n.slice(2, 5) + '.' + n.slice(5, 8) + '/****-**';
    return '—';
  };
  GI.mascaraTelefone = function (valor) {
    var n = String(valor || '').replace(/\D/g, '');
    if (n.slice(0, 2) === '55' && (n.length === 12 || n.length === 13)) n = n.slice(2);
    if (n.length !== 10 && n.length !== 11) return '—';
    return '(' + n.slice(0, 2) + ') ' + n.slice(2, -4) + '-' + n.slice(-4);
  };
})();
