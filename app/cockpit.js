/* Regras de apresentação e snapshot do cockpit. Só dados lidos do portal. */
(function () {
  'use strict';
  function aberto(c) { return c.status !== 'concluido' && c.status !== 'cancelado'; }
  function atrasado(c) {
    var s = c.sla || {};
    return aberto(c) && !s.pausado && ((!s.primeira_resposta_em && Date.parse(s.prazo_resposta_em) < Date.now()) || Date.parse(s.prazo_solucao_em) < Date.now());
  }
  function aceita(c, filtro) {
    if (filtro === 'abertos') return aberto(c);
    if (filtro === 'atrasados') return atrasado(c);
    if (filtro === 'aguardando') return aberto(c) && (c.aprovacao || {}).status === 'pendente';
    if (filtro === 'emergencias') return aberto(c) && c.prioridade === 'emergencia';
    return true;
  }
  function resumo(rows) {
    var r = {};
    ['abertos', 'atrasados', 'aguardando', 'emergencias'].forEach(function (k) { r[k] = rows.filter(function (c) { return aceita(c, k); }).length; });
    return r;
  }
  function ligado(c, chatId) { return Number((c.atendimento || {}).chat_id) === Number(chatId); }
  function listar(rows, filtro, busca, chatId) {
    var ordem = { emergencia: 0, alta: 1, normal: 2 };
    function prioridade(c) { return Object.hasOwn(ordem, c.prioridade) ? ordem[c.prioridade] : 3; }
    return rows.filter(function (c) { return aceita(c, filtro) && (String(c.titulo || '') + ' OS-' + c.numero).toLowerCase().indexOf(busca.toLowerCase()) >= 0; }).sort(function (a, b) {
      return Number(ligado(b, chatId)) - Number(ligado(a, chatId)) || Number(!aberto(a)) - Number(!aberto(b)) || prioridade(a) - prioridade(b) || Number(atrasado(b)) - Number(atrasado(a)) || Number(!!(a.sla || {}).pausado) - Number(!!(b.sla || {}).pausado) || Number(b.numero) - Number(a.numero);
    });
  }
  // Lista permitida recursiva: nunca persistir fotos, arquivos ou credenciais.
  var campos = ('id numero locacao_id titulo descricao categoria prioridade status criado_em atualizado_em imovel imovel_codigo imovel_titulo imovel_endereco imovel_bairro imovel_cidade contrato_numero inicio fim valor_aluguel_centavos papel_do_contato contatos contato_id nome papel telefone codigo endereco bairro cidade fora_do_catalogo solicitante atendente user_id atendimento chat_id protocolo canal fila iniciado_em quem_paga valor_estimado_centavos prestador orcamentos_total aprovacao enviada_em resposta_em por observacao visita sla prazo_resposta_em prazo_solucao_em primeira_resposta_em pausado pausado_desde').split(' ');
  function limpar(v) {
    if (Array.isArray(v)) return v.map(limpar);
    if (!v || typeof v !== 'object') return v;
    var r = {};
    campos.forEach(function (k) { if (Object.hasOwn(v, k)) r[k] = limpar(v[k]); });
    return r;
  }
  function ler(rows, contatoId, agora) {
    return (Array.isArray(rows) ? rows : []).filter(function (s) { return s.contatoId === contatoId && s.em <= agora && agora - s.em < 600000 && s.dados && Array.isArray(s.dados.locacoes) && Array.isArray(s.dados.chamados); })[0] || null;
  }
  function guardar(rows, contatoId, dados, agora) {
    var r = (Array.isArray(rows) ? rows : []).filter(function (s) { return s.contatoId !== contatoId && s.em <= agora && agora - s.em < 600000; });
    var novo = { contatoId: contatoId, em: agora, dados: { locacoes: limpar(dados.locacoes || []), chamados: limpar(dados.chamados || []) } };
    if (JSON.stringify(novo).length > 59000) return r;
    r.push(novo); r = r.slice(-8);
    while (JSON.stringify(r).length > 59000) r.shift();
    return r;
  }
  GI.cockpit = { resumo: resumo, listar: listar, ligado: ligado, atrasado: atrasado, ler: ler, guardar: guardar };
})();
