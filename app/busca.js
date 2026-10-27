/* Cockpit de busca: funções puras de formatação e de parâmetros. ES5, sem DOM. */
(function (global) {
  'use strict';
  var GI = global.GI || (global.GI = {});
  var B = GI.busca = {};

  function tem(v) { return v !== undefined && v !== null && v !== ''; }
  function inteiro(v) { var n = Number(v); return tem(v) && Number.isFinite(n) ? n : null; }

  /* Valores do portal chegam em centavos, como no detalhe do imóvel. */
  B.moeda = function (centavos, sufixo) {
    var n = inteiro(centavos);
    if (n === null || n <= 0) return '';  /* 0 conta como não informado */
    var reais = n / 100;
    return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: n % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + (sufixo || '');
  };
  B.ehLocacao = function (t) { return /^loca|aluguel/i.test(String(t || '')); };
  B.rotuloTransacao = function (t) { return B.ehLocacao(t) ? 'Locação' : /venda/i.test(String(t || '')) ? 'Venda' : String(t || ''); };

  /* "3 quartos (1 suíte) · 2 vagas · 120 m²", omitindo o que for nulo ou zero. */
  B.comodos = function (i) {
    var q = inteiro(i.quartos), s = inteiro(i.suites), v = inteiro(i.vagas), a = inteiro(i.area_m2), partes = [];
    if (q) partes.push(q + (q === 1 ? ' quarto' : ' quartos') + (s ? ' (' + s + (s === 1 ? ' suíte' : ' suítes') + ')' : ''));
    else if (s) partes.push(s + (s === 1 ? ' suíte' : ' suítes'));
    if (v) partes.push(v + (v === 1 ? ' vaga' : ' vagas'));
    if (a) partes.push(a.toLocaleString('pt-BR') + ' m²');
    return partes.join(' · ');
  };
  /* Locação: aluguel por mês; Venda: valor de venda. Sem transação, o que existir. */
  B.valor = function (i) {
    var loc = B.ehLocacao(i.transacao);
    if (loc || (!tem(i.transacao) && !tem(i.valor_venda))) {
      var m = B.moeda(i.valor_aluguel, '/mês') || B.moeda(i.valor_total_mensal, '/mês');
      if (m) return m;
    }
    return B.moeda(i.valor_venda) || B.moeda(i.valor_aluguel, '/mês');
  };
  B.informacao = function (i) {
    var local = [i.bairro, i.cidade].filter(Boolean).join(', ');
    return [i.tipo, local, i.codigo_curto || i.codigo].filter(Boolean).join(' · ');
  };
  B.situacao = function (s) {
    return ({ disponivel: { rotulo: 'Disponível', classe: 'ok' }, reservado: { rotulo: 'Reservado', classe: 'pendente' }, indisponivel: { rotulo: 'Indisponível', classe: 'escuro' } })[s] || null;
  };

  /* HTML do anúncio para texto simples. */
  B.textoLimpo = function (html) {
    var t = String(html == null ? '' : html)
      .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h[1-6]|ul|ol)\s*>/gi, '\n').replace(/<\s*li\b[^>]*>/gi, '- ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '');
    var nomeadas = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', ordm: 'º', ordf: 'ª', deg: '°', sup2: '²', sup3: '³' };
    var marcas = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308' };
    'aeiouAEIOU'.split('').forEach(function (v) { Object.keys(marcas).forEach(function (m) { nomeadas[v + m] = (v + marcas[m]).normalize('NFC'); }); });
    t = t.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, function (m, d, h, n) {
      try {
        if (d) return String.fromCodePoint(Number(d));
        if (h) return String.fromCodePoint(parseInt(h, 16));
      } catch (e) { return m; }  /* entidade numérica fora do Unicode */
      return Object.prototype.hasOwnProperty.call(nomeadas, n) ? nomeadas[n] : m;
    });
    return t.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  };

  /* Máscara do campo "Valor até": só dígitos, com pontos de milhar. */
  B.mascaraReais = function (texto) {
    var d = String(texto || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  B.reaisDaMascara = function (texto) { var d = String(texto || '').replace(/\D/g, ''); return d ? Number(d) : null; };

  /* Parâmetros do GET /busca; só vai o que foi escolhido. */
  B.parametros = function (f, pagina, porPagina) {
    var q = [];
    function add(k, v) { if (tem(v)) q.push(k + '=' + encodeURIComponent(v)); }
    add('texto', String(f.texto || '').trim());
    add('transacao', f.transacao);
    add('cidade', f.cidade);
    add('bairro', f.bairro);
    add('quartos_min', f.quartos);
    add('valor_max', f.valor);
    add('pagina', pagina || 1);
    add('por_pagina', porPagina || 20);
    return q.join('&');
  };
  B.filtrosAtivos = function (f) { return !!(String(f.texto || '').trim() || f.transacao || f.cidade || f.bairro || f.quartos || f.valor); };

  /* Campos internos do portal: {rotulo, texto, valor_centavos, observacao}. Aceita também o formato antigo {nome, valor}. */
  B.internos = function (lista) {
    return (Array.isArray(lista) ? lista : []).map(function (c) {
      if (!c || typeof c !== 'object') return null;
      var nome = String(c.rotulo || c.nome || '').trim();
      var texto = tem(c.texto) ? String(c.texto) : tem(c.valor) ? String(c.valor) : B.moeda(c.valor_centavos);
      var obs = tem(c.observacao) ? String(c.observacao).trim() : '';
      return nome && String(texto).trim() ? { nome: nome, valor: String(texto), obs: obs } : null;
    }).filter(Boolean);
  };
  /* Anexa uma página sem repetir códigos; devolve a lista nova e quantos entraram. */
  B.mesclar = function (atuais, novos) {
    var vistos = {}, saida = (atuais || []).slice(), entrou = 0;
    saida.forEach(function (i) { vistos[i.codigo] = true; });
    (novos || []).forEach(function (i) { if (i && !vistos[i.codigo]) { vistos[i.codigo] = true; saida.push(i); entrou++; } });
    return { itens: saida, entrou: entrou };
  };
  B.TTL_DETALHE = 3 * 60 * 1000;
  B.cacheFresco = function (entrada, agora) { return !!entrada && agora - entrada.em < B.TTL_DETALHE; };
  B.urlSegura = function (v) { return /^https?:\/\//i.test(String(v || '')) ? String(v) : ''; };
  B.contagem = function (total) { total = Number(total) || 0; return total.toLocaleString('pt-BR') + (total === 1 ? ' imóvel' : ' imóveis'); };
  B.MENSAGEM_JANELA = 'Fora da janela de 24 h do WhatsApp: envie um modelo antes';
  B.cortar = function (texto) {
    var m = String(texto || 'erro desconhecido').replace(/\s+/g, ' ').trim();
    return m.length > 100 ? m.slice(0, 97) + '…' : m;
  };
})(typeof window !== 'undefined' ? window : globalThis);
