/* Só é injetado pelo servidor de bancada; nenhuma tela publicada o referencia. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search), modo = params.get('modo') || 'portal';
  var origem = location.origin, originalFetch = window.fetch.bind(window);
  var banner = document.createElement('p');
  banner.className = 'gi-aviso';
  banner.textContent = 'BANCADA LOCAL · dados sintéticos · nenhuma chamada a instâncias reais';
  document.body.insertBefore(banner, document.body.firstChild);
  var ctx = { user: { id: 9999, name: 'Agente Demonstração', type: 2 }, config: {
    portalUrl: modo === 'local' ? '' : 'http://portal.bancada.invalid',
    portalToken: modo === 'local' ? '' : 'bancada-sintetica', marca: 'DEMONSTRACAO', prefixoCodigo: 'DEMO-'
  }, theme: { tokens: {} } };
  if (params.get('tema') === 'escuro') ctx.theme.tokens = {
    '--ext-color-bg': '#17191d', '--ext-color-surface': '#24272e', '--ext-color-surface-alt': '#30343d',
    '--ext-color-text': '#f0f2f4', '--ext-color-text-muted': '#b4bdc9', '--ext-color-border': '#4e5665',
    '--ext-color-primary': '#dce2ec', '--ext-color-on-primary': '#17191d', '--ext-color-warning': '#e7b75b',
    '--ext-color-success': '#62ce9b', '--ext-color-error': '#ff8b8b'
  };
  function localFetch(caminho, op) {
    var url = new URL(caminho, origem);
    if (url.origin !== origem) return Promise.reject(new Error('Rede externa bloqueada na bancada.'));
    return originalFetch(url.href, op);
  }
  window.fetch = localFetch;
  var armazenamento = {};
  window.bancada = { chamadas: [], gravacoesStorage: 0 };
  window.omni = {
    ready: function (fn) { Promise.resolve().then(function () { fn(ctx); }); },
    session: { get: function () { return Promise.resolve(ctx); },
      getUser: function () { return Promise.resolve(ctx.user); },
      getPermissions: function () { return Promise.resolve({ isAdmin: false, isSupervisor: false }); },
      getTheme: function () { return Promise.resolve(ctx.theme); } },
    http: { request: function (op) {
      var url = new URL(op.url);
      if (url.origin !== 'http://portal.bancada.invalid') return Promise.reject(new Error('Portal externo bloqueado na bancada.'));
      window.bancada.chamadas.push({ caminho: url.pathname + url.search, method: op.method, body: op.body });
      if (modo === 'fora') return Promise.resolve({ status: 503, body: JSON.stringify({ erro: 'portal_indisponivel' }) });
      return localFetch(url.pathname + url.search, { method: op.method, headers: op.headers, body: op.body }).then(function (r) {
        return r.text().then(function (body) { return { status: r.status, body: body }; });
      });
    } },
    contacts: { search: function (termo) { return localFetch('/bancada/sdk/contacts?termo=' + encodeURIComponent(termo)).then(function (r) { return r.json(); }); } },
    data: { request: function (recurso) {
      if (!/^(products|users)(\?|$)/.test(recurso)) return Promise.reject(new Error('Recurso não simulado.'));
      return localFetch('/bancada/sdk/' + recurso).then(function (r) { return r.json(); });
    } },
    storage: { get: function (k) { return Promise.resolve(armazenamento[k]); }, set: function (k, v) {
      window.bancada.gravacoesStorage++; armazenamento[k] = v; return Promise.resolve();
    } },
    ui: { resize: function () { return Promise.resolve(); }, toast: function (msg) {
      banner.textContent = 'BANCADA LOCAL · ' + msg;
    }, openContribution: function (id) {
      var telas = { 'gi-imoveis': 'imoveis', 'gi-locados': 'locados', 'gi-campos': 'campos', 'gi-historico': 'historico', 'gi-config': 'config' };
      if (!telas[id]) return Promise.reject(new Error('Tela não simulada.'));
      location.href = '/app/' + telas[id] + '.html' + location.search;
      return Promise.resolve();
    } }
  };
})();
