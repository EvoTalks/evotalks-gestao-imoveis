/* Modelo puro: layout por usuário; filtros temporários nunca fazem parte do layout. */
(function (global) {
  'use strict';
  var ids = ['capa','codigo','imovel','bairro','valor','preenchido','status','situacao','funcoes'];
  var titulos = ['Capa','Código','Imóvel','Bairro','Valor','Preenchido','Status','Situação','Funções'];
  var LARGURA_FUNCOES = 104;
  var larguras = [88,92,null,140,115,121,115,190,LARGURA_FUNCOES];
  function copiar(c) { return { id:c.id, visivel:c.visivel, largura:c.id === 'funcoes' ? LARGURA_FUNCOES : c.largura, alinhamento:c.alinhamento, vertical:c.vertical }; }
  function padrao(campos) {
    var fixas = ids.map(function (id,i) { return { id:id, titulo:titulos[i], visivel:true, largura:larguras[i], alinhamento:id === 'valor' || id === 'funcoes' ? 'direita' : 'esquerda', vertical:false }; });
    return fixas.slice(0,8).concat((campos || []).filter(function (c) { return c.ativo !== false; }).map(function (c) {
      return { id:'campo:' + c.id, titulo:c.nome, campo:c, visivel:false, largura:Math.max(140,Math.min(260,String(c.nome || '').length * 8 + 40)), alinhamento:'esquerda', vertical:false };
    }),[fixas[8]]);
  }
  function validar(layout, local) {
    if (!Array.isArray(layout) || !layout.length || layout.length > 60) throw new Error('Informe de 1 a 60 colunas.');
    var vistos = Object.create(null);
    return layout.map(function (c) {
      if (!c || (!/^(capa|codigo|imovel|bairro|valor|preenchido|status|situacao|funcoes|campo:[1-9][0-9]{0,8})$/.test(c.id) && !(local && /^campo:[a-z][a-z0-9-]{0,79}$/.test(c.id))) || vistos[c.id] || typeof c.visivel !== 'boolean' || typeof c.vertical !== 'boolean' ||
        (c.largura !== null && (typeof c.largura !== 'number' || c.largura % 1 || c.largura < 40 || c.largura > 1200)) || ['esquerda','centro','direita'].indexOf(c.alinhamento) < 0) throw new Error('Coluna inválida: confira identificador, largura (40–1200 px) e alinhamento.');
      vistos[c.id] = true; return copiar(c);
    });
  }
  function mesclar(layout, campos) {
    var base = padrao(campos), mapa = Object.create(null), resultado = [];
    base.forEach(function (c) { mapa[c.id] = c; });
    (layout || []).forEach(function (c) {
      var original = mapa[c.id]; if (!original) return;
      var novo = copiar(c); novo.titulo = original.titulo; novo.campo = original.campo;
      resultado.push(novo); delete mapa[c.id];
    });
    base.forEach(function (c, i) {
      if (!mapa[c.id]) return;
      if (ids.indexOf(c.id) >= 0) resultado.splice(Math.min(i,resultado.length),0,c);
      else resultado.push(c);
    });
    var funcoes = resultado.filter(function (c) { return c.id === 'funcoes'; })[0];
    funcoes.visivel = true; funcoes.largura = LARGURA_FUNCOES;
    return resultado.filter(function (c) { return c.id !== 'funcoes'; }).concat([funcoes]);
  }
  function chave(v) { return v === null || v === undefined || v === '' ? '' : String(v); }
  function filtrar(linhas, filtros, valor) {
    return linhas.filter(function (p) { return Object.keys(filtros).every(function (id) { return filtros[id].indexOf(chave(valor(p,id))) >= 0; }); });
  }
  function ordenar(linhas, ordem, valor, tipo) {
    if (!ordem) return linhas.slice();
    return linhas.map(function (p,i) { return { p:p,i:i }; }).sort(function (a,b) {
      var x = valor(a.p,ordem.id), y = valor(b.p,ordem.id), n;
      if (tipo === 'numero' || tipo === 'valor' || ordem.id === 'codigo' || ordem.id === 'preenchido') {
        function numero(v) { if (typeof v === 'number') return v; var s = String(v || '').replace(/R\$\s*/g,''); if (/\d,\d/.test(s)) s = s.replace(/\./g,'').replace(',','.'); return Number(s.replace(/[^\d.-]/g,'')) || 0; }
        n = ordem.id === 'codigo' ? chave(x).localeCompare(chave(y), 'pt-BR', { numeric:true }) : numero(x) - numero(y);
        if (!n && ordem.id === 'codigo') n = chave(x).localeCompare(chave(y), 'pt-BR', { numeric:true });
      } else n = chave(x).localeCompare(chave(y),'pt-BR',{ numeric:true, sensitivity:'base' });
      return n ? n * (ordem.desc ? -1 : 1) : a.i - b.i;
    }).map(function (x) { return x.p; });
  }
  function distintos(linhas, id, valor, busca) {
    var mapa = Object.create(null);
    linhas.forEach(function (p) { var v = chave(valor(p,id)); mapa[v] = (mapa[v] || 0) + 1; });
    var itens = Object.keys(mapa).sort(function (a,b) { return a.localeCompare(b,'pt-BR',{numeric:true}); }).filter(function (v) { return (v || '(Vazias)').toLowerCase().indexOf(String(busca || '').toLowerCase()) >= 0; });
    return { total:itens.length, itens:itens.slice(0,1000).map(function (v) { return { valor:v, texto:v || '(Vazias)', contagem:mapa[v] }; }) };
  }
  function textoCampo(campo, lancamento, GI) {
    if (!lancamento || lancamento.valor === '' || lancamento.valor === null || lancamento.valor === undefined) return '—';
    if (campo.tipo === 'simnao') return lancamento.valor === '' || lancamento.valor == null ? '—' : String(lancamento.valor).toLowerCase() === 'sim' || lancamento.valor === true ? 'Sim' : 'Não';
    return GI.valorLegivel(campo,{ valor:lancamento.valor, recorrencia:lancamento.recorrencia, obs:'' }) || '—';
  }
  global.GIColunas = { LARGURA_FUNCOES:LARGURA_FUNCOES, padrao:padrao, mesclar:mesclar, validar:validar, filtrar:filtrar, ordenar:ordenar, distintos:distintos, textoCampo:textoCampo, chave:chave, copiar:copiar };
})(window);
