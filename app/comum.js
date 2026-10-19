/* Gerenciamento de Imóveis — camada comum às telas.
   Roda dentro do contêiner da extensão: origem opaca, sem cookie, sem JWT.
   Tudo que fala com o EvoTalks passa por window.omni. */
(function (global) {
  'use strict';

  var GI = {};
  // Liberação temporária do teste: remover junto com userIds no manifest.
  GI.GESTORES_EXTRA = [531];
  var ctx = null;

  /* ---------------------------------------------------------------- contexto */

  GI.ctx = function () { return ctx; };
  GI.cfg = function (chave, padrao) {
    var v = ctx && ctx.config ? ctx.config[chave] : undefined;
    return (v === undefined || v === null || v === '') ? padrao : v;
  };
  /* Quem está gravando. O contexto nem sempre traz `user.name` — e quando não
     traz, o que ia para o histórico era o ID, que não diz nada a ninguém. Por
     isso o nome é resolvido na abertura da tela, contra a lista de usuários da
     instância, e só cai no ID se essa consulta não responder. */
  var nomeResolvido = '';

  GI.usuario = function () {
    if (nomeResolvido) return nomeResolvido;
    return (ctx && ctx.user) ? (ctx.user.name || ctx.user.id) : 'desconhecido';
  };

  var cacheUsuarios = null;

  /** Mapa id → nome dos usuários da instância. Falha vira mapa vazio. */
  GI.usuarios = function () {
    if (cacheUsuarios) return Promise.resolve(cacheUsuarios);
    if (!global.omni || !omni.data || !omni.data.request) return Promise.resolve({});
    return Promise.resolve(omni.data.request('users?limit=500', 'GET'))
      .then(function (r) {
        var mapa = {};
        GI.lista(r).forEach(function (u) {
          var nome = u && (u.name || u.username || u.login || u.email);
          if (u && u.id !== undefined && nome) mapa[String(u.id)] = String(nome);
        });
        cacheUsuarios = mapa;
        return mapa;
      })
      .catch(function () { cacheUsuarios = {}; return cacheUsuarios; });
  };

  /** Troca o ID pelo nome quando der; devolve o valor original quando não. */
  GI.nomeDeUsuario = function (mapa, valor) {
    var v = String(valor === null || valor === undefined ? '' : valor);
    if (!v) return '';
    return (mapa && mapa[v]) ? mapa[v] : v;
  };

  GI.pronto = function (fn) {
    function aplicarTema(c) {
      var tokens = (c && c.theme && c.theme.tokens) || {};
      for (var k in tokens) {
        if (Object.prototype.hasOwnProperty.call(tokens, k)) {
          document.documentElement.style.setProperty(k, tokens[k]);
        }
      }
    }
    function arrancar(c) {
      ctx = c || null;
      aplicarTema(ctx);
      GI.mostrarDemonstracao();
      Promise.resolve()
        .then(function () {
          // O nome de quem grava é decidido ANTES de qualquer escrita — senão
          // o primeiro registro do dia sai com ID e o resto com nome.
          if (ctx && ctx.user && ctx.user.name) { nomeResolvido = String(ctx.user.name); return null; }
          if (!ctx || !ctx.user || ctx.user.id === undefined) return null;
          return GI.usuarios().then(function (mapa) {
            nomeResolvido = mapa[String(ctx.user.id)] || '';
          });
        })
        .then(function () { return GI.definirModo(); })
        .then(function () { GI.mostrarModo(); })
        .then(function () { return fn(ctx); })
        .catch(function (e) { GI.erroFatal(e); })
        .then(function () { GI.ajustarAltura(); });
    }
    if (global.omni && global.omni.ready) { omni.ready(arrancar); }
    else { setTimeout(function () { arrancar(null); }, 250); }

    global.addEventListener('message', function (ev) {
      var d = ev.data;
      if (Array.isArray(d) && d[0] === 'hello') { aplicarTema(d[1] || {}); }
    });
  };

  /* ------------------------------------------------------------------ altura */

  var ultimaAltura = 0;
  GI.ajustarAltura = function () {
    if (!global.omni || !omni.ui || !omni.ui.resize) return;
    var h = Math.max(document.documentElement.scrollHeight + 8, 520);
    if (Math.abs(h - ultimaAltura) < 12) return;
    ultimaAltura = h;
    var r = omni.ui.resize(h);           // recebe NÚMERO e rejeita promise
    if (r && r.catch) r.catch(function () {});
  };
  if (global.ResizeObserver) {
    new ResizeObserver(function () { GI.ajustarAltura(); }).observe(document.documentElement);
  }

  /* ------------------------------------------------------------------- aviso */

  var timerRecado;
  GI.aviso = function (texto, tipo) {
    try { var r = omni.ui.toast(String(texto), tipo || 'info'); if (r && r.catch) r.catch(function () {}); }
    catch (_) { /* O host pode estar desmontando a contribuição. */ }
  };
  GI.recado = function (texto, tipo, alvo) {
    var box = alvo;
    if (!box && document.querySelectorAll) {
      var modais = document.querySelectorAll('.gi-modal'), modal = modais[modais.length - 1];
      if (modal) {
        box = modal.querySelector('[data-recado-form], [data-recado-modal]');
        if (!box) { box = document.createElement('div'); box.setAttribute('data-recado-modal', ''); modal.insertBefore(box, modal.querySelector('.gi-modal-corpo')); }
      }
    }
    if (!box) box = document.getElementById('gi-recado');
    if (!box && document.body) {
      box = document.createElement('div'); box.id = 'gi-recado';
      document.body.insertBefore(box, document.body.firstChild);
    }
    if (!box) return;
    clearTimeout(timerRecado); box.textContent = ''; box.hidden = !texto;
    if (!texto) return;
    tipo = tipo || 'erro';
    box.className = 'gi-recado gi-recado--' + tipo; box.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    box.setAttribute('tabindex', '-1');
    var mensagem = document.createElement('span'), fechar = document.createElement('button');
    mensagem.textContent = (tipo === 'erro' ? '! ' : tipo === 'sucesso' ? '✓ ' : '') + String(texto);
    fechar.type = 'button'; fechar.textContent = '×'; fechar.setAttribute('aria-label', 'Fechar recado');
    fechar.onclick = function () { box.hidden = true; };
    box.appendChild(mensagem); box.appendChild(fechar);
    if (tipo === 'erro') { box.focus(); if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' }); }
    if (tipo === 'sucesso') timerRecado = setTimeout(function () { box.hidden = true; }, 8000);
    if (tipo !== 'info') GI.aviso(texto, tipo === 'erro' ? 'error' : 'success');
  };
  GI.erroFatal = function (err) {
    var texto = GI.mensagemErro(err), box = document.getElementById('gi-erro');
    if (box) { box.hidden = false; box.style.display = 'block'; box.textContent = texto; }
    var modal = document.querySelector && document.querySelector('.gi-modal');
    if (modal && modal.querySelector('.gi-modal-recado')) modal.querySelector('.gi-modal-recado').textContent = texto;
    GI.recado(texto, 'erro', modal && modal.querySelector('[data-recado-form]')); GI.ajustarAltura();
  };
  GI.id = function (v) { var n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
  GI.textoOuNull = function (v) { return typeof v !== 'string' && typeof v !== 'number' || typeof v === 'number' && !Number.isFinite(v) || String(v).trim() === '' ? null : String(v); };
  GI.nomeContato = function (pessoa, chat) {
    pessoa = pessoa || {}; chat = chat || {};
    var valores = [pessoa.name, chat.contact && chat.contact.name, pessoa.phone, chat.contact && chat.contact.phone];
    for (var i = 0; i < valores.length; i++) if (GI.textoOuNull(valores[i])) return String(valores[i]).trim();
    return 'Contato ' + (GI.id(pessoa.id || chat.contactId) || 'sem identificação');
  };
  GI.dataDoChat = function (v) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v <= 0) return null;
      if (v < 1e11) v *= 1000;
    } else if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) return null;
    var d = new Date(v), ano = d.getUTCFullYear();
    return Number.isFinite(d.getTime()) && ano >= 2000 && ano <= 2100 ? d.toISOString() : null;
  };
  GI.mostrarDemonstracao = function () {
    var ativo = GI.cfg('modoDemonstracao', false) === true || new URLSearchParams(location.search).get('demonstracao') === '1';
    var faixa = document.getElementById('gi-demo-global');
    if (ativo && !faixa) {
      faixa = document.createElement('p'); faixa.id = 'gi-demo-global'; faixa.className = 'gi-demo-global';
      faixa.setAttribute('role', 'status'); faixa.textContent = 'DEMONSTRAÇÃO · dados fictícios';
      document.body.insertBefore(faixa, document.body.firstChild);
    }
    if (faixa) faixa.hidden = !ativo;
  };
  GI.isoPortal = function (v) {
    if (v == null || v === '' || typeof v !== 'number' && typeof v !== 'string') return null;
    // Histórico legado sem fuso é UTC; não depender do fuso do navegador do agente.
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) v = v.replace(' ', 'T') + 'Z';
    var d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };
  GI.autorCabecalho = function (v) { return String(v || '').replace(/[^\x00-\xff]/g, '?').replace(/[\x00-\x20\x7f-\x9f]+/g, ' ').trim(); };
  var errosPortal = {
    locacao_encerrada: 'Esta locação foi encerrada. Escolha outra locação ativa.',
    nao_encontrada: 'Esta locação não foi encontrada. Atualize a consulta.', nao_encontrado: 'Este registro não foi encontrado. Atualize a consulta.',
    api_desabilitada: 'A conexão do portal está desabilitada. Verifique a configuração.', falha_interna: 'O portal não conseguiu concluir a operação. Tente de novo em instantes.',
    imovel_ja_locado: 'Este imóvel já está locado. Inclua o contato na locação existente.',
    aprovacao_pendente: 'Aguardando o proprietário. Registre a decisão em Gestão → Aprovação.',
    aprovacao_recusada: 'O proprietário recusou o orçamento. Escolha outro orçamento antes de aprovar.',
    aprovacao_nao_necessaria: 'Este orçamento não precisa de aprovação do proprietário.',
    sem_visita: 'Agende a visita antes de mudar para Agendado.', sem_orcamento_escolhido: 'Escolha um orçamento antes de mudar para Aprovação.',
    limite_anexos: 'O limite de fotos foi atingido. Envie menos arquivos.', arquivo_grande: 'Esta foto é muito grande. Escolha uma foto menor.',
    orcamento_escolhido: 'O orçamento escolhido não pode ser removido. Escolha outro orçamento primeiro.',
    chamado_encerrado: 'Este chamado está encerrado. Use Reabrir para voltar à Triagem.',
    rate_limited: 'Limite de consultas atingido. Aguarde um minuto e tente novamente.', rate_limit: 'Limite de consultas atingido. Aguarde um minuto e tente novamente.'
  };
  var rotulosCampos = { titulo: 'Título', imovel: 'Imóvel', imovel_codigo: 'Imóvel', locacao_id: 'Imóvel', nome: 'Nome', telefone: 'Telefone', contato_id: 'Contato', solicitante: 'Solicitante',
    valor: 'Valor', valor_centavos: 'Valor', valor_estimado_centavos: 'Valor estimado', canal: 'Canal', chat_id: 'Atendimento', protocolo: 'Protocolo', fila: 'Fila', iniciado_em: 'Início do atendimento',
    user_id: 'Atendente', file_ref: 'Arquivo', descricao: 'Descrição', categoria: 'Categoria', prioridade: 'Prioridade', texto: 'Nota', inicio: 'Início', fim: 'Fim', contatos: 'Contatos', contrato_numero: 'Contrato', prestador_nome: 'Prestador', aluguel: 'Aluguel', valor_aluguel_centavos: 'Aluguel', dia_vencimento: 'Vencimento', garantia: 'Garantia', endereco: 'Endereço', bairro: 'Bairro', cidade: 'Cidade', tipo: 'Tipo', papel: 'Papel', email: 'E-mail', observacao: 'Observação' };
  GI.mensagemErro = function (err) {
    err = err || {}; var d = err.dados || {}, codigo = d.erro || err.code || err.message;
    if (err.status === 429) codigo = 'rate_limited';
    if (codigo === 'dados_invalidos' || (err.status === 422 || err.status === 400) && d.campos) {
      if (!d.campos) return 'Confira os dados informados antes de salvar.';
      if (d.campos.valor_estimado_centavos && /orçamento escolhido/i.test(String(d.campos.valor_estimado_centavos))) return 'Valor estimado: o valor vem do orçamento escolhido. Para mudar, escolha outro orçamento.';
      return Object.keys(d.campos).map(function (k) {
        var chave = k.split('.').pop(), rotulo = Object.hasOwn(rotulosCampos, chave) ? rotulosCampos[chave] : null;
        if (!rotulo) return 'Não foi possível abrir o chamado. Confira os dados e tente de novo.';
        var motivo = String(d.campos[k]);
        if (/^Informe um texto/.test(motivo)) motivo = 'preencha este campo com texto válido.';
        return rotulo + ': ' + motivo;
      }).join(' · ');
    }
    if (Object.hasOwn(errosPortal, codigo)) return errosPortal[codigo];
    if (err.status === 401) return 'A conexão do portal foi recusada. Verifique a configuração.';
    if (err.semResposta || err.status === 0 || /timeout|network|fetch|rede|ECONN/i.test(codigo || '')) return 'O portal não respondeu. Tente de novo em instantes.';
    if (typeof d.erro === 'string' && !/\bHTTP\b/i.test(d.erro) && /[ \u00c0-\u00ff]/.test(d.erro) && !/^[a-z_]+$/.test(d.erro)) return d.erro;
    if (err.status || /\bHTTP\b/i.test(codigo || '') || /^[a-z_]+$/.test(codigo || '')) return 'Não foi possível concluir a operação. Tente de novo em instantes.';
    return err.message || 'Não foi possível concluir a operação. Tente de novo em instantes.';
  };
  GI.criarFila = function (limite) {
    var pendentes = [], ativos = 0;
    function proxima() {
      while (ativos < limite && pendentes.length) {
        (function (tarefa) {
          ativos++;
          Promise.resolve().then(tarefa.fn).then(tarefa.resolve, tarefa.reject).finally(function () { ativos--; proxima(); });
        })(pendentes.shift());
      }
    }
    return function (fn) { return new Promise(function (resolve, reject) { pendentes.push({ fn: fn, resolve: resolve, reject: reject }); proxima(); }); };
  };
  GI.filaArquivos = GI.criarFila(4);

  /* --------------------------------------------------------------- guardados

     DOIS MODOS, e é aqui — e só aqui — que a diferença mora:

     • PORTAL  (config `portalUrl` + `portalToken` preenchidas): o dado vive no
       Postgres do portal, que é o MESMO banco que o MCP lê. Tela e IA passam a
       ver uma verdade só. É o modo de operação.
     • LOCAL   (config vazia): omni.storage, por usuário e por navegador. Serve
       para experimentar as telas sem servidor; o que se grava aqui NÃO chega à
       IA nem a mais ninguém.

     A tela diz em qual modo está, no rodapé — não se descobre isso por
     acidente. */

  var CHAVES = { campos: 'gi.campos', valores: 'gi.valores', historico: 'gi.historico' };

  GI.modo = 'local';
  GI.portalErro = '';

  function baseDoPortal() {
    var u = String(GI.cfg('portalUrl', '')).trim().replace(/\/+$/, '');
    return u ? u + '/api/ext' : '';
  }
  function tokenDoPortal() { return String(GI.cfg('portalToken', '')).trim(); }

  GI.usaPortal = function () { return !!(baseDoPortal() && tokenDoPortal()); };

  /* Como a chamada sai daqui, e por que NÃO é sempre fetch.
     A CSP do contêiner libera em connect-src apenas o origin de onde o HTML
     veio (aqui, o GitHub Pages) mais o da própria aplicação. O portal fica em
     outro domínio, então fetch direto é BLOQUEADO — e o erro que chega é só
     "Failed to fetch", sem dizer que foi a CSP.
     omni.http.request não tem esse problema: executa no backend da instância.
     Custa a cota de 30 req/min por usuário, o que sobra para telas de cadastro.
     O fetch continua sendo usado quando o portal serve o próprio HTML (mesma
     origem) — aí é mais rápido e não consome cota. */
  function mesmaOrigem() {
    try {
      var u = new URL(baseDoPortal());
      return u.origin === global.location.origin;
    } catch (e) { return false; }
  }

  function erroDe(status, corpo) {
    var dados = null;
    try { dados = corpo ? JSON.parse(corpo) : null; } catch (e) { /* não-JSON */ }
    var msg = (dados && dados.erro) ? dados.erro : ("HTTP " + status);
    if (status === 401) msg = "token do portal recusado";
    if (status === 403 && dados && dados.detalhe) msg = dados.detalhe;
    var err = new Error(msg);
    err.status = status;
    err.dados = dados;
    err.message = GI.mensagemErro(err);
    return err;
  }

  function cabecalhos(temCorpo) {
    var cab = {
      "Authorization": "Bearer " + tokenDoPortal(),
      "X-GI-Autor": GI.autorCabecalho(GI.usuario()),
      "X-GI-User-Id": String((ctx && ctx.user && ctx.user.id) || "")
    };
    if (temCorpo) cab["Content-Type"] = "application/json";
    return cab;
  }

  function viaFetch(url, opcoes) {
    return fetch(url, {
      method: opcoes.corpo !== undefined ? "POST" : "GET",
      headers: cabecalhos(opcoes.corpo !== undefined),
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (!r.ok) throw erroDe(r.status, txt);
        try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; }
      });
    });
  }

  /* Janela móvel compartilhada por todas as chamadas deste documento ao proxy. */
  GI.criarCotaPortal = function (agora) {
    var usadas = [];
    agora = agora || function () { return Date.now(); };
    function restantes() { var t = agora(); usadas = usadas.filter(function (em) { return t - em < 60000; }); return 30 - usadas.length; }
    return { restantes: restantes, reservar: function () {
      var t = agora();
      usadas = usadas.filter(function (em) { return t - em < 60000; });
      if (usadas.length >= 30) {
        var err = new Error('Limite de consultas atingido. Aguarde um minuto e tente novamente.');
        err.status = 429; err.code = 'rate_limited'; throw err;
      }
      usadas.push(t);
    } };
  };
  GI.cotaPortal = GI.criarCotaPortal();

  function viaOmni(url, opcoes) {
    if (!global.omni || !omni.http || !omni.http.request) {
      return Promise.reject(new Error("sem omni.http.request nesta instância"));
    }
    try { GI.cotaPortal.reservar(); } catch (err) { return Promise.reject(err); }
    return Promise.resolve(omni.http.request({
      url: url,
      method: opcoes.corpo !== undefined ? "POST" : "GET",
      headers: cabecalhos(opcoes.corpo !== undefined),
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      timeout: 20000
    })).then(function (r) {
      // O body volta em TEXTO, sempre — o JSON.parse é nosso.
      if (!r || r.status < 200 || r.status >= 300) {
        throw erroDe(r ? r.status : 0, r && r.body);
      }
      try { return r.body ? JSON.parse(r.body) : null; } catch (e) { return null; }
    });
  }

  function chamar(caminho, opcoes) {
    opcoes = opcoes || {};
    var url = baseDoPortal() + caminho;
    return Promise.resolve().then(function () { return mesmaOrigem() ? viaFetch(url, opcoes) : viaOmni(url, opcoes); }).catch(function (err) {
      if (!err.status && !/rate_limit|forbidden|bad_args/.test(err.code || '')) err.semResposta = true;
      err.message = GI.mensagemErro(err); throw err;
    });
  }
  GI.chamarPortal = chamar;

  /* Locações são compartilhadas com a assistente: nunca têm cópia no storage. */
  function chamarLocacoes(caminho, corpo) {
    if (GI.modo !== 'portal') return Promise.reject(new Error('Locados exigem o portal conectado'));
    return GI.chamarPortal(caminho, corpo === undefined ? undefined : { corpo: corpo });
  }
  GI.locacoes = function (filtros) {
    var qs = Object.keys(filtros || {}).filter(function (k) {
      return filtros[k] !== '' && filtros[k] !== null && filtros[k] !== undefined;
    }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(filtros[k]); });
    return chamarLocacoes('/locacoes' + (qs.length ? '?' + qs.join('&') : ''));
  };
  GI.locacoesMapa = function () {
    return chamarLocacoes('/locacoes/mapa').then(function (r) { return r.locados || {}; });
  };
  GI.locacoesCandidatas = function (dias) { return chamarLocacoes('/locacoes/candidatas?dias=' + encodeURIComponent(dias || 60)); };
  GI.locacoesObter = function (id) { return chamarLocacoes('/locacoes/' + encodeURIComponent(id)); };
  GI.locacoesCriar = function (dados) { return chamarLocacoes('/locacoes', dados); };
  GI.locacoesAtualizar = function (id, dados) { return chamarLocacoes('/locacoes/' + encodeURIComponent(id), dados); };
  GI.locacoesEncerrar = function (id, motivo) { return chamarLocacoes('/locacoes/' + encodeURIComponent(id) + '/encerrar', { motivo: motivo }); };
  GI.buscarContatos = function (termo) {
    if (!global.omni || !omni.contacts || !omni.contacts.search) {
      return Promise.reject(new Error('Busca de contatos indisponível neste perfil.'));
    }
    return Promise.resolve().then(function () {
      return omni.contacts.search(String(termo || '').trim(), { limit: 100 });
    }).then(function (r) {
      var lista = Array.isArray(r) ? r : (r && (r.contacts || r.rows)) || GI.lista(r);
      return lista.filter(function (c) { return c && GI.id(c.id); }).map(function (c) {
        return { id: GI.id(c.id), name: GI.nomeContato(c), phone: GI.textoOuNull(c.phone) || '', email: GI.textoOuNull(c.email) || '' };
      });
    });
  };

  function ler(chave, padrao) {
    if (!global.omni || !omni.storage) return Promise.resolve(padrao);
    return Promise.resolve(omni.storage.get(chave))
      .then(function (v) { return (v === undefined || v === null) ? padrao : v; })
      .catch(function () { return padrao; });
  }
  function gravar(chave, valor) {
    return Promise.resolve(omni.storage.set(chave, valor)).catch(function (e) {
      if (e && e.code === 'quota') {
        GI.aviso('Espaço do navegador cheio — nada foi gravado. Apague histórico antigo.', 'error');
      }
      throw e;
    });
  }

  /* Confere o portal uma vez, na montagem. Se ele não responder, a tela NÃO
     cai em silêncio para o storage local: ela avisa, porque trabalhar numa
     cópia que ninguém lê é pior do que não trabalhar. */
  GI.definirModo = function () {
    if (!GI.usaPortal()) { GI.modo = 'local'; return Promise.resolve('local'); }
    return chamar('/info').then(function () {
      GI.modo = 'portal';
      GI.portalErro = '';
      return 'portal';
    }).catch(function (e) {
      GI.modo = 'portal-fora';
      GI.portalErro = e && e.message ? e.message : String(e);
      return 'portal-fora';
    });
  };

  function exigePortal() {
    return Promise.reject(new Error(
      'O portal não respondeu (' + (GI.portalErro || 'sem detalhe') + '). ' +
      'Nada foi gravado — corrija a conexão antes de continuar.'));
  }

  GI.campos = function () {
    if (GI.modo === 'portal') return chamar('/campos?todos=1').then(function (r) { return paraCamposTela(r.campos); });
    if (GI.modo === 'portal-fora') return exigePortal();
    return ler(CHAVES.campos, []);
  };

  GI.salvarCampos = function (lista) {
    if (GI.modo !== 'portal') {
      if (GI.modo === 'portal-fora') return exigePortal();
      return gravar(CHAVES.campos, lista);
    }
    // No portal cada campo é uma linha: a tela usa GI.campoCriar/Atualizar/Apagar.
    return Promise.resolve();
  };

  GI.valores = function () {
    if (GI.modo === 'portal') return Promise.resolve({});   // o portal é consultado por imóvel
    if (GI.modo === 'portal-fora') return exigePortal();
    return ler(CHAVES.valores, {});
  };

  /* Mapa código → quantos campos preenchidos, para a LISTA saber quem está
     pendente sem abrir imóvel por imóvel. No modo portal isto é uma consulta
     só; antes dela a lista pintava tudo de pendente, porque `GI.valores()`
     devolve vazio aqui e só os imóveis abertos na sessão entravam no estado. */
  GI.preenchidos = function () {
    if (GI.modo === 'portal') {
      return chamar('/preenchidos')
        .then(function (r) { return (r && r.preenchidos) || {}; });
    }
    if (GI.modo === 'portal-fora') return exigePortal();
    return ler(CHAVES.valores, {}).then(function (mapa) {
      var saida = {};
      Object.keys(mapa).forEach(function (c) { saida[c] = Object.keys(mapa[c] || {}).length; });
      return saida;
    });
  };
  GI.salvarValores = function (mapa) {
    if (GI.modo === 'portal') return Promise.resolve();
    if (GI.modo === 'portal-fora') return exigePortal();
    return gravar(CHAVES.valores, mapa);
  };

  GI.historico = function (filtros) {
    if (GI.modo === 'portal') {
      var qs = [];
      filtros = filtros || {};
      if (filtros.codigo) qs.push('codigo=' + encodeURIComponent(filtros.codigo));
      if (filtros.quem) qs.push('quem=' + encodeURIComponent(filtros.quem));
      if (filtros.campo) qs.push('campo=' + encodeURIComponent(filtros.campo));
      return chamar('/historico' + (qs.length ? '?' + qs.join('&') : ''))
        .then(function (r) { return (r.eventos || []).map(paraEventoTela); });
    }
    if (GI.modo === 'portal-fora') return exigePortal();
    return ler(CHAVES.historico, []);
  };

  GI.registrarHistorico = function (eventos) {
    // No portal o histórico nasce de trigger no banco, com a autoria que veio
    // no cabeçalho: gravar daqui duplicaria cada linha.
    if (GI.modo === 'portal') return Promise.resolve();
    if (GI.modo === 'portal-fora') return exigePortal();
    if (!eventos || !eventos.length) return Promise.resolve();
    return ler(CHAVES.historico, []).then(function (lista) {
      var agora = new Date().toISOString();
      eventos.forEach(function (ev) {
        ev.quando = agora;
        ev.quem = GI.usuario();
        lista.unshift(ev);
      });
      return gravar(CHAVES.historico, lista.slice(0, 500));   // teto: o storage é finito
    });
  };

  /* --- tradução entre o formato do portal e o das telas -------------------
     O banco fala `rotulo`/`recorrencia_padrao`/`valor_centavos`; as telas
     falam `nome`/`recorrenciaPadrao`/`valor`. Traduzir num lugar só evita
     espalhar `campo.rotulo || campo.nome` por três arquivos. */

  var TIPO_DO_PORTAL = { valor: 'valor', numero: 'numero', texto: 'texto', selecao: 'selecao', checkbox: 'simnao' };
  var TIPO_PARA_PORTAL = { valor: 'valor', numero: 'numero', texto: 'texto', selecao: 'selecao', simnao: 'checkbox' };

  function paraCamposTela(lista) {
    return (lista || []).map(function (c) {
      return {
        id: c.id,
        nome: c.rotulo,
        tipo: TIPO_DO_PORTAL[c.tipo] || c.tipo,
        opcoes: c.opcoes || [],
        recorrenciaPadrao: c.recorrencia_padrao,
        ordem: c.ordem,
        ativo: c.ativo !== false,
        emUso: c.em_uso || 0
      };
    });
  }
  GI.tipoParaPortal = function (t) { return TIPO_PARA_PORTAL[t] || t; };

  /* O banco fala INSERT/UPDATE/DELETE e `valor_anterior`; a tela fala
     preencheu/alterou/removeu e `de`. */
  var ACAO = { INSERT: 'preencheu', UPDATE: 'alterou', DELETE: 'removeu' };

  function paraEventoTela(e) {
    return {
      quando: e.quando,
      quem: e.quem,
      codigo: e.codigo,
      campo: e.rotulo,
      acao: ACAO[e.operacao] || String(e.operacao || '').toLowerCase(),
      de: e.valor_anterior == null ? '' : String(e.valor_anterior),
      para: e.valor_novo == null ? '' : String(e.valor_novo)
    };
  }

  /* --- campos, no modo portal (uma linha por campo) ---------------------- */

  GI.campoCriar = function (campo) {
    return chamar('/campos', { corpo: {
      rotulo: campo.nome,
      tipo: GI.tipoParaPortal(campo.tipo),
      opcoes: campo.opcoes || [],
      recorrenciaPadrao: campo.recorrenciaPadrao || 'mes'
    } }).then(function (r) { return paraCamposTela(r.campos); });
  };

  GI.campoAtualizar = function (campo) {
    return chamar('/campos/' + campo.id, { corpo: {
      rotulo: campo.nome,
      tipo: GI.tipoParaPortal(campo.tipo),
      opcoes: campo.opcoes || [],
      recorrenciaPadrao: campo.recorrenciaPadrao || 'mes',
      ordem: campo.ordem || 100,
      ativo: campo.ativo !== false
    } }).then(function (r) { return paraCamposTela(r.campos); });
  };

  /* Recoloca os campos que a operação usa, sobrescrevendo quem tem o mesmo
     rótulo. Só existe no modo portal: no modo local não há o que recolocar. */
  GI.camposPadrao = function () {
    if (GI.modo !== 'portal') {
      return Promise.reject(new Error('Sem portal configurado — não há banco onde recolocar os campos.'));
    }
    return chamar('/campos/padrao', { corpo: {} }).then(function (r) {
      return { criados: r.criados, atualizados: r.atualizados, total: r.total,
               campos: paraCamposTela(r.campos) };
    });
  };

  GI.campoApagar = function (id) {
    return chamar('/campos/' + id + '/apagar', { corpo: {} })
      .then(function (r) { return paraCamposTela(r.campos); });
  };

  /* --- lançamentos de um imóvel, no modo portal ------------------------- */

  GI.valoresDoImovel = function (codigo) {
    if (GI.modo !== 'portal') return GI.valores().then(function (m) { return m[codigo] || {}; });
    return chamar('/valores/' + encodeURIComponent(codigo)).then(function (r) {
      var saida = {};
      (r.valores || []).forEach(function (v) {
        if (v.valor_centavos == null && v.valor_num == null &&
            (v.valor_texto == null || v.valor_texto === '') && !v.observacao) return;
        saida[v.campo_id] = {
          valor: v.valor_centavos != null ? (Number(v.valor_centavos) / 100)
               : v.valor_num != null ? Number(v.valor_num)
               : (v.valor_texto || ''),
          obs: v.observacao || '',
          recorrencia: v.recorrencia || undefined
        };
      });
      return saida;
    });
  };

  GI.salvarValoresDoImovel = function (codigo, lancados, campos) {
    if (GI.modo !== 'portal') {
      return GI.valores().then(function (mapa) {
        if (Object.keys(lancados).length) mapa[codigo] = lancados;
        else delete mapa[codigo];
        return GI.salvarValores(mapa);
      });
    }
    /* Manda TODOS os campos ativos, inclusive os vazios: campo vazio é como o
       portal apaga um lançamento. Omitir os vazios deixaria valor velho vivo. */
    var entradas = (campos || []).filter(function (c) { return c.ativo !== false; }).map(function (c) {
      var l = lancados[c.id];
      var e = { campo_id: c.id, valor_centavos: null, valor_num: null,
                valor_texto: null, recorrencia: null, observacao: null };
      if (!l) return e;
      e.observacao = l.obs || null;
      if (c.tipo === 'valor') {
        if (l.valor !== '' && l.valor !== null && l.valor !== undefined) {
          e.valor_centavos = Math.round(Number(l.valor) * 100);
        }
        e.recorrencia = l.recorrencia || c.recorrenciaPadrao || 'unico';
      } else if (c.tipo === 'numero') {
        if (l.valor !== '' && l.valor !== null && l.valor !== undefined) e.valor_num = Number(l.valor);
      } else {
        if (l.valor !== '' && l.valor !== null && l.valor !== undefined) e.valor_texto = String(l.valor);
      }
      return e;
    });
    return chamar('/valores/' + encodeURIComponent(codigo), { corpo: { entradas: entradas } });
  };

  /* Zera TUDO o que foi lançado no imóvel — inclusive o que está em campo
     desativado, que o salvamento normal nem enxerga. Deixar um lançamento
     órfão vivo no banco é pior aqui: a tela diria "pendente" e a IA continuaria
     respondendo a taxa antiga. */
  GI.apagarValoresDoImovel = function (codigo, campos) {
    var todos = (campos || []).map(function (c) {
      var copia = {};
      for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) copia[k] = c[k]; }
      copia.ativo = true;
      return copia;
    });
    return GI.salvarValoresDoImovel(codigo, {}, todos);
  };

  /* A tela Consultas saiu na 0.3.0. O registro de buscas deixou de ter leitor, então deixou
     de ser gravado — dado que ninguém lê é só consumo do orçamento do storage. */
  GI.registrarConsulta = function () { return Promise.resolve(); };

  GI.limpar = function (qual) {
    var chave = CHAVES[qual];
    if (!chave) return Promise.resolve();
    return gravar(chave, qual === 'valores' ? {} : []);
  };

  /* ---------------------------------------------------------------- catálogo
     omni.data.request aceita o NOME do recurso com query string (blueprint
     Sails). Se o where for recusado, cai para leitura paginada e filtro local:
     a tela continua funcionando, só mais devagar. */

  GI.estrategiaCatalogo = '';

  function pedir(recurso) {
    return omni.data.request(recurso, 'GET');
  }

  function montarWhere(filtros) {
    var marca = GI.cfg('marca', '');
    var where = {};
    if (marca) where.brand = marca;
    if (filtros.termo) {
      where.or = [
        { name: { contains: filtros.termo } },
        { internalcode: { contains: filtros.termo } },
        { category: { contains: filtros.termo } }
      ];
      if (marca) {
        where.or.forEach(function (o) { o.brand = marca; });
        delete where.brand;
      }
    }
    if (filtros.bairro) where.category = { contains: filtros.bairro };
    return where;
  }

  var cacheTudo = null;

  function carregarTudoLocal() {
    if (cacheTudo) return Promise.resolve(cacheTudo);
    var acumulado = [];
    function pagina(skip) {
      return pedir('products?limit=500&skip=' + skip).then(function (lote) {
        var arr = GI.lista(lote);
        acumulado = acumulado.concat(arr);
        if (arr.length === 500 && acumulado.length < 12000) return pagina(skip + 500);
        cacheTudo = acumulado;
        return acumulado;
      });
    }
    return pagina(0);
  }

  GI.lista = function (resposta) {
    if (Array.isArray(resposta)) return resposta;
    if (!resposta) return [];
    if (Array.isArray(resposta.products)) return resposta.products;
    if (Array.isArray(resposta.data)) return resposta.data;
    if (Array.isArray(resposta.items)) return resposta.items;
    return [];
  };

  function casaLocal(p, filtros) {
    var marca = GI.cfg('marca', '');
    if (marca && String(p.brand || '') !== marca) return false;
    if (filtros.bairro && String(p.category || '').toLowerCase().indexOf(String(filtros.bairro).toLowerCase()) === -1) return false;
    if (filtros.termo) {
      var t = String(filtros.termo).toLowerCase();
      var alvo = (String(p.name || '') + ' ' + String(p.internalcode || '') + ' ' + String(p.category || '')).toLowerCase();
      if (alvo.indexOf(t) === -1) return false;
    }
    return true;
  }

  GI.buscarImoveis = function (filtros) {
    filtros = filtros || {};
    var porPagina = filtros.porPagina || 25;
    var skip = ((filtros.pagina || 1) - 1) * porPagina;
    var inicio = Date.now();

    var recurso = 'products?where=' + encodeURIComponent(JSON.stringify(montarWhere(filtros))) +
                  '&limit=' + porPagina + '&skip=' + skip + '&sort=' + encodeURIComponent('id ASC');

    return pedir(recurso).then(function (r) {
      var arr = GI.lista(r);
      GI.estrategiaCatalogo = 'consulta filtrada no servidor';
      return { itens: arr, total: null, ms: Date.now() - inicio };
    }).catch(function () {
      return carregarTudoLocal().then(function (todos) {
        GI.estrategiaCatalogo = 'catálogo lido inteiro e filtrado na tela';
        var filtrados = todos.filter(function (p) { return casaLocal(p, filtros); });
        return {
          itens: filtrados.slice(skip, skip + porPagina),
          total: filtrados.length,
          ms: Date.now() - inicio
        };
      });
    });
  };

  GI.buscarImovel = function (codigo) {
    var recurso = 'products?where=' + encodeURIComponent(JSON.stringify({ internalcode: String(codigo) })) + '&limit=1';
    return pedir(recurso).then(function (r) {
      var arr = GI.lista(r);
      if (arr.length) return arr[0];
      throw new Error('vazio');
    }).catch(function () {
      return carregarTudoLocal().then(function (todos) {
        var achado = todos.filter(function (p) { return String(p.internalcode) === String(codigo); })[0];
        if (!achado) throw new Error('imóvel ' + codigo + ' não está no catálogo');
        return achado;
      });
    });
  };

  /* ------------------------------------------------------------- formatação */

  GI.codigoCurto = function (internalcode) {
    var pre = String(GI.cfg('prefixoCodigo', ''));
    var cod = String(internalcode || '');
    return (pre && cod.indexOf(pre) === 0) ? cod.slice(pre.length) : cod;
  };

  GI.partesCategoria = function (categoria) {
    var p = String(categoria || '').split('>').map(function (x) { return x.trim(); });
    return { tipo: p[0] || '', cidade: p[1] || '', bairro: p[2] || '' };
  };

  GI.dinheiro = function (centavos) {
    var n = Number(centavos || 0) / 100;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  GI.dataHora = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  GI.escapar = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ------------------------------------------------- campos e valor legível */

  GI.TIPOS = [
    { id: 'valor',   nome: 'Valor (R$)',      ajuda: 'aceita recorrência: /mês, /ano…' },
    { id: 'numero',  nome: 'Número',          ajuda: 'quantidade, metragem' },
    { id: 'texto',   nome: 'Texto livre',     ajuda: 'observação da administração' },
    { id: 'selecao', nome: 'Seleção (lista)', ajuda: 'exige ao menos uma opção' },
    { id: 'simnao',  nome: 'Sim / Não',       ajuda: '' }
  ];

  GI.RECORRENCIAS = [
    { id: 'unico',  nome: 'único',      sufixo: '' },
    { id: 'dia',    nome: 'por dia',    sufixo: '/dia' },
    { id: 'semana', nome: 'por semana', sufixo: '/semana' },
    { id: 'mes',    nome: 'por mês',    sufixo: '/mês' },
    { id: 'ano',    nome: 'por ano',    sufixo: '/ano' }
  ];

  GI.nomeTipo = function (id) {
    var t = GI.TIPOS.filter(function (x) { return x.id === id; })[0];
    return t ? t.nome : id;
  };
  GI.sufixoRecorrencia = function (id) {
    var r = GI.RECORRENCIAS.filter(function (x) { return x.id === id; })[0];
    return r ? r.sufixo : '';
  };

  /* Mesma regra do portal: 0 é "isento"; vazio com observação é
     "consultar com o consultor"; vazio sem observação não existe. */
  GI.valorLegivel = function (campo, lancamento) {
    if (!campo || !lancamento) return '';
    var obs = String(lancamento.obs || '').trim();
    if (campo.tipo === 'valor') {
      if (lancamento.valor === '' || lancamento.valor === null || lancamento.valor === undefined) {
        return obs ? obs : 'consultar com o consultor';
      }
      var n = Number(lancamento.valor);
      if (n === 0) return 'isento' + (obs ? ' — ' + obs : '');
      return GI.dinheiro(Math.round(n * 100)) + GI.sufixoRecorrencia(lancamento.recorrencia) + (obs ? ' — ' + obs : '');
    }
    var bruto = lancamento.valor;
    if (bruto === '' || bruto === null || bruto === undefined) return obs || '';
    if (campo.tipo === 'simnao') bruto = (String(bruto) === 'sim') ? 'sim' : 'não';
    return String(bruto) + (obs ? ' — ' + obs : '');
  };

  function numeroReais(texto) {
    var v = String(texto).trim().replace(/^R\$\s*/, '');
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,12}(?:[.,]\d{1,2})?)$/.test(v)) return NaN;
    return Number(v.indexOf(',') >= 0 ? v.replace(/\./g, '').replace(',', '.') : v);
  }
  GI.numeroValido = function (v) { return v === '' || v == null || Number.isFinite(numeroReais(v)); };
  GI.paraNumero = function (v) { return v === '' || v == null ? '' : numeroReais(v); };
  GI.valorReais = function (v) {
    var n = numeroReais(v), centavos = Math.round(n * 100);
    if (!Number.isSafeInteger(centavos) || n < 0) throw new Error('Informe o valor em reais, por exemplo 1.500,00.');
    return centavos;
  };

  /* ------------------------------------------------------------------ modal

     `omni.ui.confirm` NÃO existe no contêiner da extensão: a chamada estourava
     TypeError de forma síncrona, antes de virar promise, então o `.catch` do
     código nem rodava — o clique em "apagar" simplesmente não fazia nada. Daí
     o diálogo ser nosso, no formato dos modais da plataforma.

     Ele é popup: a tela continua atrás, desfocada. O que não dá para usar é
     `position: fixed` — a altura do contêiner acompanha o conteúdo
     (`omni.ui.resize`) e quem rola é a página da instância, que é de outra
     origem: o "viewport" daqui de dentro é o documento inteiro, então a caixa
     ficaria colada no topo, longe de quem rolou a lista.

     Daí `posicionar`: um IntersectionObserver com `root: null` enxerga a
     janela de verdade, mesmo através do iframe, e diz qual faixa do documento
     está aparecendo. A caixa é centrada NESSA faixa. Sem o observador (ou se
     ele vier zerado), fica no topo — que é o pior caso, não uma quebra. */

  var modaisAbertos = 0;

  function posicionar(fundo, caixa) {
    if (!global.IntersectionObserver) return null;

    var limites = [];
    for (var i = 0; i <= 50; i++) limites.push(i / 50);

    var obs = new IntersectionObserver(function (entradas) {
      var e = entradas[entradas.length - 1];
      if (!e || !e.intersectionRect || !e.intersectionRect.height) return;
      var visTopo = e.intersectionRect.top - e.boundingClientRect.top;  // px do documento
      var visAltura = e.intersectionRect.height;
      var sobra = visAltura - caixa.offsetHeight;
      var topo = visTopo + (sobra > 0 ? sobra / 2 : 16);

      /* Teto: a caixa não pode empurrar o fim do documento, senão o contêiner
         cresce, a faixa visível muda, e ele cresce de novo — oscilação. */
      var maxTopo = fundo.offsetHeight - caixa.offsetHeight - 8;
      if (maxTopo > 8) topo = Math.min(topo, maxTopo);

      caixa.style.top = Math.max(8, topo) + 'px';
    }, { threshold: limites });

    obs.observe(fundo);
    return obs;
  }

  GI.modal = function (op) {
    op = op || {};
    return new Promise(function (resolve) {
      var fundo = document.createElement('div');
      fundo.className = op.alvo ? 'gi-form-inline' : 'gi-modal-fundo';
      fundo.innerHTML =
        '<div class="gi-modal"' + (op.alvo ? '' : ' role="dialog" aria-modal="true"') +
            (op.largura ? ' style="max-width:' + Number(op.largura) + 'px"' : '') + '>' +
          '<div class="gi-modal-topo">' +
            '<h2>' + GI.escapar(op.titulo || '') + '</h2>' +
            '<button type="button" class="gi-modal-x" aria-label="Fechar">&times;</button>' +
          '</div>' +
          '<div class="gi-modal-corpo"></div>' +
          '<div class="gi-modal-rodape">' +
            '<span class="gi-modal-recado gi-pequeno"></span>' +
            '<button type="button" class="btn btn-texto" data-cancelar>' +
              GI.escapar(op.rotuloCancelar || 'Cancelar') + '</button>' +
            '<button type="button" class="btn ' + (op.perigo ? 'btn-perigo-forte' : 'btn-sucesso') +
              '" data-ok>' + GI.escapar(op.rotuloOk || 'Atualizar') + '</button>' +
          '</div>' +
        '</div>';

      var caixa = fundo.querySelector('.gi-modal-corpo');
      if (typeof op.corpo === 'string') caixa.innerHTML = op.corpo;
      else if (op.corpo) caixa.appendChild(op.corpo);

      var recado = fundo.querySelector('.gi-modal-recado');
      var botaoOk = fundo.querySelector('[data-ok]');

      var observador = null, confirmando = false, encerrado = false;

      function fechar(valor, forcar) {
        if (encerrado) return;
        if (!forcar && confirmando && valor === null && !op.aoFechar) return;
        if (!forcar && valor === null && op.aoFechar && op.aoFechar(caixa) === false) return;
        encerrado = true;
        document.removeEventListener('keydown', naTecla);
        if (observador) observador.disconnect();
        if (fundo.parentNode) fundo.parentNode.removeChild(fundo);
        if (!op.alvo) modaisAbertos = Math.max(0, modaisAbertos - 1);
        if (!modaisAbertos) document.body.classList.remove('gi-com-modal');
        GI.ajustarAltura();
        resolve(valor);
      }
      function naTecla(e) { if (e.key === 'Escape') fechar(null); }

      function confirmar() {
        if (!op.aoConfirmar) { fechar(true); return; }
        if (confirmando) return;
        confirmando = true;
        botaoOk.disabled = true;
        recado.textContent = '';
        Promise.resolve()
          .then(function () { return op.aoConfirmar(caixa); })
          .then(function (r) { confirmando = false; fechar(r === undefined ? true : r); })
          .catch(function (e) {
            confirmando = false;
            botaoOk.disabled = false;
            recado.className = 'gi-modal-recado gi-pequeno gi-modal-recado-erro';
            recado.textContent = GI.mensagemErro(e);
            GI.recado(GI.mensagemErro(e), 'erro', fundo.querySelector('[data-recado-form]'));
            GI.ajustarAltura();
          });
      }

      fundo.querySelector('[data-cancelar]').addEventListener('click', function () { fechar(null); });
      fundo.querySelector('.gi-modal-x').addEventListener('click', function () { fechar(null); });
      botaoOk.addEventListener('click', confirmar);
      document.addEventListener('keydown', naTecla);

      (op.alvo || document.body).appendChild(fundo);
      if (!op.alvo) { document.body.classList.add('gi-com-modal'); modaisAbertos++; }
      if (op.aoControlar) op.aoControlar(function (forcar) { fechar(null, forcar); });

      if (op.aoAbrir) op.aoAbrir(caixa);

      /* Posicionar DEPOIS do conteúdo: a altura da caixa é o que centraliza. */
      if (!op.alvo) observador = posicionar(fundo, fundo.querySelector('.gi-modal'));
      GI.ajustarAltura();

      var primeiro = caixa.querySelector('input, select, textarea');
      if (primeiro) { try { primeiro.focus({ preventScroll: true }); } catch (e) { /* sem foco, tudo bem */ } }
    });
  };

  /** Sim/não. Resolve `true` só no botão de confirmar. */
  GI.confirmar = function (op) {
    op = op || {};
    return GI.modal({
      titulo: op.titulo || 'Confirmar',
      corpo: '<p class="gi-modal-texto">' + GI.escapar(op.mensagem || '') + '</p>' +
        (op.detalhe ? '<p class="gi-modal-texto gi-mudo gi-pequeno">' + GI.escapar(op.detalhe) + '</p>' : ''),
      rotuloOk: op.rotuloOk || 'Confirmar',
      perigo: op.perigo,
      largura: 480
    }).then(function (r) { return r === true; });
  };

  /** Uma linha de texto. Resolve o texto, ou `null` se cancelaram. */
  GI.pedirTexto = function (op) {
    op = op || {};
    var id = 'gi-pedir-' + Date.now();
    return GI.modal({
      titulo: op.titulo || '',
      corpo: '<div class="gi-campo-caixa"><label for="' + id + '">' + GI.escapar(op.rotulo || '') + '</label>' +
        '<input id="' + id + '" type="text" value="' + GI.escapar(op.valor || '') + '"></div>',
      rotuloOk: op.rotuloOk || 'Salvar',
      largura: 480,
      aoConfirmar: function (caixa) {
        var v = String(caixa.querySelector('input').value || '').trim();
        if (!v) throw new Error('Não pode ficar vazio.');
        return v;
      }
    }).then(function (r) { return (typeof r === 'string') ? r : null; });
  };

  /* -------------------------------------------------------------- navegação */

  function telaDeGestao(id) { return ['gi-locados', 'gi-chamados', 'gi-prestadores'].indexOf(id) >= 0; }
  GI.gestor = function () {
    var c = GI.ctx(), u = c && c.user;
    return !!(u && (u.type === 0 || GI.GESTORES_EXTRA.indexOf(Number(u.id)) !== -1));
  };
  GI.abrirTela = function (contributionId) {
    if (telaDeGestao(contributionId) && !GI.gestor()) { GI.aviso('Esta tela é exclusiva do administrador.', 'info'); return; }
    try {
      var r = omni.ui.openContribution(contributionId);
      if (r && r.catch) r.catch(function () { GI.aviso('Abra pelo menu Gerenciamento de Imóveis.', 'info'); });
    } catch (e) { GI.aviso('Abra pelo menu Gerenciamento de Imóveis.', 'info'); }
  };

  /* A tela precisa dizer onde está gravando. Uma pessoa preenchendo 40 imóveis
     num storage que ninguém lê perde o trabalho inteiro em silêncio. */
  GI.mostrarModo = function () {
    var alvo = document.getElementById('gi-modo');
    if (!alvo) return;
    if (GI.modo === 'portal') {
      alvo.innerHTML = '🟢 <strong>Conectado ao portal</strong> — o que você grava aqui é o que a ' +
        'assistente de IA responde ao cliente.';
    } else if (GI.modo === 'portal-fora') {
      alvo.innerHTML = '🔴 <strong>O portal não respondeu</strong> (' + GI.escapar(GI.portalErro) + '). ' +
        'Nada será gravado até a conexão voltar — avise o suporte antes de continuar.';
    } else {
      alvo.innerHTML = '🟡 <strong>Modo local</strong> — sem portal configurado, o que você preencher fica ' +
        'só no seu navegador e <strong>não chega à IA</strong>. Para valer, preencha a URL e o token do ' +
        'portal na instalação da extensão.';
    }
    GI.ajustarAltura();
  };

  GI.cabecalho = function (ativo) {
    var telas = [
      { id: 'gi-imoveis',   nome: 'Imóveis' },
      { id: 'gi-locados',   nome: 'Locados' },
      { id: 'gi-chamados',  nome: 'Chamados' },
      { id: 'gi-prestadores', nome: 'Prestadores' },
      { id: 'gi-campos',    nome: 'Campos' },
      { id: 'gi-historico', nome: 'Histórico' },
      { id: 'gi-config', nome: 'Configurações' }
    ];
    return '<nav class="gi-nav">' + telas.filter(function (t) { return !telaDeGestao(t.id) || GI.gestor(); }).map(function (t) {
      return t.id === ativo
        ? '<span class="gi-nav-item gi-nav-ativo">' + t.nome + '</span>'
        : '<button type="button" class="gi-nav-item" data-tela="' + t.id + '">' + t.nome + '</button>';
    }).join('') + '</nav>';
  };

  GI.ligarNavegacao = function (raiz) {
    var nos = (raiz || document).querySelectorAll('[data-tela]');
    Array.prototype.forEach.call(nos, function (b) {
      b.addEventListener('click', function () { GI.abrirTela(b.getAttribute('data-tela')); });
    });
  };

  global.GI = GI;
})(window);
