/* Cockpit de busca de imóveis (chatPanel). ES5, sem dependências. */
(function (global) {
  'use strict';
  var GI = global.GI, B = GI.busca, doc = global.document;
  var POR_PAGINA = 20, MAX_FOTOS = 9;
  var icones = {
    enviar: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
    foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
    pino: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>'
  };
  function ic(n) { return '<svg class="cp-i" viewBox="0 0 24 24" aria-hidden="true">' + icones[n] + '</svg>'; }
  function esc(v) { return GI.escapar(v == null ? '' : v); }
  function el(id) { return doc.getElementById(id); }
  function tem(v) { return v !== undefined && v !== null && v !== ''; }

  var est = {
    filtros: { texto: '', transacao: '', cidade: '', bairro: '', quartos: '', valor: null },
    itens: [], total: 0, pagina: 0, seq: 0, carregando: false, opcoes: null,
    chat: null, trocando: false, evento: null, sentinela: null, nomes: {}, envio: false,
    filtrosLista: null, fim: false, opcoesFalhou: false, opcoesPendente: null, ultimoCodigo: null,
    permitirEnvio: false, detalhe: null, rolagemLista: 0, cacheDetalhe: {}, campos: null
  };
  var AVISO_OPCOES = 'Não carreguei as opções de cidade e bairro. Tento de novo ao abrir o filtro.';
  var LAG_SELECAO_MS = 6500;  /* getSelected() fica defasado por ~6 s depois da troca de conversa */

  /* ------------------------------------------------------------ recado */
  var timers = {};
  function recado(id, texto, tipo) {
    var box = el(id);
    clearTimeout(timers[id]);
    box.textContent = texto || '';
    box.hidden = !texto;
    box.className = 'cp-recado' + (tipo ? ' cp-recado--' + tipo : '');
    if (texto && tipo !== 'erro') timers[id] = setTimeout(function () { box.hidden = true; }, 6000);
  }
  function recadoAtual(texto, tipo) { recado(est.detalhe ? 'cp-recado-d' : 'cp-recado', texto, tipo); }

  /* ------------------------------------------------------------- envio */
  function idDe(c) { return c && c.id != null ? c.id : null; }
  function simples(msg, cancelado) { var e = new Error(msg); e.texto = msg; e.simples = true; e.cancelado = !!cancelado; return e; }
  function dicaEnvio() {
    if (!est.permitirEnvio) return 'Envio desligado nas Configurações da extensão';
    if (!est.chat) return 'Abra um atendimento para enviar';
    return '';
  }
  function nomeDoChat(c) {
    if (!c) return '';
    var n = c.contact && c.contact.name ? c.contact.name : c.contactId != null ? est.nomes[c.contactId] : '';
    return String(n || '').trim();
  }
  function textoDestino() {
    if (!est.chat) return 'Nenhum atendimento aberto';
    return 'Enviar para: ' + (nomeDoChat(est.chat) || 'atendimento #' + est.chat.id);
  }
  function aplicarEnvio() {
    var dica = dicaEnvio(), aviso = dica || (est.trocando ? 'Aguarde: trocando de conversa…' : '');
    el('cp-dica-envio').textContent = aviso; el('cp-dica-envio-d').textContent = aviso;
    el('cp-destino').textContent = textoDestino(); el('cp-destino-d').textContent = textoDestino();
    Array.prototype.forEach.call(doc.querySelectorAll('[data-envio]'), function (b) {
      var off = !!dica || est.envio;
      if (b.getAttribute('data-sem-selecao') === '1' && !dica) off = true;
      b.disabled = off;
      if (dica) b.title = dica; else b.title = b.getAttribute('data-titulo') || '';
    });
  }
  /* Nome do contato, quando o chat não o traz. */
  function resolverNome(c) {
    if (!c || nomeDoChat(c) || c.contactId == null || !global.omni || !omni.contacts || !omni.contacts.get) return Promise.resolve();
    return Promise.resolve().then(function () { return omni.contacts.get(c.contactId); }).then(function (k) {
      est.nomes[c.contactId] = (k && k.name) || '';
    }, function () { est.nomes[c.contactId] = ''; });
  }
  /* Chat de destino: o do evento omniChatSelected vale por 6,5 s; depois, getSelected(). */
  function lerChat() {
    return Promise.resolve().then(function () { return omni.chats.getSelected(); }).then(function (c) {
      return idDe(c) != null ? c : null;
    }, function () { return undefined; }).then(function (sel) {
      var ev = est.evento;
      if (ev && Date.now() > ev.ate) ev = est.evento = null;
      if (sel === undefined) { est.chat = ev ? ev.chat : null; est.trocando = !!ev; }
      else if (ev && idDe(sel) !== idDe(ev.chat)) { est.chat = ev.chat; est.trocando = true; }
      else { est.evento = null; est.chat = sel; est.trocando = false; }
      if (est.evento && !est.sentinela) est.sentinela = setInterval(atualizarChat, 500);
      if (!est.evento && est.sentinela) { clearInterval(est.sentinela); est.sentinela = null; }
      return resolverNome(est.chat);
    }).then(function () { aplicarEnvio(); return est.chat; });
  }
  function atualizarChat() { return lerChat(); }
  function aoSelecionar(dado) {
    var c = dado && typeof dado === 'object' ? dado : dado != null && dado !== '' ? { id: dado } : null;
    est.evento = { chat: idDe(c) != null ? c : null, ate: Date.now() + LAG_SELECAO_MS };
    aplicarEnvio(); atualizarChat();
  }
  /* Chat vigente na hora do envio; recusa enquanto a troca de conversa não assentou. */
  function chatParaEnvio() {
    return lerChat().then(function (c) {
      if (!c) throw simples('Abra um atendimento para enviar.');
      if (est.trocando) throw simples('Aguarde: trocando de conversa…');
      return c;
    });
  }
  /* Reconfere o id imediatamente antes de cada sendMessage. */
  function conferirAlvo(alvo) {
    return lerChat().then(function (c) {
      if (!c || est.trocando || c.id !== alvo.id) throw simples('A conversa mudou; envio cancelado', true);
    });
  }
  function travar(sim) { est.envio = sim; aplicarEnvio(); }
  function mensagemEnvio(err) {
    if (err && err.simples) return err.texto;
    if (err && err.code === 'forbidden') return B.MENSAGEM_JANELA;
    return 'Não consegui enviar: ' + B.cortar(GI.mensagemErro(err));
  }
  function confirmarEnvio(r) {
    if (r && r.sent === false) throw new Error('o envio não foi confirmado');
  }
  function feito(botao, texto) {
    if (!botao) return;
    var original = botao.getAttribute('data-html') || botao.innerHTML;
    botao.setAttribute('data-html', original);
    botao.innerHTML = '<span class="cp-ok">' + texto + '</span>'; botao.classList.add('cp-enviado');
    clearTimeout(botao._t);
    botao._t = setTimeout(function () { botao.innerHTML = original; botao.classList.remove('cp-enviado'); }, 3000);
  }
  function enviarCard(codigo, botao) {
    if (est.envio || dicaEnvio()) return;
    travar(true);
    var alvo;
    chatParaEnvio().then(function (c) {
      alvo = c;
      return GI.chamarPortal('/imovel/' + encodeURIComponent(codigo) + '/card', { corpo: {} });
    }).then(function (card) {
      if (!card || !card.texto) throw new Error('o portal não montou o card');
      var carga = { text: card.texto };
      if (card.fileId != null && card.fileId !== '') carga.fileId = card.fileId;
      return conferirAlvo(alvo).then(function () { return omni.chats.sendMessage(alvo.id, carga); });
    }).then(function (r) {
      confirmarEnvio(r); travar(false); feito(botao, 'Enviado ✓');
    }).catch(function (err) {
      travar(false);
      recadoAtual(mensagemEnvio(err), 'erro');
    });
  }
  function enviarFotos(codigo, indices, botao) {
    indices = indices.slice(0, MAX_FOTOS);
    if (est.envio || dicaEnvio() || !indices.length) return;
    travar(true);
    var alvo, enviadas = 0, falhas = [], janela = false;
    chatParaEnvio().then(function (c) {
      alvo = c;
      return GI.chamarPortal('/imovel/' + encodeURIComponent(codigo) + '/fotos', { corpo: { indices: indices } });
    }).then(function (r) {
      var fotos = (r && r.fotos) || [];
      return fotos.reduce(function (p, f) {
        return p.then(function () {
          if (janela) return;
          var n = Number(f.indice) + 1;
          if (f.fileId == null || f.fileId === '') { falhas.push('foto ' + n); return; }
          return conferirAlvo(alvo).then(function () { return omni.chats.sendMessage(alvo.id, { fileId: f.fileId }); }).then(function (x) {
            confirmarEnvio(x); enviadas++;
          }).catch(function (err) {
            if (err && err.cancelado) throw err;
            if (err && err.code === 'forbidden') janela = true; else falhas.push('foto ' + n);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      travar(false);
      if (janela) { recadoAtual(B.MENSAGEM_JANELA, 'erro'); return; }
      if (falhas.length) {
        recadoAtual('Não consegui enviar: ' + falhas.join(', ') + '. ' + (enviadas ? 'As outras ' + enviadas + ' foram enviadas.' : ''), 'erro');
      } else {
        recadoAtual(enviadas + (enviadas === 1 ? ' foto enviada ✓' : ' fotos enviadas ✓'), 'sucesso');
      }
    }).catch(function (err) {
      travar(false);
      recadoAtual(err && err.cancelado && enviadas ? err.texto + '. ' + enviadas + (enviadas === 1 ? ' foto já tinha ido.' : ' fotos já tinham ido.') : mensagemEnvio(err), 'erro');
    });
  }

  /* ------------------------------------------------------------- cópia */
  function copiar(texto) {
    function legado() {
      return new Promise(function (resolve, reject) {
        var t = doc.createElement('textarea');
        t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
        doc.body.appendChild(t); t.select();
        var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        doc.body.removeChild(t); ok ? resolve() : reject(new Error('copiar'));
      });
    }
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(legado);
    }
    return legado();
  }
  function aoCopiar(botao, texto) {
    copiar(texto).then(function () {
      var original = botao.getAttribute('data-html') || botao.innerHTML;
      botao.setAttribute('data-html', original);
      botao.textContent = 'Copiado ✓'; botao.classList.add('cp-copiado');
      clearTimeout(botao._t);
      botao._t = setTimeout(function () { botao.innerHTML = original; botao.classList.remove('cp-copiado'); }, 1500);
    }, function () { recadoAtual('Não consegui copiar. Selecione o texto e copie à mão.', 'erro'); });
  }

  /* ------------------------------------------------------------- selos */
  function selos(i) {
    var s = B.situacao(i.situacao), h = '';
    if (s && i.situacao !== 'disponivel') h += '<span class="cp-selo cp-selo--' + s.classe + '">' + s.rotulo + '</span>';
    if (i.restricao) {
      var campos = Array.isArray(i.restricao_campos) ? i.restricao_campos.join(', ') : '';
      h += '<span class="cp-selo cp-selo--restricao" title="' + esc(campos ? 'Restrição: ' + campos : 'Restrição') + '">Restrição</span>';
    }
    if (i.transacao) h += '<span class="cp-selo cp-selo--neutro">' + esc(B.rotuloTransacao(i.transacao)) + '</span>';
    return h;
  }
  function tituloDe(i) { return GI.tituloDoImovel ? GI.tituloDoImovel(i.titulo || i.codigo, i.bairro, i.cidade) : String(i.titulo || i.codigo || ''); }

  /* ------------------------------------------------------------- lista */
  function cardHtml(i) {
    var foto = B.urlSegura(i.imagem_principal), comodos = B.comodos(i), valor = B.valor(i);
    var total = B.ehLocacao(i.transacao) && B.moeda(i.valor_total_mensal) ? ' title="' + esc('Total com condomínio: ' + B.moeda(i.valor_total_mensal, '/mês')) + '"' : '';
    return '<li class="cp-card" data-codigo="' + esc(i.codigo) + '">' +
      '<div class="cp-foto">' + (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy">' : '<span class="cp-sem-foto">' + ic('foto') + '</span>') + '</div>' +
      '<div class="cp-card-corpo"><div class="cp-selos">' + selos(i) + '</div>' +
      '<h3 class="cp-titulo"><button type="button" class="cp-abrir" data-abrir><span>' + esc(tituloDe(i)) + '</span></button></h3>' +
      '<p class="cp-info">' + esc(B.informacao(i)) + '</p>' +
      (comodos ? '<p class="cp-comodos">' + esc(comodos) + '</p>' : '') +
      '<div class="cp-rodape"><b class="cp-valor tnum"' + total + '>' + esc(valor || 'Valor não informado') + '</b>' +
      '<button type="button" class="cp-btn cp-btn--enviar" data-envio data-enviar-card data-titulo="Enviar card ao cliente" title="Enviar card ao cliente" aria-label="Enviar card ao cliente">' + ic('enviar') + '<span>Enviar</span></button></div></div></li>';
  }
  function desenharLista(de) {
    var ul = el('cp-itens');
    if (de === 0) ul.innerHTML = '';
    ul.insertAdjacentHTML('beforeend', est.itens.slice(de).map(cardHtml).join(''));
    el('cp-vazio').hidden = est.itens.length > 0 || est.carregando || !el('cp-erro').hidden;
    el('cp-mais').hidden = est.fim || !(est.itens.length < est.total);
    el('cp-contagem').textContent = B.contagem(est.total);
    aplicarEnvio(); pedirAltura();
  }
  function copiaFiltros(f) { return { texto: f.texto, transacao: f.transacao, cidade: f.cidade, bairro: f.bairro, quartos: f.quartos, valor: f.valor }; }
  function buscar(reset) {
    var seq = ++est.seq, pagina = reset ? 1 : est.pagina + 1;
    if (!reset && !est.filtrosLista) return Promise.resolve();
    /* "Carregar mais" anexa página dos MESMOS filtros da lista atual. */
    var filtros = reset ? copiaFiltros(est.filtros) : est.filtrosLista;
    est.carregando = true;
    if (reset) { el('cp-contagem').textContent = 'buscando…'; el('cp-vazio').hidden = true; el('cp-erro').hidden = true; }
    el('cp-mais').disabled = true;
    recado('cp-recado', est.opcoesFalhou ? AVISO_OPCOES : '', est.opcoesFalhou ? 'aviso' : '');
    return GI.chamarPortal('/busca?' + B.parametros(filtros, pagina, POR_PAGINA)).then(function (r) {
      if (seq !== est.seq) return;
      var itens = (r && Array.isArray(r.itens)) ? r.itens : [];
      var de = reset ? 0 : est.itens.length, m = B.mesclar(reset ? [] : est.itens, itens);
      est.itens = m.itens; est.fim = m.entrou === 0;
      est.total = Number(r && r.total) || est.itens.length; est.pagina = pagina; est.filtrosLista = filtros;
      est.carregando = false; el('cp-mais').disabled = false;
      if (reset) el('cp-rolagem').scrollTop = 0;
      desenharLista(de);
    }).catch(function (err) {
      if (seq !== est.seq) return;
      est.carregando = false; el('cp-mais').disabled = false;
      if (reset) {
        /* A lista antiga não vale mais: os filtros mudaram e a nova busca falhou. */
        est.itens = []; est.total = 0; est.pagina = 0; est.fim = false; est.filtrosLista = null;
        el('cp-itens').innerHTML = ''; el('cp-mais').hidden = true; el('cp-vazio').hidden = true;
        el('cp-contagem').textContent = 'sem resultado';
        el('cp-erro-txt').textContent = GI.mensagemErro(err); el('cp-erro').hidden = false;
        pedirAltura();
      } else {
        el('cp-contagem').textContent = B.contagem(est.total);
        recado('cp-recado', GI.mensagemErro(err), 'erro');
      }
    });
  }

  /* ----------------------------------------------------------- filtros */
  function preencher(sel, rotulo, valores, atual) {
    sel.innerHTML = '<option value="">' + esc(rotulo) + '</option>' + valores.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    sel.value = valores.indexOf(atual) >= 0 ? atual : '';
  }
  function opcoesBairro() {
    var o = est.opcoes || {}, mapa = o.bairros || {};
    if (est.filtros.cidade) return (mapa[est.filtros.cidade] || []).slice();
    var todos = [];
    Object.keys(mapa).forEach(function (c) { (mapa[c] || []).forEach(function (b) { if (todos.indexOf(b) < 0) todos.push(b); }); });
    return todos.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }
  function atualizarFiltrosUi() {
    var f = est.filtros;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-trans]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-trans') === f.transacao)); });
    el('cp-limpar').hidden = !B.filtrosAtivos(f);
    Array.prototype.forEach.call(doc.querySelectorAll('.cp-filtros select, .cp-filtros input'), function (c) { c.classList.toggle('cp-ativo', !!c.value); });
  }
  var esperaTexto, esperaValor;
  function ligarFiltros() {
    el('cp-q').addEventListener('input', function () {
      clearTimeout(esperaTexto);
      esperaTexto = setTimeout(function () { est.filtros.texto = el('cp-q').value; atualizarFiltrosUi(); buscar(true); }, 300);
    });
    el('cp-q').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { clearTimeout(esperaTexto); est.filtros.texto = el('cp-q').value; atualizarFiltrosUi(); buscar(true); }
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-trans]'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-trans');
        est.filtros.transacao = est.filtros.transacao === v ? '' : v;
        atualizarFiltrosUi(); buscar(true);
      });
    });
    el('cp-cidade').addEventListener('change', function () {
      est.filtros.cidade = this.value; est.filtros.bairro = '';
      preencher(el('cp-bairro'), 'Bairro', opcoesBairro(), ''); atualizarFiltrosUi(); buscar(true);
    });
    el('cp-bairro').addEventListener('change', function () { est.filtros.bairro = this.value; atualizarFiltrosUi(); buscar(true); });
    el('cp-quartos').addEventListener('change', function () { est.filtros.quartos = this.value; atualizarFiltrosUi(); buscar(true); });
    el('cp-valor').addEventListener('input', function () {
      this.value = B.mascaraReais(this.value);
      clearTimeout(esperaValor);
      esperaValor = setTimeout(function () { est.filtros.valor = B.reaisDaMascara(el('cp-valor').value); atualizarFiltrosUi(); buscar(true); }, 400);
    });
    el('cp-limpar').addEventListener('click', function () {
      clearTimeout(esperaTexto); clearTimeout(esperaValor);
      est.filtros = { texto: '', transacao: '', cidade: '', bairro: '', quartos: '', valor: null };
      el('cp-q').value = ''; el('cp-cidade').value = ''; el('cp-quartos').value = ''; el('cp-valor').value = '';
      preencher(el('cp-bairro'), 'Bairro', opcoesBairro(), '');
      atualizarFiltrosUi(); buscar(true);
    });
    el('cp-mais').addEventListener('click', function () { buscar(false); });
    el('cp-tentar').addEventListener('click', function () { buscar(true); });
    el('cp-cidade').addEventListener('focus', reabrirOpcoes);
    el('cp-bairro').addEventListener('focus', reabrirOpcoes);
  }
  function carregarOpcoes() {
    if (est.opcoes) return Promise.resolve();
    if (est.opcoesPendente) return est.opcoesPendente;
    est.opcoesPendente = GI.chamarPortal('/busca/opcoes').then(function (o) {
      est.opcoes = o || {}; est.opcoesFalhou = false;
      preencher(el('cp-cidade'), 'Cidade', est.opcoes.cidades || [], est.filtros.cidade);
      preencher(el('cp-bairro'), 'Bairro', opcoesBairro(), est.filtros.bairro);
    }).catch(function () {
      est.opcoes = null; est.opcoesFalhou = true;
      recado('cp-recado', AVISO_OPCOES, 'aviso');
    }).then(function () { est.opcoesPendente = null; });
    return est.opcoesPendente;
  }
  function reabrirOpcoes() { if (est.opcoesFalhou && !est.opcoes) carregarOpcoes(); }

  /* ----------------------------------------------------------- detalhe */
  function camposInternos() {
    if (est.campos) return Promise.resolve(est.campos);
    return GI.campos().then(function (c) { est.campos = c || []; return est.campos; }, function () { return []; });
  }
  function internosDe(r, campos) {
    var lista = Array.isArray((r.imovel || {}).campos_internos) ? r.imovel.campos_internos : r.campos_internos;
    if (Array.isArray(lista)) return B.internos(lista);
    var porId = {}; campos.forEach(function (c) { porId[c.id] = c; });
    return (r.valores || []).map(function (v) {
      var c = porId[v.campo_id];
      if (c && c.ativo === false) return null;
      var vazio = v.valor_centavos == null && v.valor_num == null && (v.valor_texto == null || v.valor_texto === '') && !v.observacao;
      if (vazio) return null;
      var l = { valor: v.valor_centavos != null ? Number(v.valor_centavos) / 100 : v.valor_num != null ? Number(v.valor_num) : (v.valor_texto || ''), obs: v.observacao || '', recorrencia: v.recorrencia || undefined };
      var campo = c || { tipo: 'texto' };
      var valor = GI.valorLegivel(campo, l);
      return valor ? { nome: c ? c.nome : 'Campo ' + v.campo_id, valor: valor, obs: v.observacao || '' } : null;
    }).filter(Boolean);
  }
  function pegar(r, chave, item) {
    var im = r.imovel || {};
    if (im[chave] !== undefined && im[chave] !== null) return im[chave];
    if (r[chave] !== undefined && r[chave] !== null) return r[chave];
    return item ? item[chave] : undefined;
  }
  function montarDetalhe(r, item) {
    var im = r.imovel || {}, d = {};
    ['codigo', 'codigo_curto', 'titulo', 'tipo', 'transacao', 'cidade', 'bairro', 'quartos', 'suites', 'banheiros', 'vagas', 'area_m2', 'valor_venda', 'valor_aluguel', 'condominio', 'valor_total_mensal', 'imagem_principal', 'link', 'descricao', 'caracteristicas', 'imagens', 'situacao', 'restricao', 'restricao_campos'].forEach(function (k) { d[k] = pegar(r, k, item); });
    d.codigo = item.codigo; d.codigo_curto = d.codigo_curto || item.codigo_curto || GI.codigoCurto(item.codigo);
    d.imagens = (Array.isArray(d.imagens) ? d.imagens : []).map(function (u) { return B.urlSegura(u); });
    d.restricao_campos = Array.isArray(d.restricao_campos) ? d.restricao_campos : [];
    if (Array.isArray(im.campos_internos) || Array.isArray(r.campos_internos)) { d.internos = internosDe(r, []); return Promise.resolve(d); }
    return camposInternos().then(function (campos) { d.internos = internosDe(r, campos); return d; });
  }
  function linhas(d) {
    var l = [], dinheiro = function (v) { return tem(v) ? B.moeda(v) : ''; };
    function add(rot, v) { if (tem(v) && String(v) !== '') l.push({ rot: rot, val: String(v) }); }
    add('Código', d.codigo_curto); add('Título', tituloDe(d)); add('Tipo', d.tipo); add('Transação', B.rotuloTransacao(d.transacao));
    add('Cidade', d.cidade); add('Bairro', d.bairro);
    add('Quartos', d.quartos); add('Suítes', d.suites); add('Banheiros', d.banheiros); add('Vagas', d.vagas);
    add('Área', tem(d.area_m2) ? Number(d.area_m2).toLocaleString('pt-BR') + ' m²' : '');
    add('Valor de venda', dinheiro(d.valor_venda)); add('Aluguel', dinheiro(d.valor_aluguel)); add('Condomínio', dinheiro(d.condominio)); add('Total mensal', dinheiro(d.valor_total_mensal));
    add('Link', B.urlSegura(d.link)); add('Descrição', B.textoLimpo(d.descricao));
    var carac = Array.isArray(d.caracteristicas) ? d.caracteristicas.map(function (c) { return GI.caracteristicaTraduzida ? GI.caracteristicaTraduzida(c) : c; }) : [];
    add('Características', carac.join(', '));
    return l;
  }
  var copiaveis = [];
  function linhaHtml(l, longo) {
    var n = copiaveis.push(l.val) - 1;
    return '<div class="cp-campo' + (longo ? ' cp-campo--longo' : '') + '"><span class="cp-rot">' + esc(l.rot) + '</span><span class="cp-val">' + esc(l.val) + (l.obs ? '<small class="cp-obs">' + esc(l.obs) + '</small>' : '') + '</span>' +
      '<button type="button" class="cp-copiar" data-copiar="' + n + '" aria-label="Copiar ' + esc(l.rot) + '" title="Copiar ' + esc(l.rot) + '">📋</button></div>';
  }
  function galeriaHtml(d) {
    if (!d.imagens.length) {
      var capa = B.urlSegura(d.imagem_principal);
      return capa ? '<div class="cp-galeria"><figure class="cp-celula"><img src="' + esc(capa) + '" alt="Foto do imóvel" data-ampliar></figure></div>' : '<p class="cp-vazio">O anúncio não tem fotos.</p>';
    }
    return '<div class="cp-galeria">' + d.imagens.map(function (u, i) {
      if (!u) return '';
      return '<figure class="cp-celula" data-i="' + i + '"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + '" loading="lazy" data-ampliar>' +
        '<label class="cp-sel" title="Selecionar foto ' + (i + 1) + '"><input type="checkbox" data-sel="' + i + '" aria-label="Selecionar foto ' + (i + 1) + '"></label>' +
        '<button type="button" class="cp-foto-env" data-envio data-enviar-foto="' + i + '" data-titulo="Enviar esta foto" title="Enviar esta foto" aria-label="Enviar foto ' + (i + 1) + '">' + ic('enviar') + '</button></figure>';
    }).join('') + '</div>';
  }
  function desenharDetalhe(d) {
    copiaveis = [];
    var sit = B.situacao(d.situacao), temFotos = d.imagens.length > 0, pode = d.imagens.length > MAX_FOTOS;
    var topo = '<div class="cp-selos cp-selos--detalhe">' + (sit ? '<span class="cp-selo cp-selo--' + sit.classe + '">' + sit.rotulo + '</span>' : '') +
      (d.restricao ? '<span class="cp-selo cp-selo--restricao" title="' + esc(d.restricao_campos.length ? 'Restrição: ' + d.restricao_campos.join(', ') : 'Restrição') + '">Restrição' + (d.restricao_campos.length ? ': ' + esc(d.restricao_campos.join(', ')) : '') + '</span>' : '') +
      (d.transacao ? '<span class="cp-selo cp-selo--neutro">' + esc(B.rotuloTransacao(d.transacao)) + '</span>' : '') + '</div>';
    var h = '<h2 class="cp-d-titulo">' + esc(tituloDe(d)) + '</h2>' + topo +
      '<p class="cp-info">' + ic('pino') + esc(B.informacao(d)) + '</p>' +
      '<div class="cp-acoes">' +
      '<button type="button" class="cp-btn cp-btn--prim" data-envio data-enviar-card data-titulo="Enviar card ao cliente" title="Enviar card ao cliente">' + ic('enviar') + '<span>Enviar card</span></button>' +
      (B.urlSegura(d.link) ? '<button type="button" class="cp-btn" data-copiar-link>Copiar link</button>' : '') + '</div>';
    h += '<h3 class="cp-secao">Fotos' + (temFotos ? ' (' + d.imagens.length + ')' : '') + '</h3>' + galeriaHtml(d);
    if (temFotos) {
      h += '<div class="cp-acoes cp-acoes--fotos"><button type="button" class="cp-btn" data-envio data-sem-selecao="1" data-enviar-selecionadas data-titulo="Enviar as fotos selecionadas"><span>Enviar selecionadas (<span id="cp-n-sel">0</span>)</span></button>' +
        '<button type="button" class="cp-btn" data-envio data-enviar-todas data-titulo="Enviar as fotos (até ' + MAX_FOTOS + ')">Enviar todas' + (pode ? ' (' + MAX_FOTOS + ' primeiras)' : '') + '</button></div>';
    }
    h += '<h3 class="cp-secao">Informações</h3><div class="cp-campos">' + linhas(d).map(function (l) { return linhaHtml(l, l.rot === 'Descrição' || l.rot === 'Características' || l.rot === 'Link'); }).join('') + '</div>';
    h += '<h3 class="cp-secao cp-secao--interno">Interno (não vai ao cliente)</h3><div class="cp-campos">' +
      (d.internos.length ? d.internos.map(function (c) { return linhaHtml({ rot: c.nome, val: c.valor, obs: c.obs }, String(c.valor).length > 40 || String(c.obs || '').length > 0); }).join('') : '<p class="cp-vazio">Nenhum campo interno preenchido.</p>') + '</div>';
    el('cp-corpo').innerHTML = h;
    el('cp-corpo').scrollTop = 0;
    aplicarEnvio(); pedirAltura();
  }
  function abrirDetalhe(codigo) {
    var item = null;
    est.itens.some(function (i) { if (i.codigo === codigo) { item = i; return true; } return false; });
    if (!item) return;
    est.rolagemLista = el('cp-rolagem').scrollTop;
    est.detalhe = codigo;
    el('cp-lista').hidden = true; el('cp-detalhe').hidden = false;
    recado('cp-recado-d', '');
    el('cp-corpo').innerHTML = '<p class="cp-carregando">Carregando…</p>';
    var guardado = est.cacheDetalhe[codigo];
    if (guardado && !B.cacheFresco(guardado, Date.now())) { delete est.cacheDetalhe[codigo]; guardado = null; }
    var pronto = guardado ? Promise.resolve(guardado.d) :
      GI.chamarPortal('/imovel/' + encodeURIComponent(codigo)).then(function (r) { return montarDetalhe(r || {}, item); }).then(function (d) { est.cacheDetalhe[codigo] = { d: d, em: Date.now() }; return d; });
    pronto.then(function (d) {
      if (est.detalhe !== codigo) return;
      desenharDetalhe(d);
    }).catch(function (err) {
      if (est.detalhe !== codigo) return;
      el('cp-corpo').innerHTML = '<p class="cp-vazio"></p>';
      el('cp-corpo').firstChild.textContent = GI.mensagemErro(err);
      recado('cp-recado-d', GI.mensagemErro(err), 'erro');
    });
    el('cp-voltar').focus(); pedirAltura();
  }
  function voltar() {
    var codigo = est.detalhe;
    est.detalhe = null;
    el('cp-detalhe').hidden = true; el('cp-lista').hidden = false;
    el('cp-rolagem').scrollTop = est.rolagemLista;
    /* O foco volta ao botão de abrir do card de onde se veio. */
    var alvo = codigo && Array.prototype.filter.call(doc.querySelectorAll('.cp-card'), function (c) { return c.getAttribute('data-codigo') === codigo; })[0];
    var abrir = alvo && alvo.querySelector('[data-abrir]');
    if (abrir) { try { abrir.focus({ preventScroll: true }); } catch (_) { abrir.focus(); } }
    aplicarEnvio(); pedirAltura();
  }
  function selecionadas() {
    return Array.prototype.map.call(doc.querySelectorAll('[data-sel]:checked'), function (c) { return Number(c.getAttribute('data-sel')); });
  }
  function atualizarSelecao() {
    var n = selecionadas().length, todos = doc.querySelectorAll('[data-sel]');
    el('cp-n-sel') && (el('cp-n-sel').textContent = String(n));
    var b = doc.querySelector('[data-enviar-selecionadas]');
    if (b) b.setAttribute('data-sem-selecao', n ? '0' : '1');
    Array.prototype.forEach.call(todos, function (c) { c.disabled = !c.checked && n >= MAX_FOTOS; });
    aplicarEnvio();
  }
  function ampliar(src) {
    if (!B.urlSegura(src)) return;
    el('cp-ampliada-img').src = src; el('cp-ampliada').hidden = false; el('cp-ampliada-x').focus();
  }
  function fecharAmpliada() { if (!el('cp-ampliada').hidden) { el('cp-ampliada').hidden = true; el('cp-ampliada-img').removeAttribute('src'); return true; } return false; }

  function ligarEventos() {
    var lista = el('cp-itens');
    lista.addEventListener('click', function (ev) {
      var card = ev.target.closest('.cp-card');
      if (!card) return;
      var botao = ev.target.closest('[data-enviar-card]');
      if (botao) { ev.stopPropagation(); enviarCard(card.getAttribute('data-codigo'), botao); return; }
      abrirDetalhe(card.getAttribute('data-codigo'));  /* o mouse abre pelo card todo; o teclado, pelo botão do título */
    });
    el('cp-voltar').addEventListener('click', voltar);
    el('cp-corpo').addEventListener('click', function (ev) {
      var t = ev.target, cod = est.detalhe, d = est.cacheDetalhe[cod] && est.cacheDetalhe[cod].d, b;
      if (!d) return;
      if ((b = t.closest('[data-copiar]'))) { aoCopiar(b, copiaveis[Number(b.getAttribute('data-copiar'))]); return; }
      if ((b = t.closest('[data-copiar-link]'))) { aoCopiar(b, B.urlSegura(d.link)); return; }
      if ((b = t.closest('[data-enviar-card]'))) { enviarCard(cod, b); return; }
      if ((b = t.closest('[data-enviar-foto]'))) { enviarFotos(cod, [Number(b.getAttribute('data-enviar-foto'))], b); return; }
      if ((b = t.closest('[data-enviar-selecionadas]'))) { enviarFotos(cod, selecionadas(), b); return; }
      if ((b = t.closest('[data-enviar-todas]'))) { enviarFotos(cod, d.imagens.map(function (u, i) { return i; }), b); return; }
      if (t.hasAttribute('data-ampliar')) ampliar(t.getAttribute('src'));
    });
    el('cp-corpo').addEventListener('change', function (ev) { if (ev.target.hasAttribute('data-sel')) atualizarSelecao(); });
    el('cp-ampliada').addEventListener('click', function () { fecharAmpliada(); });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !fecharAmpliada() && est.detalhe) voltar();
    });
  }

  /* ----------------------------------------------------------- partida */
  function estado(texto) {
    var p = el('cp-estado'); p.textContent = texto; p.hidden = false;
    el('cp-lista').hidden = true; el('cp-detalhe').hidden = true;
  }
  /* Altura: o painel pede ao host (omni.ui.resize) ao abrir e quando lista/detalhe mudam. Mede o CONTEÚDO, não o
     contêiner, para não criar laço; a rolagem é interna e nunca colapsa. */
  var ALTURA_MIN = 520, ALTURA_MAX = 760;
  var alturaPedida = 0, alturaAgendada = false, alturaFixa = false, alturaEmCurso = false;
  function alturaDoConteudo(rol) {
    var base = rol.getBoundingClientRect().top - rol.scrollTop, fim = 0;
    Array.prototype.forEach.call(rol.children, function (c) {
      if (c.hidden) return;
      fim = Math.max(fim, c.getBoundingClientRect().bottom - base);
    });
    return Math.ceil(fim) + 16;
  }
  function alturaDesejada() {
    var vista = est.detalhe ? el('cp-detalhe') : el('cp-lista'), rol = est.detalhe ? el('cp-corpo') : el('cp-rolagem');
    var fora = 0;
    Array.prototype.forEach.call(vista.children, function (c) { if (c !== rol && !c.hidden) fora += c.offsetHeight + 6; });
    var aviso = doc.querySelector('body > .gi-aviso');
    return Math.min(ALTURA_MAX, Math.max(ALTURA_MIN, fora + alturaDoConteudo(rol) + (aviso ? aviso.offsetHeight : 0)));
  }
  function pedirAltura() {
    if (alturaAgendada || alturaFixa || alturaEmCurso) return;
    alturaAgendada = true;
    setTimeout(function () {
      alturaAgendada = false;
      if (alturaFixa || !global.omni || !omni.ui || !omni.ui.resize) return;
      var h = alturaDesejada();
      if (alturaPedida && Math.abs(h - alturaPedida) < 12) return;
      alturaPedida = h; alturaEmCurso = true;
      try {
        Promise.resolve(omni.ui.resize(h)).then(function (r) {
          alturaEmCurso = false;
          if (r && r.applied === false) alturaFixa = true;
        }, function () { alturaEmCurso = false; });
      } catch (_) { alturaEmCurso = false; }
    }, 0);
  }
  GI.ajustarAltura = pedirAltura;
  GI.pronto(function () {
    if (!GI.exigirPermissao('ver_imoveis')) return;
    if (GI.modo !== 'portal') {
      estado('A busca de imóveis precisa do portal conectado. Confira a URL e o token nas Configurações da extensão.');
      return;
    }
    var cfg = GI.cfg('permitirEnvio', false);
    est.permitirEnvio = cfg === true || cfg === 'true';
    ligarFiltros(); ligarEventos(); atualizarFiltrosUi();
    if (global.omni && omni.on) {
      omni.on('omniChatSelected', aoSelecionar);
      omni.on('chatPanelOpened', function () { atualizarChat(); });
    }
    pedirAltura();
    return atualizarChat().then(function () { return carregarOpcoes(); }).then(function () { return buscar(true); });
  });
})(window);
