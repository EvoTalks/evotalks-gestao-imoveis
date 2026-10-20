/* Visualização do imóvel, ES5, sem dependências. */
(function (global) {
  'use strict';
  var GI = global.GI;
  var icones = {"casa": "<path d=\"M3 10.5 12 3l9 7.5\"></path><path d=\"M5 9.5V21h14V9.5\"></path><path d=\"M10 21v-6h4v6\"></path>", "esq": "<path d=\"m15 6-6 6 6 6\"></path>", "dir": "<path d=\"m9 6 6 6-6 6\"></path>", "x": "<path d=\"M6 6l12 12M18 6 6 18\"></path>", "pino": "<path d=\"M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z\"></path><circle cx=\"12\" cy=\"9.5\" r=\"2.5\"></circle>", "copiar": "<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V5a2 2 0 0 1 2-2h8\"></path>", "camera": "<path d=\"M4 8h3l2-3h6l2 3h3v11H4z\"></path><circle cx=\"12\" cy=\"13\" r=\"3.5\"></circle>", "area": "<path d=\"M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5\"></path>", "cama": "<path d=\"M3 18V7M21 18v-5a3 3 0 0 0-3-3H10v8\"></path><path d=\"M3 14h18\"></path><circle cx=\"6.5\" cy=\"10.5\" r=\"1.5\"></circle>", "suite": "<path d=\"M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16\"></path><path d=\"M2 21h20\"></path><circle cx=\"15\" cy=\"12.5\" r=\".8\"></circle>", "banho": "<path d=\"M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z\"></path><path d=\"M6 12V5.5A2.5 2.5 0 0 1 10.5 4\"></path><path d=\"M7 20l-1 1.5M17 20l1 1.5\"></path>", "carro": "<path d=\"M5 16V11l2-5h10l2 5v5\"></path><path d=\"M3 16h18v3H3z\"></path><circle cx=\"7.5\" cy=\"13\" r=\".8\"></circle><circle cx=\"16.5\" cy=\"13\" r=\".8\"></circle>", "lapis": "<path d=\"M4 20h4L19 9l-4-4L4 16z\"></path><path d=\"m13.5 6.5 4 4\"></path>", "fora": "<path d=\"M14 4h6v6\"></path><path d=\"M20 4 11 13\"></path><path d=\"M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5\"></path>", "olho-fechado": "<path d=\"M3 3l18 18\"></path><path d=\"M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.4 3.1M6.5 7.6A12.5 12.5 0 0 0 2.5 12c1 2 4.5 6 9.5 6a9.6 9.6 0 0 0 4.4-1\"></path><path d=\"M9.9 9.9a3 3 0 0 0 4.2 4.2\"></path>", "robo": "<rect x=\"5\" y=\"8\" width=\"14\" height=\"11\" rx=\"3\"></rect><path d=\"M12 4v4M9 13h.01M15 13h.01\"></path>", "baixo": "<path d=\"m6 9 6 6 6-6\"></path>", "relogio": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 7.5V12l3 2\"></path>", "check": "<path d=\"m5 12.5 4.5 4.5L19 7.5\"></path>", "piscina": "<path d=\"M8 15V6a2 2 0 0 1 4 0\"></path><path d=\"M14 15V6a2 2 0 0 1 4 0\"></path><path d=\"M8 9h6M8 12h6\"></path><path d=\"M3 18c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1\"></path>"};
  function esc(v) { return GI.escapar(v == null ? '' : v); }
  function ic(nome) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (icones[nome] || '') + '</svg>'; }
  function attr(nome) { return ' data-evox="vis-' + nome + '"'; }
  function tem(v) { return v !== undefined && v !== null && v !== ''; }
  function url(v) { return /^https?:\/\//i.test(String(v || '')) ? String(v) : ''; }
  function link(v, texto) { return url(v) ? '<a href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">' + esc(texto || v) + '</a>' : '—'; }
  var traducoes = { 'Parking Garage':'Garagem', Kitchen:'Cozinha', BBQ:'Churrasqueira', 'Party Room':'Salão de festas', Elevator:'Elevador', Balcony:'Sacada', Pool:'Piscina', Veranda:'Varanda', Gym:'Academia', Furnished:'Mobiliado', Playground:'Playground', 'Game room':'Salão de jogos', 'Security Guard on Duty':'Portaria', Laundry:'Lavanderia', 'Gourmet Area':'Espaço gourmet', 'Sports Court':'Quadra esportiva', 'Toys Place':'Brinquedoteca', 'Employee Dependency':'Dependência de empregada', 'High Ceiling Height':'Pé-direito alto', 'Pets Allowed':'Aceita pet', "Maid's Quarters":'Quarto de empregada', Pantry:'Despensa', 'Football Field':'Campo de futebol', Coworking:'Coworking', 'Artesian Well':'Poço artesiano', 'Tennis court':'Quadra de tênis' };
  GI.caracteristicaTraduzida = function (v) { return Object.prototype.hasOwnProperty.call(traducoes, v) ? traducoes[v] : v; };
  GI.piscinaDoImovel = function (site) { return !Array.isArray(site.caracteristicas) ? '—' : site.caracteristicas.indexOf('Pool') >= 0 ? 'Sim' : 'Não'; };
  GI.tituloDoImovel = function (titulo, bairro, cidade) {
    titulo = String(titulo || '');
    var letras = titulo.match(/[a-zÀ-ÖØ-öø-ÿ]/gi) || [];
    var altas = letras.filter(function (l) { return l === l.toUpperCase(); }).length;
    if (!letras.length || altas / letras.length < 0.8) return titulo;
    titulo = titulo.toLowerCase();
    titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    [bairro, cidade].forEach(function (local) {
      if (!local) return;
      var padrao = String(local).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      titulo = titulo.replace(new RegExp('(^|[^a-zÀ-ÖØ-öø-ÿ])(' + padrao + ')(?=$|[^a-zÀ-ÖØ-öø-ÿ])', 'gi'), function (_, inicio) { return inicio + local; });
    });
    return titulo;
  };
  GI.fotosDoImovel = function (site) {
    var fotos = [], origem = [site.imagem_principal].concat(Array.isArray(site.imagens) ? site.imagens : []);
    origem.forEach(function (v) { if (url(v) && fotos.indexOf(v) < 0) fotos.push(v); });
    return fotos;
  };
  GI.gradeDoImovel = function (n) { return Math.min(Math.max(Number(n) || 0, 0), 5); };
  GI.navegacaoDoImovel = function (lista, codigo) {
    var i = -1;
    lista.some(function (p, n) { if (p.internalcode === codigo) { i = n; return true; } return false; });
    return { indice:i, total:lista.length, anterior:i > 0 ? lista[i - 1].internalcode : null, proximo:i >= 0 && i < lista.length - 1 ? lista[i + 1].internalcode : null };
  };
  GI.valoresDaVisualizacao = function (site, p) {
    var finalidade = GI.finalidadeDoImovel(p), aluguel = site ? site.valor_aluguel : finalidade === 'locacao' ? p.value : null;
    var venda = site ? site.valor_venda : finalidade === 'venda' ? p.value : null;
    var condominio = site && site.condominio, total = site && site.valor_total_mensal;
    if (tem(aluguel) && !tem(total)) total = Number(aluguel) + Number(condominio || 0);
    return { aluguel:aluguel, venda:venda, condominio:condominio, total:tem(aluguel) ? total : null };
  };
  function campo(rotulo, valor, html, classe, id) {
    return '<div' + (classe ? ' class="' + classe + '"' : '') + (id ? attr(id) : '') + '><dt>' + esc(rotulo) + '</dt><dd' + (!tem(valor) ? ' class="dv-vazio"' : '') + '>' + (tem(valor) ? html ? valor : esc(valor) : '—') + '</dd></div>';
  }
  function preco(rotulo, valor, mensal) {
    return tem(valor) ? '<div class="dv-preco-rotulo">' + rotulo + '</div><div class="dv-preco"><b class="tnum">' + GI.dinheiro(valor) + '</b>' + (mensal ? '<span>/mês</span>' : '') + '</div>' : '';
  }
  function selo(situacao) {
    var i = ['disponivel','reservado','indisponivel'].indexOf(situacao), s = GI.SITUACOES[i];
    return s ? '<span data-situacao-detalhe class="selo selo-' + ['ok','pendente','escuro'][i] + '"><i></i>' + s.rotulo + '</span>' : '';
  }
  function botoesSituacao(atual, bloqueado) {
    return GI.SITUACOES.map(function (s, i) { return '<button type="button" class="op-' + ['ok','pendente','escuro'][i] + '" aria-pressed="' + (s.valor === atual) + '" data-sit="' + s.valor + '"' + attr('sit-' + s.valor) + (bloqueado ? ' disabled' : '') + '><i></i>' + s.rotulo + '</button>'; }).join('');
  }
  function galeria(fotos) {
    if (!fotos.length) return '<div class="dv-sem-foto"' + attr('galeria') + '>' + ic('camera') + 'O anúncio não tem fotos</div>';
    return '<div class="dv-galeria" data-total="' + GI.gradeDoImovel(fotos.length) + '"' + attr('galeria') + '>' + fotos.slice(0,5).map(function (f, i) {
      return '<figure class="dv-foto' + (i === 0 ? ' dv-foto--capa' : '') + '"' + attr(i === 0 ? 'foto-capa' : 'foto-' + (i + 1)) + '><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '">' +
        '<button type="button" class="dv-foto-alvo" data-foto="' + i + '" aria-label="Abrir foto ' + (i + 1) + '"></button>' +
        (i === 0 ? '<span class="dv-foto-selo">' + ic('camera') + 'Capa</span><button class="dv-foto-contador" type="button" data-foto="0"' + attr('foto-contador') + '>' + ic('camera') + 'Ver as ' + fotos.length + ' fotos</button>' : '') +
        (i === 4 && fotos.length > 5 ? '<button type="button" class="dv-foto-mais" data-foto="4"><b>+' + (fotos.length - 5) + '</b>fotos</button>' : '') + '</figure>';
    }).join('') + '</div>';
  }
  function adicionais(campos, lancados) {
    return campos.filter(function (c) { return c.ativo !== false; }).map(function (c) {
      var l = lancados[c.id], valor = '', classe = 'dv-linha';
      if (l && (tem(l.valor) || l.obs)) {
        if (c.tipo === 'simnao' && tem(l.valor)) valor = (String(l.valor) === 'sim' ? '<span class="dv-sim">' + ic('check') + 'Sim</span>' : 'Não') + (l.obs ? ' — ' + esc(l.obs) : '');
        else if (c.tipo === 'valor' && tem(l.valor)) {
          var recorrencia = l.recorrencia || c.recorrenciaPadrao;
          var rec = {anual:'/ano', mensal:'/mês', unico:'única', unica:'única'};
          valor = Number(l.valor) === 0 ? 'isento' : GI.dinheiro(Math.round(Number(l.valor) * 100));
          valor += '<span class="dv-rec">' + esc(rec[recorrencia] || GI.sufixoRecorrencia(recorrencia)) + '</span>' + (l.obs ? ' — ' + esc(l.obs) : '');
        } else valor = esc(GI.valorLegivel(c, l));
      }
      if (c.tipo === 'texto' && (String(valor).length > 40 || String(c.nome).length > 24)) classe += ' dv-linha--texto';
      return campo(c.nome, valor, true, classe);
    }).join('') || '<p class="dv-vazio">Nenhum campo ativo</p>';
  }
  GI.conteudoVisualizacao = function (p, dados, op) {
    var site = dados && dados.imovel, s = site || {}, cat = GI.partesCategoria(p.category), fotos = GI.fotosDoImovel(s);
    var titulo = GI.tituloDoImovel(s.titulo || p.name, s.bairro || cat.bairro, s.cidade || cat.cidade);
    var local = [s.bairro || cat.bairro, s.cidade || cat.cidade].filter(Boolean).join(', '), curto = GI.codigoCurto(p.internalcode);
    var atual = op.situacao, bloqueado = op.bloqueado, valores = GI.valoresDaVisualizacao(site, p);
    var carac = Array.isArray(s.caracteristicas) ? s.caracteristicas.filter(function (c) { return c !== 'Pool'; }) : [];
    var piscina = GI.piscinaDoImovel(s), fatos = [
      ['area',tem(s.area_m2) ? Number(s.area_m2).toLocaleString('pt-BR') + ' m²' : null,'área','area'],
      ['quartos',s.quartos,'quartos','cama'], ['suites',s.suites,Number(s.suites) === 1 ? 'suíte' : 'suítes','suite'],
      ['banheiros',s.banheiros,'banheiros','banho'], ['vagas',s.vagas,'vagas','carro'], ['piscina',piscina,'piscina','piscina']
    ];
    var principal = galeria(fotos) + '<section class="dv-cabeca"' + attr('cabeca') + '><div class="dv-selos"' + attr('cabeca-selos') + '>' + selo(atual) +
      '<span class="selo selo-neutro">' + esc(s.transacao && /loca|aluguel/i.test(s.transacao) ? 'Locação' : s.transacao || (GI.finalidadeDoImovel(p) === 'locacao' ? 'Locação' : GI.finalidadeDoImovel(p) === 'venda' ? 'Venda' : '')) + '</span><span class="selo selo-neutro">' + esc(s.tipo || cat.tipo) + '</span></div>' +
      '<h1 class="dv-titulo"' + attr('titulo') + '>' + esc(titulo) + '</h1><div class="dv-meta"' + attr('meta') + '><span>' + ic('pino') + esc(local) + '</span><span>Código <b class="tnum">' + esc(curto) + '</b><button class="btn btn-mini" type="button" data-copiar-codigo aria-label="Copiar código">' + ic('copiar') + 'copiar</button></span><span class="tnum">completo ' + esc(p.internalcode) + '</span></div></section>';
    if (!site) principal += '<p role="status">Dados do site indisponíveis agora.</p>';
    principal += '<section class="dv-fatos" aria-label="Números do imóvel"' + attr('fatos') + '>' + fatos.map(function (f) {
      return '<div class="dv-fato' + (!tem(f[1]) || f[1] === '—' || f[1] === 'Não' ? ' dv-fato--vazio' : '') + (f[0] === 'piscina' && piscina === 'Sim' ? ' dv-fato--sim' : '') + '"' + attr('fato-' + f[0]) + '><span class="dv-fato-icone">' + ic(f[3]) + '</span><div><b class="tnum">' + esc(tem(f[1]) ? f[1] : '—') + '</b><span>' + f[2] + '</span></div></div>';
    }).join('') + '</section>';
    if (carac.length) principal += '<div class="dv-carac" aria-label="Características do anúncio"' + attr('carac') + '><span>No anúncio</span>' + carac.map(function (c) { return '<span class="dv-chip">' + ic('check') + esc(GI.caracteristicaTraduzida(c)) + '</span>'; }).join('') + '</div>';
    principal += '<section class="dv-sec"' + attr('descricao') + '><h2>Descrição</h2><div class="dv-texto" data-descricao-site' + attr('descricao-texto') + '>' + String(s.descricao || '—').split(/\n/).filter(Boolean).map(function (v) { return '<p>' + esc(v) + '</p>'; }).join('') + '</div><button class="dv-ler" type="button" hidden' + attr('descricao-ler') + '>Ler descrição completa' + ic('baixo') + '</button></section>';
    principal += '<section class="dv-sec"' + attr('ficha') + '><h2>Ficha do anúncio</h2><dl class="dv-ficha">' + campo('Tipo',s.tipo || cat.tipo) + campo('Transação',/loca|aluguel/i.test(s.transacao || '') ? 'Locação' : s.transacao) + campo('Ano de construção',s.ano_construcao) + campo('Bairro',s.bairro || cat.bairro) + campo('Cidade',s.cidade || cat.cidade) + campo('Código completo',p.internalcode) + campo('Link do anúncio',url(s.link) ? link(s.link,s.link.replace(/^https?:\/\/(www\.)?/i,'')) : '',true,'dv-largo') + campo('Primeira vez visto',s.primeiro_visto_em ? GI.dataHora(s.primeiro_visto_em) : '') + '</dl></section>';
    principal += '<details class="dv-acordeao"' + attr('catalogo') + '><summary><b>Catálogo do EvoTalks</b><span>nome, categoria, valor e descrição que a plataforma guarda</span>' + ic('baixo') + '</summary><dl class="dv-ficha">' + campo('Nome',p.name) + campo('Categoria',p.category) + campo('Valor',tem(p.value) ? GI.dinheiro(p.value) : '') + campo('Descrição',p.description) + '</dl></details>';
    var lateral = '<section class="dv-cartao" aria-label="Valores"' + attr('valores') + '>' + preco('Valor de venda',valores.venda,false) + preco('Aluguel',valores.aluguel,true) + '<dl class="dv-linhas">' + (tem(valores.condominio) ? campo('Condomínio',GI.dinheiro(valores.condominio),false,'dv-linha') : '') + (tem(valores.total) ? campo('Total mensal',GI.dinheiro(valores.total),false,'dv-linha dv-linha--total') : '') + '</dl></section>';
    lateral += '<section class="dv-cartao" aria-label="Situação"' + attr('situacao') + '><h3>Situação</h3><div class="dv-situacao-opcoes" role="group" aria-label="Situação do imóvel">' + botoesSituacao(atual,bloqueado) + '</div>' + (op.aviso ? '<p class="dv-nota">' + esc(op.aviso) + '</p>' : '') + '<div class="dv-recado" data-situacao-recado role="status" aria-live="polite"></div><p class="dv-nota">' + ic('robo') + '<span>Muda na hora, sem salvar. Reservado e Indisponível tiram o imóvel da busca da Williane.</span></p></section>';
    lateral += '<section class="dv-cartao dv-internas"' + attr('internas') + '><div class="dv-internas-topo"><h3>Informações adicionais</h3><span class="dv-etiqueta">' + ic('olho-fechado') + 'fora do site</span></div><dl class="dv-linhas">' + adicionais(op.campos || [],op.lancados || {}) + '</dl><p class="dv-nota">' + ic('robo') + '<span>A Williane usa estes campos para responder.</span></p></section>';
    lateral += '<div class="dv-acoes"' + attr('acoes') + '>' + (GI.pode('editar_imoveis') ? '<button type="button" class="btn btn-primario btn-bloco" data-editar-imovel>' + ic('lapis') + 'Editar imóvel</button>' : '') + (url(s.link) ? '<div class="dv-acoes-linha"><a class="btn" href="' + esc(s.link) + '" target="_blank" rel="noopener noreferrer">' + ic('fora') + 'Ver anúncio</a><button class="btn" type="button" data-copiar-link>' + ic('copiar') + 'Copiar link</button></div>' : '') + '<p class="dv-rodape-lado">' + ic('relogio') + 'Anúncio atualizado em ' + esc(s.atualizado_em ? GI.dataHora(s.atualizado_em) : '—') + '</p></div>';
    return { html:'<div class="dv-grade"' + attr('grade') + '><div class="dv-principal"' + attr('principal') + '>' + principal + '</div><aside class="dv-lado"' + attr('lado') + '>' + lateral + '</aside></div>', fotos:fotos, titulo:titulo, local:local };
  };
  GI.visualizarImovel = function (op) {
    var codigo = op.codigo, lista = op.lista(), caixa, modal, fecharModal, aberto = true, versao = 0, conteudo, dadosAtual;
    var lb = null, fotoAtual = 0, focoFoto = null;
    function todos(seletor, fn) { Array.prototype.forEach.call(modal.querySelectorAll(seletor),fn); }
    function recado(texto, erro) {
      var alvo = modal.querySelector('[data-situacao-recado]');
      if (alvo) { alvo.textContent = texto; alvo.className = 'dv-recado' + (erro ? ' dv-recado-erro' : ''); }
    }
    function fecharGaleria() {
      if (!lb) return;
      lb.parentNode.removeChild(lb); lb = null;
      if (focoFoto && document.contains(focoFoto)) focoFoto.focus();
    }
    function foto(n) {
      fotoAtual = (n + conteudo.fotos.length) % conteudo.fotos.length;
      var src = conteudo.fotos[fotoAtual], imagem = lb.querySelector('[data-lb-foto]');
      imagem.src = src; imagem.alt = 'Foto ' + (fotoAtual + 1) + ' de ' + conteudo.fotos.length;
      imagem.style.visibility = '';
      imagem.onerror = function () { imagem.style.visibility = 'hidden'; };
      lb.querySelector('.lb-contador').textContent = (fotoAtual + 1) + ' / ' + conteudo.fotos.length;
      lb.querySelector('[data-lb-original]').href = src;
      Array.prototype.forEach.call(lb.querySelectorAll('[data-mini]'),function (b) { b.setAttribute('aria-current',Number(b.getAttribute('data-mini')) === fotoAtual ? 'true' : 'false'); });
      var atual = lb.querySelector('[aria-current="true"]');
      if (atual) atual.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    function abrirGaleria(n, alvo) {
      focoFoto = alvo; lb = document.createElement('div');
      lb.className = 'lb'; lb.setAttribute('role','dialog'); lb.setAttribute('aria-modal','true'); lb.setAttribute('aria-label','Fotos do imóvel ' + GI.codigoCurto(codigo)); lb.setAttribute('data-evox','vis-lb');
      lb.innerHTML = '<header class="lb-topo"><div class="lb-titulo"><b>' + esc(conteudo.titulo) + '</b><span>Cód. ' + esc(GI.codigoCurto(codigo)) + ' · ' + esc(conteudo.local) + '</span></div><span class="lb-contador tnum"></span><a class="lb-btn" data-lb-original target="_blank" rel="noopener noreferrer">' + ic('fora') + 'Abrir original</a><button class="lb-btn lb-btn--icone" type="button" data-lb-fechar aria-label="Voltar ao imóvel">' + ic('x') + '</button></header><div class="lb-palco"><button class="lb-seta lb-seta--esq" type="button" data-lb-ant aria-label="Foto anterior">' + ic('esq') + '</button><img data-lb-foto><button class="lb-seta lb-seta--dir" type="button" data-lb-prox aria-label="Próxima foto">' + ic('dir') + '</button></div><nav class="lb-tira" aria-label="Todas as fotos">' + conteudo.fotos.map(function (f,i) { return '<button class="lb-mini" type="button" data-mini="' + i + '"><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '"></button>'; }).join('') + '</nav>';
      modal.appendChild(lb); foto(n);
      lb.querySelector('[data-lb-fechar]').onclick = fecharGaleria;
      lb.querySelector('[data-lb-ant]').onclick = function () { foto(fotoAtual - 1); };
      lb.querySelector('[data-lb-prox]').onclick = function () { foto(fotoAtual + 1); };
      Array.prototype.forEach.call(lb.querySelectorAll('[data-mini]'),function (b) { b.onclick = function () { foto(Number(b.getAttribute('data-mini'))); }; });
      lb.querySelector('[data-lb-fechar]').focus();
    }
    function copiar(valor, mensagem) {
      function alternativa() {
        var anterior = modal.querySelector('.dv-copiar-fallback');
        if (anterior) anterior.parentNode.removeChild(anterior);
        var input = document.createElement('input');
        input.className = 'dv-copiar-fallback'; input.value = valor; input.readOnly = true;
        input.setAttribute('aria-label','Selecione e copie');
        modal.querySelector('.dv-acoes').appendChild(input); input.focus(); input.select();
        var copiado = false;
        try { copiado = document.execCommand('copy'); } catch (e) { /* seleção permanece disponível */ }
        if (copiado) { input.parentNode.removeChild(input); recado(mensagem); }
        else recado('Selecione e copie o texto.');
      }
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) global.navigator.clipboard.writeText(valor).then(function () { if (aberto) recado(mensagem); },function () { if (aberto) alternativa(); });
      else alternativa();
    }
    function atualizarSituacao(proxima) {
      if (!op.estado.situacoes || GI.modo !== 'portal' || !GI.pode('ver_imoveis') || op.estado.gravando[codigo] || proxima === op.situacao(codigo)) return;
      var id = codigo;
      op.estado.gravando[id] = proxima;
      todos('[data-sit]',function (b) { b.disabled = true; }); recado('Salvando…');
      op.atualizar();
      GI.salvarSituacao(id,proxima).then(function () {
        Object.defineProperty(op.estado.situacoes,id,{value:proxima,enumerable:true,configurable:true,writable:true});
      }).then(function () { concluir(); }, function (err) { concluir(GI.mensagemErro(err)); });
      function concluir(erro) {
        delete op.estado.gravando[id]; op.atualizar();
        if (op.estado.notificarVisualizacao) op.estado.notificarVisualizacao(id,erro);
      }
    }
    function reconciliarSituacao(id, erro) {
      if (!aberto || codigo !== id) return;
      var atual = op.situacao(id), anterior = modal.querySelector('[data-situacao-detalhe]');
      if (anterior) anterior.outerHTML = selo(atual);
      todos('[data-sit]',function (b) {
        b.disabled = false;
        b.setAttribute('aria-pressed',b.getAttribute('data-sit') === atual ? 'true' : 'false');
      });
      recado(erro || 'Situação salva',!!erro);
    }

    function renderizar(p,dados) {
      dadosAtual = dados;
      conteudo = GI.conteudoVisualizacao(p,dados,{
        situacao:op.estado.situacoes ? op.situacao(codigo) : dados && dados.imovel.situacao,
        bloqueado:GI.modo !== 'portal' || !op.estado.situacoes || !GI.pode('ver_imoveis') || !!op.estado.gravando[codigo],
        aviso:GI.modo !== 'portal' ? 'Situação exige o portal conectado.' : !op.estado.situacoes ? (document.getElementById('gi-situacao-aviso').textContent || 'Situação indisponível. Reabra a tela para tentar novamente.') : '',
        campos:op.estado.campos, lancados:op.estado.valores[codigo] || (dados && dados.valores) || {}
      });
      caixa.innerHTML = conteudo.html;
      todos('[data-foto]',function (b) { b.onclick = function () { abrirGaleria(Number(b.getAttribute('data-foto')),b); }; });
      todos('.dv-foto img',function (img) { img.addEventListener('error',function () { img.parentNode.classList.add('dv-foto-quebrada'); }); });
      todos('[data-sit]',function (b) { b.onclick = function () { atualizarSituacao(b.getAttribute('data-sit')); }; });
      todos('[data-editar-imovel]',function (b) { b.onclick = function () { var id = codigo; fecharModal(); op.editar(id); }; });
      todos('[data-copiar-codigo]',function (b) { b.onclick = function () { copiar(GI.codigoCurto(codigo),'Código copiado'); }; });
      todos('[data-copiar-link]',function (b) { b.onclick = function () { copiar(dadosAtual.imovel.link,'Link copiado'); }; });
      var descricao = caixa.querySelector('.dv-texto'), ler = caixa.querySelector('.dv-ler');
      if (descricao.scrollHeight > descricao.clientHeight + 1) {
        ler.hidden = false;
        ler.onclick = function () { var expandido = descricao.classList.toggle('dv-texto--aberto'); ler.innerHTML = expandido ? 'Mostrar menos' : 'Ler descrição completa' + ic('baixo'); ler.setAttribute('aria-expanded',String(expandido)); GI.ajustarAltura(); };
        ler.setAttribute('aria-expanded','false');
      } else descricao.classList.add('dv-texto--curto');
      GI.ajustarAltura();
    }
    function carregar(id) {
      codigo = id;
      var p = lista.filter(function (item) { return item.internalcode === codigo; })[0];
      if (!p) { fecharModal(); return; }
      var minhaVersao = ++versao, nav = GI.navegacaoDoImovel(lista,codigo), topo = modal.querySelector('.gi-modal-topo');
      topo.classList.add('dv-topo'); topo.setAttribute('data-evox','vis-topo');
      topo.innerHTML = '<div class="dv-caminho" data-evox="vis-topo-caminho">' + ic('casa') + '<span>Imóveis</span>' + ic('dir') + '<b>Cód. ' + esc(GI.codigoCurto(codigo)) + '</b></div><nav class="dv-nav" aria-label="Navegar pelos imóveis" data-evox="vis-topo-nav"><button class="btn btn-icone" type="button" data-ant data-evox="vis-topo-ant" aria-label="Imóvel anterior"' + (!nav.anterior ? ' disabled' : '') + '>' + ic('esq') + '</button><span class="tnum" data-evox="vis-topo-posicao">' + (nav.indice + 1) + ' de ' + nav.total + '</span><button class="btn btn-icone" type="button" data-prox data-evox="vis-topo-prox" aria-label="Próximo imóvel"' + (!nav.proximo ? ' disabled' : '') + '>' + ic('dir') + '</button><span class="dv-sep"></span><button class="btn btn-icone gi-modal-x" type="button" data-evox="vis-topo-fechar" aria-label="Fechar">' + ic('x') + '</button></nav>';
      topo.querySelector('.gi-modal-x').onclick = function () { fecharModal(); };
      topo.querySelector('[data-ant]').onclick = function () { carregar(nav.anterior); };
      topo.querySelector('[data-prox]').onclick = function () { carregar(nav.proximo); };
      caixa.innerHTML = '<div class="dv-grade" aria-busy="true" role="status" aria-label="Carregando detalhes"><div class="dv-principal"><div class="dv-esqueleto"></div><div class="dv-esqueleto" style="height:80px"></div></div><aside class="dv-lado"><div class="dv-esqueleto" style="height:160px"></div></aside></div>';
      caixa.scrollTop = 0;
      topo.querySelector('.gi-modal-x').focus({preventScroll:true});
      op.carregar(codigo).then(function (dados) { if (aberto && minhaVersao === versao) renderizar(p,dados); });
    }
    return GI.modal({
      titulo:'Visualização do imóvel', somenteLeitura:true, visualizacao:true,
      aoControlar:function (fechar) { fecharModal = fechar; },
      aoAbrir:function (corpo) { caixa = corpo; modal = corpo.parentNode; op.estado.notificarVisualizacao = reconciliarSituacao; modal.setAttribute('data-evox','vis-modal'); carregar(codigo); },
      aoFechar:function () { aberto = false; if (op.estado.notificarVisualizacao === reconciliarSituacao) delete op.estado.notificarVisualizacao; },
      aoTecla:function (e) {
        if (!lb) return;
        if (e.key === 'Escape') { e.preventDefault(); fecharGaleria(); return false; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); foto(fotoAtual + (e.key === 'ArrowLeft' ? -1 : 1)); return false; }
      }
    });
  };
})(window);
