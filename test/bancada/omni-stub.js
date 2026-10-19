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
    portalToken: modo === 'local' ? '' : 'bancada-sintetica', marca: 'DEMONSTRACAO', prefixoCodigo: 'DEMO-',
    cockpitAbreChamado: params.get('escrita') === '1', modoDemonstracao: params.get('demonstracao') === '1'
  }, theme: { tokens: {} } };
  if (params.get('tema') === 'escuro') ctx.theme.tokens = {
    '--ext-color-bg': '#17191d', '--ext-color-surface': '#24272e', '--ext-color-surface-alt': '#30343d',
    '--ext-color-text': '#f0f2f4', '--ext-color-text-muted': '#b4bdc9', '--ext-color-border': '#4e5665',
    '--ext-color-primary': '#dce2ec', '--ext-color-on-primary': '#17191d', '--ext-color-warning': '#e7b75b',
    '--ext-color-success': '#62ce9b', '--ext-color-error': '#ff8b8b'
  };
  function localFetch(caminho, op) {
    if (ctx.config.modoDemonstracao) return Promise.reject(new Error('Demonstração: rede bloqueada.'));
    var url = new URL(caminho, origem);
    if (url.origin !== origem) return Promise.reject(new Error('Rede externa bloqueada na bancada.'));
    window.bancada.rede.push(url.pathname + url.search);
    return originalFetch(url.href, op);
  }
  window.fetch = localFetch;
  var armazenamento = {}, assinantes = {};
  var contatos = [
    { id: 9901, name: 'Locatário Demonstração Um', phone: '00000000001', document: '00000000000', email: 'um@example.invalid' },
    { id: 9902, name: 'Locatário Demonstração Dois', phone: '00000000002', document: '00000000000', email: 'dois@example.invalid' },
    { id: 9903, name: 'Proprietário Demonstração', phone: '00000000000', document: '00000000000' },
    { id: 9904, name: 'Fiador Demonstração', phone: '00000000000', document: '00000000000' }
  ];
  contatos.push({ id: 9905, name: 'Contato Sem Residência Demonstração', phone: '00000000005', document: '00000000000' });
  var usuarios = [ctx.user, { id: 9998, name: 'Agente Demonstração Dois', type: 2 }, { id: 9997, name: 'Agente Demonstração Três', type: 2 }];
  var chats = [8801, 8802, 8803, 8804].map(function (n, i) { return {
    id: n, contactId: i === 3 ? null : 9901 + i, userId: i === 2 ? 9998 : 9999, queueId: i === 2 ? 92 : 91,
    status: 'active', sessionLocked: false, channel: 'WhatsApp', protocol: 'DEMO-P' + n,
    startedAt: '2026-10-17T12:00:00.000Z', contact: contatos[i], unread: 0
  }; });
  if (params.get('perfil') === 'admin') ctx.user.type = 0;
  if (params.get('perfil') === 'supervisor') ctx.user.type = 1;
  chats.push({ id: 8805, contactId: 9901, userId: 9998, queueId: 93, status: 'active', channel: 'WhatsApp', protocol: 'DEMO-SUPERVISOR', startedAt: '2026-10-18T12:00:00.000Z' });
  chats.push({ id: 8806, contactId: 9905, userId: 9999, queueId: 91, status: 'active', channel: 'WhatsApp', protocol: '', startedAt: '2026-10-17T12:00:00.000Z' });
  var selecionado = params.has('chat') ? Number(params.get('chat')) : 8801;
  function copia(v) { return JSON.parse(JSON.stringify(v)); }
  function normalizar(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function falhar(code, mensagem) { var e = new Error(mensagem); e.code = code; return Promise.reject(e); }
  function chat(n) { return chats.filter(function (c) { return c.id === Number(n); })[0]; }
  function emitir(nome, dados) {
    window.bancada.eventos.push({ nome: nome, dados: copia(dados) });
    (assinantes[nome] || []).slice().forEach(function (fn) { fn(copia(dados)); });
  }
  window.bancada = { chamadas: [], gravacoesStorage: 0, mensagens: [], eventos: [], rede: [] };
  window.omni = {
    queueTypes: Object.freeze({ WHATSAPP: 0, TELEGRAM: 1, MESSENGER: 2, WEBCHAT: 3, INSTAGRAM: 4, WEBCHAT_V2: 47 }),
    on: function (nome, fn) { (assinantes[nome] || (assinantes[nome] = [])).push(fn); return function () { window.omni.off(nome, fn); }; },
    off: function (nome, fn) { assinantes[nome] = fn ? (assinantes[nome] || []).filter(function (f) { return f !== fn; }) : []; },
    queues: { list: function () { return window.bancada.falharLista ? falhar('rate_limit', 'Limite de consultas.') : Promise.resolve([{ id: 91, name: 'Fila Um' }, { id: 92, name: 'Fila Dois' }, { id: 93, name: 'Fila Supervisor' }]); } },
    users: { list: function () { return Promise.resolve(copia(usuarios)); } },
    chats: {
      getSelected: function () { return Promise.resolve(copia(chat(selecionado) || null)); },
      get: function (n) { return chat(n) ? Promise.resolve(copia(chat(n))) : falhar('not_found', 'Atendimento não encontrado.'); },
      listMine: function () { if (window.bancada.falharLista) return falhar('rate_limit', 'Limite de consultas.'); return Promise.resolve(copia(chats.filter(function (c) { return c.userId === ctx.user.id; }))); },
      listByQueue: function (queueId) {
        if (ctx.user.type === 2) return falhar('forbidden', 'A listagem por fila exige supervisor.');
        return Promise.resolve(copia(chats.filter(function (c) { return c.queueId === Number(queueId); })));
      },
      select: function (n) {
        if (!chat(n)) return falhar('not_found', 'Atendimento não encontrado.');
        selecionado = Number(n); emitir('omniChatSelected', chat(n)); return Promise.resolve({ selected: true });
      },
      getMessages: function (n, opts) {
        if (!chat(n)) return falhar('not_found', 'Atendimento não encontrado.');
        var msgs = [ { id: 'DEMO-M2', chatId: Number(n), direction: 'in', text: '', at: '2026-10-17T12:02:00.000Z',
          fileRef: 'DEMO-FOTO-' + n, fileName: 'foto-demonstracao.svg', mimetype: 'image/svg+xml', fileSize: 100 },
          { id: 'DEMO-M1', chatId: Number(n), direction: 'in', text: 'Relato sintético de manutenção.', at: '2026-10-17T12:01:00.000Z', fileRef: null } ];
        if (opts && opts.before) msgs = msgs.slice(msgs.findIndex(function (m) { return m.id === opts.before; }) + 1);
        return Promise.resolve(msgs.slice(0, opts && opts.limit || 50));
      },
      getFile: function (ref) {
        if (!/^DEMO-FOTO-880[1-4]$/.test(String(ref))) return falhar('not_found', 'Arquivo não encontrado.');
        return Promise.resolve({ url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><text x="4" y="30">DEMO</text></svg>'), mimetype: 'image/svg+xml', name: 'foto-demonstracao.svg', size: 100 });
      },
      sendMessage: function (n, payload) {
        if (!chat(n)) return falhar('not_found', 'Atendimento não encontrado.');
        if (window.bancada.recusarEnvio) return falhar('forbidden', 'Janela de 24 horas encerrada.');
        if (!payload || !payload.text && !payload.fileUrl) return falhar('bad_args', 'Mensagem vazia.');
        if (window.bancada.semConfirmarEnvio) return Promise.resolve({ sent: false });
        window.bancada.mensagens.push({ chatId: Number(n), payload: copia(payload) });
        return Promise.resolve({ sent: true, id: 'DEMO-ENVIO-' + window.bancada.mensagens.length });
      }
    },
    ready: function (fn) { Promise.resolve().then(function () {
      // Só a cota usa relógio acelerado; datas de negócio e cache continuam reais.
      if (window.GI && GI.criarCotaPortal) {
        var instanteCota = 0;
        GI.cotaPortal = GI.criarCotaPortal(function () { instanteCota += 2100; return instanteCota; });
      }
      fn(ctx);
    }); },
    session: { get: function () { return Promise.resolve(ctx); },
      getUser: function () { return Promise.resolve(ctx.user); },
      getPermissions: function () { return Promise.resolve({ isAdmin: ctx.user.type === 0, isSupervisor: ctx.user.type === 1 }); },
      getTheme: function () { return Promise.resolve(ctx.theme); } },
    http: { request: function (op) {
      if (ctx.config.modoDemonstracao) return Promise.reject(new Error('Demonstração: HTTP bloqueado.'));
      var url = new URL(op.url);
      if (url.origin !== 'http://portal.bancada.invalid') return Promise.reject(new Error('Portal externo bloqueado na bancada.'));
      window.bancada.chamadas.push({ caminho: url.pathname + url.search, method: op.method, body: op.body });
      if (modo === 'fora') return Promise.resolve({ status: 503, body: JSON.stringify({ erro: 'portal_indisponivel' }) });
      return localFetch(url.pathname + url.search, { method: op.method, headers: op.headers, body: op.body }).then(function (r) {
        return r.text().then(function (body) { return { status: r.status, body: body }; });
      });
    } },
    contacts: {
      get: function (n) { var c = contatos.filter(function (c) { return c.id === Number(n); })[0]; return c ? Promise.resolve(copia(c)) : falhar('not_found', 'Contato não encontrado.'); },
      search: function (termo) { return Promise.resolve(copia(contatos.filter(function (c) { return normalizar(c.name + ' ' + c.phone + ' ' + (c.email || '')).indexOf(normalizar(termo)) !== -1; }))); }
    },
    data: { request: function (recurso, verbo, payload) {
      if (recurso === 'contacts/getItemChatsHistory') {
        if (verbo !== 'POST' || !payload || !payload.id) return falhar('bad_args', 'Contato obrigatório.');
        window.bancada.consultasHistorico = (window.bancada.consultasHistorico || 0) + 1;
        if (window.bancada.falharHistorico) return falhar('teste', 'Histórico indisponível de teste.');
        var historico = window.bancada.historico;
        if (typeof historico === 'function') return historico(payload.id);
        if (Array.isArray(historico)) return Promise.resolve(copia(historico));
        return Promise.resolve(copia(chats.filter(function (c) { return c.contactId === Number(payload.id) && (ctx.user.type !== 2 || c.userId === ctx.user.id); }).map(function (c) {
          return { id: c.id, status: 1, begintime: c.startedAt, protocol: c.protocol, origin: 0, qname: c.queueId === 93 ? 'Fila Supervisor' : 'Fila Um', queueId: c.queueId };
        })));
      }
      if (recurso.indexOf('users') === 0) return Promise.resolve(copia(usuarios));
      if (!/^(products|users)(\?|$)/.test(recurso)) return Promise.reject(new Error('Recurso não simulado.'));
      return localFetch('/bancada/sdk/' + recurso).then(function (r) { return r.json(); });
    } },
    storage: { get: function (k) { return Promise.resolve(armazenamento[k]); }, set: function (k, v) {
      window.bancada.gravacoesStorage++; armazenamento[k] = v; return Promise.resolve();
    } },
    ui: { resize: function () { return Promise.resolve(); }, toast: function (msg) {
      banner.textContent = 'BANCADA LOCAL · ' + msg;
    }, openContribution: function (id) {
      var telas = { 'gi-imoveis': 'imoveis', 'gi-locados': 'locados', 'gi-campos': 'campos', 'gi-historico': 'historico', 'gi-config': 'config', 'gi-chamados': 'chamados', 'gi-prestadores': 'prestadores', 'gi-cockpit': 'painel' };
      if (!telas[id]) return Promise.reject(new Error('Tela não simulada.'));
      location.href = '/app/' + telas[id] + '.html' + location.search;
      return Promise.resolve();
    } }
  };
})();
