/* Interações da tabela. O modelo em colunas.js permanece independente do DOM. */
(function (global) {
  'use strict';
  var C = global.GIColunas, GI = global.GI;
  GI.iniciarColunas = function (op) {
    var estado = op.estado;
    try { if (op.layout) C.validar(op.layout, GI.modo === 'local'); } catch (e) { op.layout = null; }
    var layout = C.mesclar(op.layout,estado.campos), filtros = {}, ordem = null;
    var tabela = document.querySelector('#gi-lista table'), timer, popover, colunaAberta, catalogoAplicado;
    var gravacoes = {}, revisoes = {}, valoresEm = 0, cargaValores = null, camposEmCache = '', mapaColunas = {}, chaveSessao = 'gi.filtros.' + GI.idUsuarioColunas();
    try { var salvo = JSON.parse(sessionStorage.getItem(chaveSessao)); if (salvo && salvo.filtros && typeof salvo.filtros === 'object' && Object.keys(salvo.filtros).every(function (id) { return Array.isArray(salvo.filtros[id]); })) { filtros = salvo.filtros; ordem = salvo.ordem; } } catch (e) { /* storage indisponível */ }
    function porId(id) { return layout.filter(function (c) { return c.id === id; })[0]; }
    Object.keys(filtros).forEach(function (id) { if (!porId(id) || id === 'capa' || id === 'funcoes') delete filtros[id]; });
    if (ordem && (!porId(ordem.id) || ordem.id === 'capa' || ordem.id === 'funcoes')) ordem = null;
    function visiveis() { return layout.filter(function (c) { return c.visivel; }); }
    function memorizar() { try { sessionStorage.setItem(chaveSessao,JSON.stringify({filtros:filtros,ordem:ordem})); } catch (e) { /* storage indisponível */ } }
    function gravar(restaurar) {
      clearTimeout(timer);
      return Promise.resolve().then(function () { return GI.salvarLayoutColunas(restaurar ? null : layout.map(C.copiar)); }).catch(function (e) {
        GI.aviso('Layout não foi salvo: ' + GI.mensagemErro(e),'error'); throw e;
      });
    }
    function mudou() { op.redesenhar(); clearTimeout(timer); timer = setTimeout(function () { gravar().catch(function () {}); },600); }
    function atualizar() { memorizar(); estado.pagina = 1; return op.carregar().catch(GI.erroFatal); }
    function mover(id, alvo) {
      if (id === 'funcoes' || id === alvo) return;
      var c = porId(id); layout = layout.filter(function (x) { return x !== c; });
      var indice = layout.indexOf(porId(alvo)); layout.splice(indice < 0 ? layout.length - 1 : indice,0,c);
    }
    function lancamento(codigo,id) {
      return Object.prototype.hasOwnProperty.call(estado.valores,codigo) ? estado.valores[codigo][id] : (mapaColunas[codigo] || {})[id];
    }
    function valor(p,id) {
      var cat = GI.partesCategoria(p.category), c = porId(id);
      if (id.indexOf('campo:') === 0) { var v = lancamento(p.internalcode,id.slice(6)); return !v || v.valor === '' || v.valor == null ? '' : c.campo.tipo === 'numero' || c.campo.tipo === 'valor' ? Number(v.valor) : C.textoCampo(c.campo,v,GI); }
      if (id === 'codigo') return GI.codigoCurto(p.internalcode);
      if (id === 'imovel') return p.name;
      if (id === 'bairro') return cat.bairro || cat.cidade;
      if (id === 'valor') return Number(p.value);
      if (id === 'preenchido') return op.quantos(p.internalcode);
      if (id === 'status') return op.quantos(p.internalcode) ? 'Verificado' : 'Pendente';
      if (id === 'situacao') { var s = op.situacao(p.internalcode); return (GI.SITUACOES.filter(function (x) { return x.valor === s; })[0] || {}).rotulo || ''; }
      return '';
    }
    function carregarValores(extra) {
      var necessarios = {};
      visiveis().forEach(function (c) { necessarios[c.id] = true; });
      Object.keys(filtros).forEach(function (id) { necessarios[id] = true; });
      if (ordem) necessarios[ordem.id] = true;
      if (extra) necessarios[extra] = true;
      var campos = estado.campos.filter(function (c) { return c.ativo !== false && necessarios['campo:' + c.id]; });
      if (!campos.length) return Promise.resolve();
      var assinatura = campos.map(function (c) { return c.id; }).join(',');
      if (Date.now() - valoresEm < 180000 && camposEmCache === assinatura) return Promise.resolve();
      if (cargaValores) return cargaValores.then(function () { return carregarValores(extra); });
      // O lote renovado vence leituras individuais; gravações em curso ou posteriores à consulta vencem o lote.
      var versoes = {};
      Object.keys(revisoes).forEach(function (codigo) { versoes[codigo] = revisoes[codigo]; });
      cargaValores = GI.valoresColunas(campos).then(function (v) {
        Object.keys(estado.valores).forEach(function (codigo) {
          if (gravacoes[codigo] || (revisoes[codigo] || 0) !== (versoes[codigo] || 0)) return;
          campos.forEach(function (c) {
            if (v[codigo] && Object.prototype.hasOwnProperty.call(v[codigo],c.id)) estado.valores[codigo][c.id] = v[codigo][c.id];
            else delete estado.valores[codigo][c.id];
          });
        });
        Object.keys(revisoes).forEach(function (codigo) {
          if (gravacoes[codigo] || (revisoes[codigo] || 0) !== (versoes[codigo] || 0)) v[codigo] = mapaColunas[codigo] || estado.valores[codigo] || {};
        });
        mapaColunas = v; valoresEm = Date.now(); camposEmCache = assinatura; cargaValores = null; },function (e) { cargaValores = null; throw e; });
      return cargaValores;
    }
    function catalogo(extra) {
      return Promise.all([GI.catalogoCompleto({ termo:estado.termo, finalidade:estado.finalidade }),carregarValores(extra)]).then(function (r) { return r[0]; });
    }
    function completo() { return !!(Object.keys(filtros).length || ordem || estado.filtroEstado || estado.filtroSituacao); }
    function buscar() {
      var base = catalogoAplicado; catalogoAplicado = null;
      if (!completo()) {
        var precisa = visiveis().some(function (c) { return !!c.campo; });
        return Promise.all([GI.buscarImoveis({termo:estado.termo,finalidade:estado.finalidade,pagina:estado.pagina,porPagina:estado.porPagina}), precisa ? carregarValores() : Promise.resolve()]).then(function (r) { return r[0]; });
      }
      var inicio = Date.now();
      return (base ? Promise.resolve(base) : catalogo()).then(function (todos) {
        var linhas = todos.filter(function (p) {
          return (!estado.filtroSituacao || op.situacao(p.internalcode) === estado.filtroSituacao) &&
            (!estado.filtroEstado || (op.quantos(p.internalcode) > 0) === (estado.filtroEstado === 'preenchido'));
        });
        linhas = C.filtrar(linhas,filtros,valor);
        var c = ordem && porId(ordem.id);
        linhas = C.ordenar(linhas,ordem,valor,c && c.campo ? c.campo.tipo : ordem && ordem.id === 'valor' ? 'valor' : 'texto');
        
        estado.pagina = Math.max(1,Math.min(estado.pagina,Math.ceil(linhas.length / estado.porPagina)));
        var inicioPagina = (estado.pagina - 1) * estado.porPagina;
        return { itens:linhas.slice(inicioPagina,inicioPagina + estado.porPagina),total:linhas.length,ms:Date.now()-inicio,completo:true };
      });
    }
    var pedidoFunil = 0;
    function fechar(teclado) { pedidoFunil++; if (!popover) return; popover.remove(); popover = null; var origem = tabela.querySelector('[data-funil="' + colunaAberta + '"]'); colunaAberta = null; if (teclado === true && origem) origem.focus({preventScroll:true}); }
    document.addEventListener('keydown',function (e) { if (e.key === 'Escape') fechar(true); });
    document.addEventListener('pointerdown',function (e) { if (popover && !popover.contains(e.target) && !e.target.closest('[data-funil]')) fechar(); });
    function funil(id,botao) {
      if (popover && colunaAberta === id) { fechar(true); return; }
      fechar(); var pedido = ++pedidoFunil; botao.disabled = true;
      catalogo(id).then(function (todos) {
        if (pedido !== pedidoFunil) return;
        var atual = tabela.querySelector('[data-funil="' + id + '"]'); if (!atual) return;
        botao = atual;
        Array.prototype.forEach.call(document.querySelectorAll('.gi-col-popover'),function (o) { o.remove(); });
        var c = porId(id), selecionados = filtros[id] ? filtros[id].slice() : null;
        colunaAberta = id;
        popover = document.createElement('div'); popover.className = 'gi-col-popover'; popover.setAttribute('role','dialog'); popover.setAttribute('aria-label','Filtro de ' + c.titulo);
        var numerico = id === 'valor' || id === 'codigo' || id === 'preenchido' || c.campo && (c.campo.tipo === 'numero' || c.campo.tipo === 'valor');
        popover.innerHTML = '<strong>' + GI.escapar(c.titulo) + '</strong><button type="button" data-ordem="asc">' + (numerico ? 'Menor → maior' : 'Classificar A→Z') + '</button><button type="button" data-ordem="desc">' + (numerico ? 'Maior → menor' : 'Classificar Z→A') + '</button>' +
          '<input aria-label="Buscar valores" type="search" placeholder="Buscar valores"><label><input type="checkbox" data-todos checked> <span data-rotulo-todos>(Selecionar tudo)</span></label><div class="gi-col-valores"></div><small data-limite></small>';
        document.body.appendChild(popover);
        var painel = popover, rect = botao.getBoundingClientRect();
        painel.style.left = Math.max(8,Math.min(rect.left,innerWidth - 300)) + 'px'; painel.style.top = Math.max(8,Math.min(rect.bottom,innerHeight - painel.offsetHeight - 8)) + 'px';
        var distintosTodos = Object.create(null);
        todos.forEach(function (p) { distintosTodos[C.chave(valor(p,id))] = true; });
        var todosDistintos = Object.keys(distintosTodos);
        if (!selecionados) selecionados = todosDistintos.slice();
        function aplicar() {
          if (selecionados.length > 0 && todosDistintos.every(function (v) { return selecionados.indexOf(v) >= 0; })) delete filtros[id];
          else filtros[id] = selecionados.slice();
          catalogoAplicado = todos;
          atualizar();
        }
        function marcarOrdem() {
          Array.prototype.forEach.call(painel.querySelectorAll('[data-ordem]'),function (b) { b.setAttribute('aria-pressed',String(!!(ordem && ordem.id === id && ordem.desc === (b.getAttribute('data-ordem') === 'desc')))); });
        }
        function lista() {
          var busca = painel.querySelector('input[type=search]').value;
          painel.querySelector('[data-rotulo-todos]').textContent = busca ? '(Selecionar todos os resultados)' : '(Selecionar tudo)';
          var r = C.distintos(todos,id,valor,busca);
          painel.querySelector('.gi-col-valores').innerHTML = r.itens.map(function (x) { return '<label><input type="checkbox" data-valor="' + GI.escapar(x.valor) + '"' + (selecionados.indexOf(x.valor) >= 0 ? ' checked' : '') + '> ' + GI.escapar(id === 'valor' && x.valor !== '' ? GI.dinheiro(Number(x.valor)) : c.campo && c.campo.tipo === 'valor' && x.valor !== '' ? GI.dinheiro(Math.round(Number(x.valor) * 100)) : x.texto) + ' (' + x.contagem + ')</label>'; }).join('');
          painel.querySelector('[data-limite]').textContent = r.total > 1000 ? 'Lista limitada a 1.000 valores. Use a busca.' : '';
          function conferirTodos() {
            var quantidade = r.itens.filter(function (x) { return selecionados.indexOf(x.valor) >= 0; }).length;
            painel.querySelector('[data-todos]').checked = quantidade === r.itens.length;
            painel.querySelector('[data-todos]').indeterminate = quantidade > 0 && quantidade < r.itens.length;
          }
          conferirTodos();
          Array.prototype.forEach.call(painel.querySelectorAll('[data-valor]'),function (b) { b.onchange = function () { var v = b.getAttribute('data-valor'); selecionados = selecionados.filter(function (x) { return x !== v; }); if (b.checked) selecionados.push(v); conferirTodos(); aplicar(); }; });
        }
        painel.querySelector('input[type=search]').oninput = lista;
        painel.querySelector('[data-todos]').onchange = function (e) {
          var busca = painel.querySelector('input[type=search]').value;
          var resultados = todosDistintos.filter(function (v) { return (v || '(Vazias)').toLowerCase().indexOf(busca.toLowerCase()) >= 0; });
          if (e.target.checked) selecionados = busca ? resultados : todosDistintos.slice();
          else selecionados = selecionados.filter(function (v) { return resultados.indexOf(v) < 0; });
          lista(); aplicar();
        };
        Array.prototype.forEach.call(painel.querySelectorAll('[data-ordem]'),function (b) { b.onclick = function () {
          var desc = b.getAttribute('data-ordem') === 'desc';
          ordem = ordem && ordem.id === id && ordem.desc === desc ? null : {id:id,desc:desc};
          marcarOrdem(); aplicar();
        }; });
        marcarOrdem();
        painel.onkeydown = function (e) {
          if (e.key !== 'Tab') return;
          var focus = painel.querySelectorAll('button,input'), first = focus[0], last = focus[focus.length-1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        lista(); painel.querySelector('input[type=search]').focus();
      }).catch(GI.erroFatal).then(function () { botao.disabled = false; });
    }
    function arrastar(th,c) {
      th.onpointerdown = function (e) {
        if (e.button !== 0 || e.target.closest('button')) return;
        var resize = e.target.hasAttribute('data-redimensionar');
        if (!resize && c.id === 'funcoes') return;
        e.preventDefault(); th.setPointerCapture(e.pointerId);
        var inicio = e.clientX, largura = th.getBoundingClientRect().width, alvo = null, ativo = false;
        th.onpointermove = function (ev) {
          if (Math.abs(ev.clientX-inicio) < 4 && !ativo) return;
          ativo = true; if (resize) th.classList.add('gi-col-redimensionando');
          if (resize) { c.largura = Math.max(40,Math.min(1200,Math.round(largura + ev.clientX - inicio))); th.style.width = c.largura + 'px'; tabela.querySelector('col[data-coluna="' + c.id + '"]').style.width = c.largura + 'px'; }
          else { Array.prototype.forEach.call(tabela.querySelectorAll('th'),function (h) { h.classList.remove('gi-col-destino'); }); var h = document.elementFromPoint(ev.clientX,ev.clientY); h = h && h.closest('th'); if (h && h !== th && h.hasAttribute('data-coluna')) { alvo = h.getAttribute('data-coluna'); h.classList.add('gi-col-destino'); } }
        };
        function fim() { th.classList.remove('gi-col-redimensionando'); th.onpointermove = null; th.onpointerup = null; th.onpointercancel = null; if (ativo) { if (!resize && alvo) mover(c.id,alvo); mudou(); } }
        th.onpointerup = fim; th.onpointercancel = fim;
      };
      if (c.id === 'funcoes') return;
      th.querySelector('[data-redimensionar]').ondblclick = function () { c.largura = null; mudou(); };
    }
    function desenhar() {
      var cols = visiveis(), grupo = tabela.querySelector('colgroup');
      var padrao = C.padrao([]), largurasPadrao = {};
      padrao.forEach(function (c) { largurasPadrao[c.id] = c.largura; });
      var personalizado = cols.some(function (c) { return !!c.campo || c.largura !== largurasPadrao[c.id]; });
      // No layout fixo, uma coluna sem largura absorve a sobra; assim Funções nunca passa de LARGURA_FUNCOES.
      var absorve = personalizado ? (cols.filter(function (c) { return c.id === 'imovel'; })[0] || cols.filter(function (c) { return c.id !== 'funcoes'; }).slice(-1)[0] || {}).id : null;
      function larg(c) { return c.id === absorve ? null : c.largura; }
      tabela.style.tableLayout = personalizado ? 'fixed' : '';
      tabela.style.minWidth = personalizado ? cols.reduce(function (s,c) { return s + (c.largura || 220); },0) + 'px' : '';
      tabela.style.overflowWrap = personalizado ? 'anywhere' : '';
      if (!grupo) { grupo = document.createElement('colgroup'); tabela.insertBefore(grupo,tabela.firstChild); }
      grupo.innerHTML = cols.map(function (c) { return '<col data-coluna="' + GI.escapar(c.id) + '"' + (larg(c) ? ' style="width:' + larg(c) + 'px"' : '') + '>'; }).join('');
      tabela.querySelector('thead tr').innerHTML = cols.map(function (c) { return '<th title="' + GI.escapar(c.titulo) + '" data-coluna="' + GI.escapar(c.id) + '" class="gi-alinha-' + c.alinhamento + '"' + (larg(c) ? ' style="width:' + larg(c) + 'px"' : '') + '><span class="gi-col-cabecalho' + (c.vertical ? ' gi-col-cabecalho-vertical' : '') + '"><span class="gi-col-titulo' + (c.vertical ? ' gi-col-vertical' : '') + '">' + GI.escapar(c.titulo) + '</span>' + (c.id === 'capa' || c.id === 'funcoes' ? '' : '<button type="button" class="gi-col-funil' + (filtros[c.id] || ordem && ordem.id === c.id ? ' gi-col-ativo' : '') + '" data-funil="' + GI.escapar(c.id) + '" aria-label="Filtrar ' + GI.escapar(c.titulo) + '">▾</button>') + '</span>' + (c.id === 'funcoes' ? '' : '<span data-redimensionar role="separator" aria-label="Largura de ' + GI.escapar(c.titulo) + '"></span>') + '</th>'; }).join('');
      Array.prototype.forEach.call(tabela.querySelectorAll('th'),function (th) { var c = porId(th.getAttribute('data-coluna')); arrastar(th,c); var b = th.querySelector('[data-funil]'); if (b) b.onclick = function () { funil(c.id,b); }; });
      Array.prototype.forEach.call(tabela.querySelectorAll('tbody tr'),function (tr,i) {
        var cells = Array.prototype.slice.call(tr.children), fixas = ['capa','codigo','imovel','bairro','valor','preenchido','status','situacao','funcoes'];
        if (cells.length !== 9) { if (cells[0]) cells[0].colSpan = cols.length; return; }
        var p = estado.itens[i];
        while (tr.firstChild) tr.removeChild(tr.firstChild);
        cols.forEach(function (c) {
          var td, indice = fixas.indexOf(c.id);
          if (indice >= 0) td = cells[indice];
          else { td = document.createElement('td'); var v = lancamento(p.internalcode,c.id.slice(6)); td.innerHTML = GI.escapar(C.textoCampo(c.campo,v,GI)); if (v && v.obs) td.title = v.obs; }
          td.setAttribute('data-coluna',c.id);
          td.classList.remove('gi-direita');
          td.classList.add('gi-alinha-' + c.alinhamento); tr.appendChild(td);
        });
      });
    }
    function editor() {
      var rascunho = layout.map(function (c) { var n = C.copiar(c); n.titulo = c.titulo; return n; });
      GI.modal({titulo:'Colunas',largura:900,corpo:'<div id="gi-editor-colunas"></div><button type="button" id="gi-col-padrao" class="btn">Restaurar padrão</button>',rotuloOk:'Salvar',aoAbrir:function () {
        var caixa = document.getElementById('gi-editor-colunas');
        function montar() {
          caixa.innerHTML = rascunho.map(function (c,i) { return '<div class="gi-col-editor-linha" data-indice="' + i + '">' + (c.id !== 'funcoes' ? '<span data-arrastar aria-label="Arrastar ' + GI.escapar(c.titulo) + '">⋮⋮</span>' : '<span class="gi-col-sem-alca"></span>') + '<label><input type="checkbox" data-visivel' + (c.visivel ? ' checked' : '') + (c.id === 'funcoes' ? ' disabled' : '') + '> ' + GI.escapar(c.titulo) + '</label><button type="button" data-subir aria-label="Subir ' + GI.escapar(c.titulo) + '"' + (i === 0 || c.id === 'funcoes' ? ' disabled' : '') + '>↑</button><button type="button" data-descer aria-label="Descer ' + GI.escapar(c.titulo) + '"' + (i >= rascunho.length-2 ? ' disabled' : '') + '>↓</button><input type="number" data-largura min="40" max="1200" aria-label="Largura de ' + GI.escapar(c.titulo) + '" placeholder="auto" value="' + (c.largura || '') + '"' + (c.id === 'funcoes' ? ' disabled' : '') + '><div>' + ['esquerda','centro','direita'].map(function (a) { return '<button type="button" data-alinhamento="' + a + '" aria-pressed="' + (c.alinhamento === a) + '">' + a + '</button>'; }).join('') + '</div><label><input type="checkbox" data-vertical' + (c.vertical ? ' checked' : '') + '> Texto vertical</label></div>'; }).join('');
          Array.prototype.forEach.call(caixa.children,function (linha,i) {
            var c = rascunho[i];
            linha.querySelector('[data-visivel]').onchange = function (e) { c.visivel = e.target.checked; };
            linha.querySelector('[data-largura]').oninput = function (e) { c.largura = e.target.value === '' ? null : Number(e.target.value); };
            linha.querySelector('[data-vertical]').onchange = function (e) { c.vertical = e.target.checked; };
            Array.prototype.forEach.call(linha.querySelectorAll('[data-alinhamento]'),function (b) { b.onclick = function () { c.alinhamento = b.getAttribute('data-alinhamento'); montar(); }; });
            function trocar(destino) { if (c.id === 'funcoes' || destino < 0 || destino >= rascunho.length-1) return; rascunho.splice(i,1); rascunho.splice(destino,0,c); montar(); }
            linha.querySelector('[data-subir]').onclick = function () { trocar(i-1); };
            linha.querySelector('[data-descer]').onclick = function () { trocar(i+1); };
            var alca = linha.querySelector('[data-arrastar]');
            if (alca) alca.onpointerdown = function (e) {
              if (e.button !== 0) return;
              e.preventDefault();
              var destino = null;
              function limpar() { Array.prototype.forEach.call(caixa.children,function (l) { l.classList.remove('gi-col-editor-destino'); }); }
              function movimento(ev) {
                limpar();
                var alvo = document.elementFromPoint(ev.clientX,ev.clientY);
                alvo = alvo && alvo.closest('.gi-col-editor-linha');
                destino = alvo ? Number(alvo.getAttribute('data-indice')) : null;
                if (alvo && destino !== i) alvo.classList.add('gi-col-editor-destino');
              };
              function soltar() {
                cancelar();
                if (destino != null) trocar(Math.min(destino,rascunho.length-2));
              };
              function cancelar() {
                limpar(); document.removeEventListener('pointermove',movimento); document.removeEventListener('pointerup',soltar); document.removeEventListener('pointercancel',cancelar);
              }
              document.addEventListener('pointermove',movimento); document.addEventListener('pointerup',soltar); document.addEventListener('pointercancel',cancelar);
            };
          });
        }
        document.getElementById('gi-col-padrao').onclick = function () { gravar(true).then(function () { layout = C.mesclar(null,estado.campos); rascunho = layout.map(function (c) { var n=C.copiar(c); n.titulo=c.titulo; return n; }); montar(); op.carregar().catch(GI.erroFatal); }).catch(function () {}); };
        montar();
      },aoConfirmar:function () {
        C.validar(rascunho, GI.modo === 'local'); var anterior = layout; layout = C.mesclar(rascunho,estado.campos);
        return gravar().then(function () { return op.carregar(); }).then(function () { return true; },function (e) { layout = anterior; throw e; });
      }}).catch(GI.erroFatal);
    }
    document.getElementById('b-colunas').onclick = editor;
    return { buscar:buscar, desenhar:desenhar, limpar:function () { filtros = {}; ordem = null; memorizar(); }, iniciarGravacao:function (codigo) { gravacoes[codigo] = true; revisoes[codigo] = (revisoes[codigo] || 0) + 1; }, finalizarGravacao:function (codigo) { delete gravacoes[codigo]; revisoes[codigo] = (revisoes[codigo] || 0) + 1; }, atualizarValores:function (codigo,valores) { mapaColunas[codigo] = valores; revisoes[codigo] = (revisoes[codigo] || 0) + 1; }, invalidar:function () { valoresEm = 0; }, completo:completo };
  };
})(window);
