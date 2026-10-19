/* Cockpit do atendimento. O imóvel é o foco; o contato identifica as locações. */
(function () {
  'use strict';
  var e = GI.escapar, $ = function (id) { return document.getElementById(id); };
  window.onerror = function () { falhaPainel(); return true; };
  window.addEventListener('unhandledrejection', falhaPainel);
  var queryDemo = new URLSearchParams(location.search).get('demonstracao') === '1';
  function demo() { return queryDemo || GI.cfg('modoDemonstracao', false) === true; }
  function escrita() { return GI.cfg('cockpitAbreChamado', true) === true; }
  var geracao = 0, temporizador, chat = null, contato = null, locacoes = [], chamados = [], selecionada = 0;
  var aba = 'chamados', formulario = null, fotos = [], fotosLidas = false, fotosAviso = '', confirmado = null, gravando = false, criacaoIncerta = null;
  var pessoaAberta = false, timerPessoa, buscaPessoa = 0;
  var administrador = false, residencia = null, timerResidencia, buscaResidencia = 0;
  var cache = new Map(), requisicoes = [], esperarAte = 0;
  var transporte = GI.chamarPortal;
  var filtroImovel = '', novoSelecionado = false, filtro = 'todos', busca = '', limiteLista = 10, atualizadoEm = 0, snapshots = [], fila = Promise.resolve(), versaoDados = 0;
  var chaveSnapshot = GI.CHAVE_SNAPSHOTS, filasConhecidas = [], contatosComLocacao = {}, inicioTimer, atualizarTimer, ultimaAtualizacao = 0;
  var editando = null, limiteFotos = 12, previasFotos = Object.create(null), ampliacaoOrigem = null, leituraFotos = null;
  var carregadoEm = 0, timerEscrita, relendoEscrita = false, ultimaEscritaTentada = '', ultimoToque = 0, escritasEmCurso = 0;
  GI.cockpitCarregadoEm = function () { return carregadoEm; };
  function aplicarLeitura(em) {
    carregadoEm = em;
    if (GI.pendenciaExterna <= carregadoEm) GI.pendenciaExterna = 0;
  }
  function dadosObtidosEm(c, inicio) {
    // Reutilizar uma resposta não muda a idade dos dados que ela trouxe.
    ['/locacoes', '/chamados'].forEach(function (sufixo) {
      var entrada = cache.get('/contatos/' + GI.contatoEfetivo(c) + sufixo);
      if (entrada && entrada.obtidoEm) inicio = Math.min(inicio, entrada.obtidoEm);
    });
    return inicio;
  }
  function pararVerificacao() { clearInterval(timerEscrita); timerEscrita = null; }
  function contatoCarregado() { return !destruido && !demo() && GI.modo === 'portal' && contato && chat && carregadoEm; }
  function naoOculto(el) {
    // Recolher um cartão não descarta rascunhos nem encerra operações.
    return !el.closest('[hidden]');
  }
  function painelOcioso() {
    if (!contatoCarregado() || gravando || criacaoIncerta || escritasEmCurso || residencia || editando || pessoaAberta) return false;
    // Botões só ocupam por operação explícita (aria-busy), nunca por permissão estática.
    if (Array.from(document.querySelectorAll('#cp-conteudo button:disabled[aria-busy="true"], [data-edicao] select:disabled, [data-cancelar-caixa], [data-aviso-form]')).some(naoOculto)) return false;
    var foco = document.activeElement;
    if (foco && naoOculto(foco) && foco.closest('[data-chamado]') && foco.matches('input, select, textarea')) return false;
    return !Array.from(document.querySelectorAll('[data-complemento] textarea')).some(function (campo) { return naoOculto(campo) && campo.value; });
  }
  function iniciarVerificacao() {
    if (timerEscrita || !contatoCarregado()) return;
    timerEscrita = setInterval(function () {
      if (document.visibilityState === 'visible' && contatoCarregado()) verificarEscritaExterna();
    }, 4000);
  }
  function verificarEscritaExterna() {
    if (relendoEscrita || !painelOcioso()) return;
    var g = geracao, c = chat, versao = versaoDados;
    relendoEscrita = true;
    Promise.resolve().then(function () { return omni.storage.get(GI.CHAVE_ESCRITA); }).catch(function () { return null; }).then(function (v) {
      var externaEm = v && v.por !== GI.instanciaId ? Number(v.em) || 0 : 0;
      var pendenteEm = Math.max(externaEm, GI.pendenciaExterna);
      if (g !== geracao || !painelOcioso() || !(pendenteEm > carregadoEm)) return;
      var chave = String(pendenteEm);
      if (chave === ultimaEscritaTentada) return;
      return atual(g, c).then(function (valido) {
        if (!valido || !painelOcioso()) return;
        // Falha também consome esta marca; só outra escrita ou o botão ⟳ tenta de novo.
        var anterior = ultimaEscritaTentada;
        ultimaEscritaTentada = chave;
        var rota = '/contatos/' + GI.contatoEfetivo(c);
        cache.delete(rota + '/chamados'); cache.delete(rota + '/locacoes');
        var inicioLeitura = Date.now();
        return Promise.all([GI.chamadosPorContato(GI.contatoEfetivo(c)), GI.chamarPortal(rota + '/locacoes')]).then(function (respostas) {
          return atual(g, c).then(function (aindaAtual) {
            if (!aindaAtual || versao !== versaoDados || !painelOcioso()) {
              if (g === geracao) ultimaEscritaTentada = anterior;
              return;
            }
            var imovelId = locacao() && locacao().id;
            var cartoes = {};
            document.querySelectorAll('[data-os-id]').forEach(function (card) { cartoes[card.dataset.osId] = card.open; });
            chamados = linhas(respostas[0]); locacoes = linhas(respostas[1]);
            var indice = locacoes.findIndex(function (l) { return String(l.id) === String(imovelId); });
            selecionada = indice;
            validarImovelNovo();
            contatosComLocacao[GI.contatoEfetivo(c)] = locacoes.length > 0;
            aplicarLeitura(dadosObtidosEm(c, inicioLeitura)); atualizadoEm = Date.now();
            cabecalho();
            // Novo e a confirmação conservam o próprio DOM, foco, fotos e rascunho.
            if (aba === 'novo') atualizarEscolhaNovo();
            else {
              render();
              document.querySelectorAll('[data-os-id]').forEach(function (card) {
                if (Object.hasOwn(cartoes, card.dataset.osId)) card.open = cartoes[card.dataset.osId];
              });
            }
            return guardarSnapshot(c);
          });
        });
      });
    }).catch(function () { /* Releitura silenciosa: mantém o dado e o rascunho atuais. */ }).then(function () {
      if (g === geracao) relendoEscrita = false;
    });
  }
  window.addEventListener('focus', verificarEscritaExterna);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') verificarEscritaExterna(); });
  $('gi-cockpit').addEventListener('pointerdown', function () {
    var agora = Date.now();
    if (agora - ultimoToque < 1000) return;
    ultimoToque = agora; verificarEscritaExterna();
  });
  async function lerSnapshot(c) {
    try {
      var r = await omni.storage.get(chaveSnapshot);
      snapshots = r && r.origem === GI.cfg('portalUrl', '') && Array.isArray(r.rows) ? r.rows : [];
      return GI.cockpit.ler(snapshots, GI.contatoEfetivo(c), Date.now());
    } catch (_) { snapshots = []; return null; }
  }
  async function guardarSnapshot(c) {
    if (demo()) return;
    snapshots = GI.cockpit.guardar(snapshots, GI.contatoEfetivo(c), { locacoes: locacoes, chamados: chamados }, carregadoEm);
    try { await omni.storage.set(chaveSnapshot, { origem: GI.cfg('portalUrl', ''), rows: snapshots }); } catch (_) { /* Cache opcional. */ }
  }

  // A barreira é instalada antes de GI.pronto (inclusive /info e usuário sem nome).
  var fetchOriginal = window.fetch;
  if (fetchOriginal) window.fetch = function () {
    if (demo()) return Promise.reject(new Error('Demonstração: rede bloqueada.'));
    return fetchOriginal.apply(window, arguments);
  };
  if (window.omni && omni.http && typeof omni.http.request === 'function') {
    var httpOriginal = omni.http.request;
    omni.http.request = function () {
      if (demo()) return Promise.reject(new Error('Demonstração: HTTP bloqueado.'));
      return httpOriginal.apply(omni.http, arguments);
    };
  }
  var usuarios = GI.usuarios;
  GI.usuarios = function () { return demo() ? Promise.resolve({}) : usuarios(); };
  function limite() {
    var erro = new Error('Limite de consultas atingido. Aguarde cerca de um minuto e tente novamente.');
    erro.status = 429; return erro;
  }
  GI.chamarPortal = function (rota, op) {
    if (demo()) return Promise.reject(new Error('Demonstração sem rede: use os dados sintéticos da tela.'));
    var post = op && /^(POST|PUT|PATCH|DELETE)$/i.test(op.method || (op.corpo !== undefined ? 'POST' : 'GET'));
    if (post && !/^\/locacoes(?:\/\d+)?$/.test(rota) && !escrita()) return Promise.reject(new Error('Abertura de chamados desligada neste cockpit.'));
    if (post && GI.modo !== 'portal') return Promise.reject(new Error('Manutenção exige o portal conectado.'));
    var agora = Date.now(), anterior = cache.get(rota);
    if (!post && anterior && agora - anterior.em < 60000) {
      return Promise.resolve().then(function () { return omni.storage.get(GI.CHAVE_ESCRITA); }).catch(function () { return null; }).then(function (marca) {
        if (marca && marca.por !== GI.instanciaId && marca.em > anterior.obtidoEm) {
          cache.delete(rota);
          return GI.chamarPortal(rota, op);
        }
        return anterior.promessa;
      });
    }
    requisicoes = requisicoes.filter(function (t) { return agora - t < 60000; });
    if (agora < esperarAte || requisicoes.length >= 30) return Promise.reject(limite());
    requisicoes.push(agora);
    function enviar() { return transporte(rota, op); }
    var operacao;
    if (post) {
      ++escritasEmCurso;
      ++versaoDados;
      snapshots = [];
      // O transporte comum invalida o storage após confirmar a gravação.
      operacao = fila.then(enviar);
      fila = operacao.catch(function () {});
    } else operacao = Promise.resolve().then(enviar);
    var entrada = { em: agora, obtidoEm: agora };
    var promessa = operacao.then(function (r) {
      entrada.obtidoEm = Date.now();
      return r;
    }).catch(function (err) {
      cache.delete(rota);
      if (err.status === 429 || err.code === 'rate_limit' || err.code === 'rate_limited' || /rate.limit/i.test(err.message)) { esperarAte = Date.now() + 60000; throw limite(); }
      throw err;
    });
    entrada.promessa = promessa;
    if (!post) cache.set(rota, entrada);
    else cache.clear();
    if (post) return promessa.then(function (r) { --escritasEmCurso; return r; }, function (err) { --escritasEmCurso; throw err; });
    return promessa;
  };
  GI.definirModo = function () {
    if (demo()) { GI.modo = 'demonstracao'; return Promise.resolve(GI.modo); }
    if (!GI.usaPortal()) { GI.modo = 'local'; return Promise.resolve(GI.modo); }
    return GI.chamarPortal('/info').then(function () { GI.modo = 'portal'; GI.portalErro = ''; return GI.modo; }, function (err) {
      GI.modo = 'portal-fora'; GI.portalErro = GI.mensagemErro(err); return GI.modo;
    });
  };

  // O observer de comum.js também chama este método: ele passa a medir só o wrapper.
  var altura = null, agendado = false, fixo = false, redimensionando = false;
  GI.ajustarAltura = function () {
    if (agendado || fixo || redimensionando) return;
    agendado = true;
    setTimeout(function () {
      agendado = false;
      var h = Math.ceil($('gi-cockpit').getBoundingClientRect().height);
      if (fixo || altura !== null && Math.abs(h - altura) < 2 || !window.omni || !omni.ui) return;
      altura = h;
      redimensionando = true;
      try { Promise.resolve(omni.ui.resize(h)).then(function (r) {
        redimensionando = false;
        if (r && r.applied === false) fixo = true;
        else GI.ajustarAltura(); // Recolhe mudanças ocorridas enquanto o host respondia.
      }).catch(function () { redimensionando = false; }); }
      catch (_) { redimensionando = false; /* O host pode estar desmontando o painel. */ }
    }, 0);
  };
  var observer = new ResizeObserver(GI.ajustarAltura);
  observer.observe($('gi-cockpit'));

  function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function id(v) { var n = numero(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function linhas(r) { return Array.isArray(r) ? r : r && Array.isArray(r.rows) ? r.rows : []; }
  function locacao() { return locacoes[selecionada]; }
  function abertos(c) { return c.status !== 'concluido' && c.status !== 'cancelado'; }
  function lista() { return chamados.filter(function (c) { return !filtroImovel || String(c.locacao_id) === filtroImovel; }); }
  function papel(v) { return valorMapa({ locatario: 'LOCATÁRIO', proprietario: 'PROPRIETÁRIO', fiador: 'FIADOR', outro: 'OUTRO' }, v) || 'CONTATO'; }
  function moeda(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function data(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—'; }
  function instante(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('pt-BR') : '—'; }
  function kv(rotulo, valor) { return '<div class="kv gi-cp-kv" data-kv="' + e(rotulo) + '"><span class="k">' + e(rotulo) + '</span><span class="v">' + e(valor == null || valor === '' ? '—' : valor) + '</span></div>'; }
  function recado(t, tipo) {
    tipo = tipo || 'info';
    GI.recado(t, tipo, $('cp-recado'));
  }
  function falhaPainel() {
    clearTimeout(inicioTimer); ++geracao;
    estado('Algo deu errado no painel. Atualize com ⟳.', true); $('cp-tentar').textContent = 'Tentar de novo';
    $('gi-erro').hidden = false; $('gi-erro').textContent = 'Algo deu errado no painel. Atualize com ⟳.';
    recado('Algo deu errado no painel. Atualize com ⟳.', 'erro');
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest('button') && !ev.target.closest('.gi-recado')) recado('', 'info'); }, true);
  function estado(t, tentar) {
    $('cp-conteudo').innerHTML = '<div class="gi-cartao state"><p id="cp-estado"></p>' + (tentar ? '<button type="button" class="btn" id="cp-tentar">Tentar novamente</button>' : '') + '</div>';
    $('cp-estado').textContent = t;
    $('cp-conteudo').setAttribute('aria-busy', t.indexOf('Carregando') === 0 ? 'true' : 'false');
    if (tentar) $('cp-tentar').onclick = function () { iniciar(true); };
  }
  async function atual(g, c) {
    if (g !== geracao) return false;
    if (demo()) return true;
    var s = await omni.chats.getSelected();
    return g === geracao && !!s && String(s.id) === String(c.id) && String(s.contactId) === String(c.contactId);
  }
  function limpar() {
    fecharPessoa(); $('cp-outra-pessoa').hidden = true; $('cp-vendo-como').hidden = true;
    editando = null; limiteFotos = 12; previasFotos = Object.create(null); ampliacaoOrigem = null; leituraFotos = null;
    pararVerificacao(); carregadoEm = 0; relendoEscrita = false; ultimaEscritaTentada = ''; ultimoToque = 0;
    clearTimeout(timerResidencia); ++buscaResidencia; residencia = null;
    $('cp-vincular-residencia').hidden = true; $('cp-residencia-acoes').hidden = true; $('cp-residencia-aviso').textContent = '';
    chat = contato = null; locacoes = []; chamados = []; selecionada = 0; formulario = confirmado = criacaoIncerta = null;
    fotos = []; fotosLidas = false; fotosAviso = ''; aba = 'chamados'; gravando = false;
    $('cp-abas').hidden = true; $('cp-selecao').hidden = true;
    filtroImovel = ''; novoSelecionado = false; filtro = 'todos'; busca = ''; limiteLista = 10; atualizadoEm = 0; $('cp-idade').textContent = '';
    $('cp-nome').textContent = 'Contato do atendimento'; $('cp-contexto').textContent = ''; $('cp-resumo').textContent = ''; recado('', 'info');
  }
  var pessoasDemo = [{ id: 9900, name: 'Cliente Demonstração', phone: '00000000000', document: '00000000000' }, { id: 9906, name: 'Outra Pessoa Demonstração', phone: '00000000006', document: '00000000000' }];
  function dadosDemo() {
    chat = { id: 8800, contactId: 9900, protocol: 'DEMO-INVALIDO', channel: 'Demonstração', queueId: 0 };
    contato = pessoasDemo.find(function (p) { return p.id === GI.contatoEfetivo(chat); }) || pessoasDemo[0];
    locacoes = [{ id: 9000, imovel_codigo: 'DEMO-001', imovel_titulo: 'Imóvel Demonstração', contrato_numero: 'DEMO-INVALIDO',
      imovel_endereco: 'Endereço fictício, zero', papel_do_contato: 'locatario', contatos: [{ contato_id: 9900, nome: 'Cliente Demonstração', papel: 'locatario', telefone: contato.phone }] }];
    locacoes[0].contatos[0].contato_id = contato.id; locacoes[0].contatos[0].nome = contato.name;
    if (contato.id !== 9900) { locacoes[0].id = 9006; locacoes[0].imovel_titulo = 'Imóvel da Outra Pessoa Demonstração'; }
    chamados = [{ id: 9000, numero: 9000, locacao_id: 9000, titulo: 'Reparo Demonstração', descricao: 'Relato sintético, sem correspondência real.',
      categoria: 'hidraulica', prioridade: 'alta', status: 'orcamento', solicitante: { nome: 'Cliente Demonstração' },
      atendimento: { chat_id: 8800, protocolo: 'DEMO-INVALIDO', canal: 'Demonstração' }, sla: {}, prestador: { nome: 'Prestador Demonstração' }, orcamentos_total: 1 }];
    chamados[0].locacao_id = locacoes[0].id; chamados[0].solicitante = { contato_id: contato.id, nome: contato.name };
  }
  async function iniciar(forcar) {
    if (editando) { solicitarSaidaEdicao(function () { iniciar(forcar); }); return; }
    if (criacaoIncerta) {
      var g = geracao, incerta = criacaoIncerta, selecionado;
      try { selecionado = await omni.chats.getSelected(); }
      catch (_) { if (g === geracao) recado('Não foi possível conferir o atendimento. Tente de novo.', 'erro'); return; }
      if (g !== geracao || incerta !== criacaoIncerta) return;
      if (selecionado && id(selecionado.id) === incerta.chatId && id(selecionado.contactId) === (incerta.chatContactId || incerta.contatoId)) { await conferirCriacaoIncerta(); return; }
      criacaoIncerta = null;
    }
    if (formulario) {
      var chatAnterior = chat, tituloAnterior = formulario && formulario.titulo;
      var rascunhoAnterior = Object.assign({}, formulario), abaAnterior = aba;
      var fotosAnteriores = fotos, fotosJaLidas = fotosLidas && !fotosAviso && (!leituraFotos || leituraFotos.concluida), leituraFotosAnterior = fotosAviso ? null : leituraFotos, avisoFotosAnterior = fotosAviso, previasAnteriores = previasFotos, limiteAnterior = limiteFotos;
      var atualizacao = iniciarInterno(forcar);
      await atualizacao;
      if (chatAnterior && chat && String(chatAnterior.id) === String(chat.id) && String(chatAnterior.contactId) === String(chat.contactId)) {
        formulario = rascunhoAnterior; leituraFotos = leituraFotosAnterior; fotos = fotosAnteriores; fotosLidas = fotosJaLidas; fotosAviso = avisoFotosAnterior; previasFotos = previasAnteriores; limiteFotos = limiteAnterior;
        aba = abaAnterior;
        selecionada = locacoes.findIndex(function (l) { return String(l.id) === String(formulario.locacaoId); });
        novoSelecionado = selecionada >= 0; validarImovelNovo(); cabecalho();
        if (aba === 'novo') render();
      }
      return;
    }
    return iniciarInterno(forcar);
  }
  async function iniciarInterno(forcar) {
    if (forcar) cache.clear();
    var g = ++geracao;
    clearTimeout(inicioTimer); $('gi-erro').hidden = true;
    inicioTimer = setTimeout(function () { if (g === geracao) falhaPainel(); }, 20000);
    limpar(); estado('Carregando contato, imóvel e chamados…');
    if (demo()) { dadosDemo(); atualizadoEm = Date.now(); cabecalho(); render(); clearTimeout(inicioTimer); return; }
    if (GI.modo !== 'portal') {
      clearTimeout(inicioTimer); botaoResidencia();
      estado('O portal não respondeu. Confira a URL e o token em Configurações da extensão ou avise quem cuida da instalação.', true);
      $('cp-tentar').onclick = async function () { cache.delete('/info'); await GI.definirModo(); if (g === geracao) { GI.manutencaoMostrarModo(); iniciar(true); } };
      return;
    }
    try {
      await GI.pessoas.ler();
      var c = await omni.chats.getSelected();
      if (g !== geracao) return;
      if (!c || !GI.contatoEfetivo(c)) { estado(c ? 'Clique em Sem contato cadastrado, no topo da conversa, e escolha Adicionar dados a contato existente.' : 'Nenhum atendimento selecionado. Abra uma conversa para consultar a manutenção.'); return; }
      var permissoes = await omni.session.getPermissions();
      if (!await atual(g, c)) return;
      administrador = !!(permissoes && permissoes.isAdmin === true) || GI.gestor();
      var pessoa = await omni.contacts.get(GI.contatoEfetivo(c));
      if (!await atual(g, c)) return;
      pessoa = pessoa || {}; pessoa.id = GI.contatoEfetivo(c); pessoa.name = GI.nomeContato(pessoa, c); pessoa.phone = GI.textoOuNull(pessoa.phone);
      chat = c; contato = pessoa;
      var snapshot = forcar ? null : await lerSnapshot(c);
      if (!await atual(g, c)) return;
      if (snapshot) {
        locacoes = snapshot.dados.locacoes; chamados = snapshot.dados.chamados; atualizadoEm = snapshot.em; aplicarLeitura(snapshot.em); iniciarVerificacao();
        contatosComLocacao[GI.contatoEfetivo(c)] = locacoes.length > 0; cabecalho(); render(); return;
      }
      var versaoConsulta = versaoDados, inicioLeitura = Date.now();
      var consultaLocacoes = GI.chamarPortal('/contatos/' + GI.contatoEfetivo(c) + '/locacoes');
      // Sem histórico deste contato, conhecer a locação primeiro evita gastar cota sem imóvel.
      var consultaChamados = contatosComLocacao[GI.contatoEfetivo(c)] === true ? GI.chamadosPorContato(GI.contatoEfetivo(c)) : consultaLocacoes.then(function (lr) {
        return linhas(lr).length ? GI.chamadosPorContato(GI.contatoEfetivo(c)) : { rows: [] };
      });
      var respostas = await Promise.all([consultaLocacoes, consultaChamados]);
      var lr = respostas[0], cr = respostas[1];
      if (!await atual(g, c)) return;
      contatosComLocacao[GI.contatoEfetivo(c)] = linhas(lr).length > 0;
      if (versaoConsulta !== versaoDados) return; // Uma gravação posterior vence a leitura que já estava em voo.
      chat = c; contato = pessoa; locacoes = linhas(lr); chamados = linhas(cr); aplicarLeitura(dadosObtidosEm(c, inicioLeitura)); atualizadoEm = Date.now(); iniciarVerificacao();
      cabecalho();
      if (!snapshot || aba === 'chamados') render();
      await guardarSnapshot(c);
    } catch (err) { if (g === geracao) { if (atualizadoEm) recado('Não foi possível atualizar. Exibindo a última consulta.', 'erro'); else { estado(GI.mensagemErro(err), true); recado(GI.mensagemErro(err), 'erro'); } } }
    finally { if (g === geracao) clearTimeout(inicioTimer); }
  }
  function cabecalho() {
    var l = locacao(), rows = lista();
    $('gi-modo').hidden = GI.modo === 'portal' && !demo();
    $('cp-nome').textContent = contato.name || 'Contato do atendimento';
    var documento = /^\*{3}\.\d{3}\.\d{3}-\*{2}$/.test(contato.document || '') ? contato.document : GI.mascaraDocumento(contato.document);
    var tipoDocumento = String(contato.document || '').replace(/\D/g, '').length === 14 ? 'CNPJ ' : documento === '—' ? '' : 'CPF ';
    $('cp-contexto').innerHTML = '<span class="panel__tax-id">' + e(tipoDocumento + documento) + '</span><span class="pill pill--triagem">' + e(papel(l && l.papel_do_contato)) + '</span>';

    var totais = GI.cockpit.resumo(rows), concluidos = rows.filter(function (c) { return c.status === 'concluido'; }).length;
    var rotulos = { abertos: totais.abertos + ' abertos', concluidos: concluidos + (concluidos === 1 ? ' concluído' : ' concluídos') };
    rotulos.atrasados = totais.atrasados + ' atrasados'; rotulos.aguardando = totais.aguardando + ' aguardando proprietário'; rotulos.emergencias = totais.emergencias + ' emergências';
    $('cp-resumo').innerHTML = Object.keys(rotulos).filter(function (k) { return rows.length > 5 || k === 'abertos' || k === 'concluidos'; }).map(function (k) { return '<button type="button" data-resumo="' + k + '" aria-pressed="' + (filtro === k) + '">' + rotulos[k] + '</button>'; }).join(' · ');
    $('cp-idade').textContent = 'atualizado às ' + new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('[data-resumo]').forEach(function (b) { b.onclick = function () { if (editando) { solicitarSaidaEdicao(function () { b.click(); }); return; } filtro = filtro === b.dataset.resumo ? 'todos' : b.dataset.resumo; limiteLista = 10; aba = 'chamados'; cabecalho(); render(); }; });
    $('cp-selecao').hidden = aba === 'novo' || !l;
    $('cp-imovel').innerHTML = (!l ? '<option value="">Escolha o imóvel</option>' : '') + locacoes.map(function (l) { return '<option value="' + e(l.id) + '">' + e(l.imovel_titulo) + '</option>'; }).join('');
    $('cp-imovel').value = l ? String(l.id) : '';
    $('cp-abas').hidden = !l && !formulario || !!$('cp-confirmar') || !!$('cp-sucesso');
    $('cp-tab-novo').hidden = !escrita();
    $('cp-escrita-aviso').hidden = escrita();
    $('cp-tab-chamados').textContent = 'Chamados (' + rows.filter(abertos).length + ')';
    botaoResidencia();
  }
  function render() {
    $('cp-cabecalho').hidden = false; $('cp-abas').hidden = !locacao() && !formulario;
    $('cp-selecao').hidden = aba === 'novo' || !locacao();
    if (editando) { solicitarSaidaEdicao(render); return; }
    if (residencia) { renderResidencia(); return; }
    if (!locacao() && !(aba === 'novo' && formulario)) { estado(locacoes.length ? 'Escolha o imóvel.' : 'Este contato ainda não tem residência vinculada.'); botaoResidencia(); return; }
    $('cp-conteudo').setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-aba]').forEach(function (b) { var ativo = b.dataset.aba === aba; b.setAttribute('aria-selected', String(ativo)); b.tabIndex = ativo ? 0 : -1; });
    $('cp-conteudo').setAttribute('aria-labelledby', 'cp-tab-' + aba);
    if (aba === 'chamados') renderChamados();
    else if (aba === 'imovel') renderImovel();
    else renderNovo();
    botaoResidencia(); GI.ajustarAltura();
  }
  function impedimentoResidencia() {
    return demo() ? 'Na demonstração, o vínculo de residência está desabilitado.' :
      GI.modo !== 'portal' ? 'Conecte o portal para vincular uma residência.' : '';
  }
  function botaoResidencia() {
    mostrarPessoa();
    var motivo = impedimentoResidencia();
    $('cp-vincular-residencia').hidden = !contato || !!locacao() && aba !== 'imovel' || !!residencia;
    $('cp-residencia-acoes').hidden = $('cp-vincular-residencia').hidden;
    $('cp-vincular-residencia').disabled = !!motivo || gravando;
    $('cp-residencia-aviso').hidden = $('cp-vincular-residencia').hidden || !motivo;
    $('cp-residencia-aviso').textContent = motivo;
  }
  function fecharPessoa() {
    pessoaAberta = false; clearTimeout(timerPessoa); ++buscaPessoa;
    $('cp-pessoa-escolha').hidden = true; $('cp-pessoa-escolha').textContent = '';
  }
  function mostrarPessoa() {
    $('cp-outra-pessoa').hidden = aba === 'novo' || !contato || !demo() && GI.modo !== 'portal';
    $('cp-outra-pessoa').disabled = gravando || !!criacaoIncerta;
    var p = GI.pessoas.obter(chat);
    $('cp-vendo-como').hidden = !p;
    $('cp-vendo-como').innerHTML = p ? 'Vendo como ' + e(contato.name) + ' · <button type="button" class="pc__link" id="cp-pessoa-voltar">Voltar ao contato do atendimento</button>' : '';
    if ($('cp-pessoa-voltar')) $('cp-pessoa-voltar').onclick = function () { escolherPessoa(null); };
  }
  async function escolherPessoa(p) {
    if (gravando || criacaoIncerta || !chat) return;
    if (editando) { solicitarSaidaEdicao(function () { escolherPessoa(p); }); return; }
    var g = geracao, c = chat;
    if (!await atual(g, c)) return;
    g = ++geracao; gravando = true; fecharPessoa(); mostrarPessoa();
    await GI.pessoas.escolher(c, p, demo());
    if (g !== geracao || destruido) return;
    gravando = false; formulario = confirmado = null;
    return iniciar();
  }
  $('cp-outra-pessoa').onclick = function () {
    if (gravando || criacaoIncerta || !contato) return;
    if (editando) { solicitarSaidaEdicao(function () { $('cp-outra-pessoa').click(); }); return; }
    if (pessoaAberta) { fecharPessoa(); return; }
    pessoaAberta = true;
    var g = geracao, c = chat, box = $('cp-pessoa-escolha');
    box.hidden = false;
    box.innerHTML = '<label class="fld">Quem é a pessoa certa?<input class="inp" type="search" id="cp-pessoa-busca" placeholder="Nome, telefone, e-mail ou CPF" autocomplete="off"></label><div class="mini" id="cp-pessoa-resultados" aria-live="polite">Digite pelo menos 3 caracteres.</div><div class="btns"><button type="button" class="btn" id="cp-pessoa-cancelar">Cancelar</button></div>';
    $('cp-pessoa-cancelar').onclick = fecharPessoa;
    $('cp-pessoa-busca').focus({ preventScroll: true });
    $('cp-pessoa-busca').oninput = function () {
      clearTimeout(timerPessoa); var termo = this.value.trim(), v = ++buscaPessoa, alvo = $('cp-pessoa-resultados');
      alvo.textContent = termo.length < 3 ? 'Digite pelo menos 3 caracteres.' : 'Buscando…';
      if (termo.length < 3) return;
      function vigente() { return g === geracao && pessoaAberta && v === buscaPessoa && alvo.isConnected; }
      timerPessoa = setTimeout(async function () {
        try {
          if (!vigente() || !await atual(g, c)) return;
          var r = demo() ? pessoasDemo.filter(function (p) { return [p.name, p.phone, p.email, p.document].join(' ').toLowerCase().indexOf(termo.toLowerCase()) >= 0; }) : await omni.contacts.search(termo, { limit: 8 });
          if (!vigente() || !await atual(g, c)) return;
          var ps = (Array.isArray(r) ? r : r && (r.contacts || r.rows) || GI.lista(r)).filter(function (p) { return p && id(p.id); }).slice(0, 8);
          alvo.innerHTML = ps.length ? ps.map(function (p, i) { return '<button type="button" class="opt" data-pessoa="' + i + '">' + e(GI.textoOuNull(p.name) || 'Contato ' + id(p.id)) + ' · ' + e(GI.telefoneDiscreto(p.phone) || '—') + ' · ' + e(GI.mascaraCpf(p.document || p.cpf)) + '</button>'; }).join('') : 'Nenhuma pessoa encontrada';
          alvo.querySelectorAll('[data-pessoa]').forEach(function (b) { b.onclick = function () { escolherPessoa(ps[Number(b.dataset.pessoa)]); }; });
        } catch (err) {
          if (!vigente()) return;
          var mensagem = GI.mensagemErro(err);
          alvo.textContent = /[Ll]imite de consultas|[Aa]guarde um minuto/.test(mensagem) ? 'Limite de consultas atingido. Aguarde um minuto e tente novamente.' : 'Não foi possível buscar as pessoas. Tente novamente.';
        }
      }, 400);
    };
  };
  function campoResidencia(chave, rotulo) {
    return '<div><label for="cp-r-' + chave + '">' + rotulo + '</label><input id="cp-r-' + chave + '" maxlength="' + (chave === 'contrato' ? 120 : 300) + '" value="' + e(residencia[chave] || '') + '"></div>';
  }
  function renderResidencia() {
    var r = residencia, g = geracao, c = chat;
    $('cp-abas').hidden = true;
    $('cp-conteudo').setAttribute('aria-busy', 'false');
    if (r.etapa === 'adicionar') {
      var l = r.locacao;
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-form"><h2>' + e(rotuloImovel(l)) + '</h2><p>Este imóvel já está locado. Contatos atuais:</p><ul>' + (l.contatos || []).map(function (p) { return '<li>' + e(p.nome) + ' · ' + e(papel(p.papel)) + '</li>'; }).join('') + '</ul><p>Adicionar <strong>' + e(contato.name) + '</strong> como locatário, preservando os contatos acima?</p><button type="button" class="btn btn-primario" id="cp-r-confirmar">Adicionar este contato à locação</button><button type="button" class="btn" id="cp-r-voltar">Voltar</button></div>';
      $('cp-r-voltar').onclick = function () { if (!gravando) { r.etapa = 'buscar'; renderResidencia(); } };
      $('cp-r-confirmar').onclick = function () { gravarResidencia(r, g, c); };
      return;
    }
    if (r.etapa === 'confirmar') {
      $('cp-conteudo').innerHTML = '<div class="gi-cartao gi-cp-form"><p>Vincular <strong>' + e(r.imovel ? r.imovel.name : r.titulo) + '</strong> a <strong>' + e(contato.name) + '</strong>?</p>' +
        (r.contrato ? kv('Contrato', r.contrato) : '') + '<button type="button" class="btn btn-primario" id="cp-r-confirmar">Vincular</button><button type="button" class="btn" id="cp-r-voltar">Voltar</button></div>';
      $('cp-r-voltar').onclick = function () { if (!gravando) { r.etapa = 'buscar'; renderResidencia(); } };
      $('cp-r-confirmar').onclick = function () { gravarResidencia(r, g, c); };
      return;
    }
    $('cp-conteudo').innerHTML = '<form class="gi-cartao gi-cp-form" id="cp-r-form" novalidate><h2>Vincular residência</h2>' +
      (r.fora ? campoResidencia('titulo', 'Título do imóvel (obrigatório)') + campoResidencia('endereco', 'Endereço (opcional)') + campoResidencia('bairro', 'Bairro (opcional)') + campoResidencia('cidade', 'Cidade (opcional)') :
      '<div><label for="cp-r-busca">Buscar por código, título ou bairro</label><input type="search" id="cp-r-busca" value="' + e(r.termo || '') + '" autocomplete="off"></div><div id="cp-r-resultados" class="gi-cp-form" aria-live="polite"></div>') +
      '<button type="button" class="btn" id="cp-r-fora">' + (r.fora ? 'Buscar no catálogo' : 'Não está no catálogo') + '</button>' + campoResidencia('contrato', 'Contrato (opcional)') +
      (r.fora ? '<button type="submit" class="btn btn-primario">Revisar vínculo</button>' : '') + '<button type="button" class="btn" id="cp-r-cancelar">Voltar</button><p class="panel__note">Nada é gravado antes de Vincular.</p></form>';
    ['titulo', 'endereco', 'bairro', 'cidade', 'contrato'].forEach(function (k) {
      if ($('cp-r-' + k)) $('cp-r-' + k).oninput = function () { r[k] = this.value; this.removeAttribute('aria-invalid'); recado('', 'info'); };
    });
    $('cp-r-cancelar').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); residencia = null; recado('', 'info'); cabecalho(); render(); };
    $('cp-r-fora').onclick = function () { ++buscaResidencia; clearTimeout(timerResidencia); r.fora = !r.fora; r.imovel = null; renderResidencia(); };
    $('cp-r-form').onsubmit = function (ev) {
      ev.preventDefault();
      if (!r.fora) return;
      if (!String(r.titulo || '').trim()) { recado('Informe o título do imóvel.', 'erro'); $('cp-r-titulo').setAttribute('aria-invalid', 'true'); $('cp-r-titulo').focus(); return; }
      r.etapa = 'confirmar'; recado('', 'info'); renderResidencia();
    };
    function resultados() {
      if (!$('cp-r-resultados')) return;
      $('cp-r-resultados').innerHTML = (r.resultados || []).slice(0, 8).map(function (p, i) {
        return '<button type="button" class="btn" data-residencia="' + i + '">' + e(p.internalcode) + ' · ' + e(p.name) + '</button>';
      }).join('');
      $('cp-r-resultados').querySelectorAll('[data-residencia]').forEach(function (b) { b.onclick = function () {
        ++buscaResidencia; clearTimeout(timerResidencia); r.imovel = r.resultados[Number(b.dataset.residencia)]; r.etapa = 'confirmar'; recado('', 'info'); renderResidencia();
      }; });
    }
    if ($('cp-r-busca')) {
      resultados();
      $('cp-r-busca').oninput = function () {
        var termo = this.value.trim();
        if (termo === (r.termo || '')) return;
        r.termo = termo; r.resultados = []; resultados(); if (termo) $('cp-r-resultados').textContent = 'Buscando…'; clearTimeout(timerResidencia); var v = ++buscaResidencia;
        if (!termo) return;
        timerResidencia = setTimeout(async function () {
          try {
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            var resposta = await GI.buscarImoveis({ termo: termo, porPagina: 8 });
            if (!await atual(g, c) || residencia !== r || v !== buscaResidencia) return;
            r.resultados = resposta.itens.slice(0, 8); resultados();
            if (!r.resultados.length) $('cp-r-resultados').textContent = 'Nenhum imóvel encontrado. Você pode usar Não está no catálogo.';
          } catch (_) { if (g === geracao && residencia === r && v === buscaResidencia) recado('Não foi possível buscar os imóveis. Tente de novo.', 'erro'); }
        }, 300);
      };
    }
  }
  async function gravarResidencia(r, g, c) {
    if (gravando || residencia !== r || impedimentoResidencia()) return;
    gravando = true; $('cp-r-confirmar').disabled = true; $('cp-r-voltar').disabled = true; botaoResidencia(); recado('Vinculando residência…', 'info');
    var gravou = false;
    try {
      if (!await atual(g, c) || residencia !== r) return;
      var dados = { contatos: [{ contato_id: GI.contatoEfetivo(c), nome: GI.nomeContato(contato, c), telefone: GI.textoOuNull(contato.phone), papel: 'locatario' }] };
      if (r.imovel) {
        var cat = String(r.imovel.category || '').split(' > ');
        dados.imovel_codigo = String(r.imovel.internalcode);
        dados.imovel = { titulo: String(r.imovel.name || r.imovel.internalcode), tipo: cat[0] || null, cidade: cat[1] || null, bairro: cat[2] || null };
      }
      else dados.imovel = { titulo: String(r.titulo || '').trim(), endereco: r.endereco || '', bairro: r.bairro || '', cidade: r.cidade || '' };
      if (String(r.contrato || '').trim()) dados.contrato_numero = r.contrato.trim();
      var salvo;
      if (r.etapa === 'adicionar') {
        cache.delete('/locacoes/' + r.locacao.id);
        var existente = await GI.locacoesObter(r.locacao.id);
        if (!await atual(g, c) || residencia !== r) return;
        var pessoas = (existente.locacao.contatos || []).slice();
        if (!pessoas.some(function (p) { return Number(p.contato_id) === GI.contatoEfetivo(c) && p.papel === 'locatario'; })) pessoas.push(dados.contatos[0]);
        salvo = await GI.locacoesAtualizar(r.locacao.id, { contatos: pessoas });
      } else salvo = await GI.locacoesCriar(dados);
      gravou = true;
      if (!await atual(g, c)) return;
      residencia = null;
      var inicioLeitura = Date.now();
      var lr = await GI.chamarPortal('/contatos/' + GI.contatoEfetivo(c) + '/locacoes');
      if (!await atual(g, c)) return;
      locacoes = linhas(lr);
      selecionada = Math.max(0, locacoes.findIndex(function (l) { return String(l.id) === String(salvo.locacao.id); }));
      aba = 'imovel'; cabecalho(); render(); recado('Residência vinculada.', 'sucesso');
      var cr = await GI.chamadosPorContato(GI.contatoEfetivo(c));
      if (!await atual(g, c)) return;
      chamados = linhas(cr); aplicarLeitura(dadosObtidosEm(c, inicioLeitura)); atualizadoEm = Date.now(); cabecalho();
    } catch (err) {
      if (g !== geracao) return;
      if (gravou) { residencia = null; cabecalho(); render(); recado('Residência vinculada. Não foi possível atualizar a consulta. Use Atualizar para consultar o vínculo.', 'erro'); }
      else {
        var d = err.dados || {};
        if (d.erro === 'imovel_ja_locado' && id(d.locacao_id)) {
          try {
            var existente = await GI.locacoesObter(d.locacao_id);
            if (!await atual(g, c) || residencia !== r) return;
            r.locacao = existente.locacao; r.etapa = 'adicionar'; renderResidencia(); recado('', 'info');
          } catch (falha) { if (g === geracao) recado(GI.mensagemErro(falha), 'erro'); }
        } else recado(GI.mensagemErro(err), 'erro');
      }
    } finally {
      if (g === geracao) {
        gravando = false; botaoResidencia();
        if ($('cp-r-confirmar')) $('cp-r-confirmar').disabled = false;
        if ($('cp-r-voltar')) $('cp-r-voltar').disabled = false;
      }
    }
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest('[data-vincular-residencia]')) $('cp-vincular-residencia').click(); });
  $('cp-vincular-residencia').onclick = function () {
    if (editando) { solicitarSaidaEdicao(function () { $('cp-vincular-residencia').click(); }); return; }
    if (gravando || impedimentoResidencia() || !contato) return;
    clearTimeout(timerResidencia); ++buscaResidencia; residencia = { etapa: 'buscar', fora: false }; recado('', 'info'); render();
  };
  function dado(rotulo, valor) {
    return valor == null || valor === '' || valor === '—' || valor === 'A definir' || valor === 'Não necessária' || valor === 'Não informada' || valor === 'Prazo não informado' || valor === 'Não vinculado' || rotulo === 'Orçamentos' && !valor ? '' : kv(rotulo, valor);
  }
  function aprovacaoProprietario(c) {
    var a = c.aprovacao || {};
    return valorMapa({ aprovada: 'Aprovada', recusada: 'Recusada' }, a.status) || (a.status === 'pendente' && a.enviada_em ? 'Pendente' : '');
  }
  function renderChamados() {
    if (editando) { solicitarSaidaEdicao(renderChamados); return; }
    var todos = GI.cockpit.listar(lista(), filtro, busca, chat.id), rows = todos.slice(0, limiteLista);
    $('cp-conteudo').innerHTML = (locacoes.length > 1 ? '<label class="fld">Imóvel dos chamados<select id="cp-filtro-imovel" class="inp"><option value="">Todas</option>' + locacoes.map(function (l) { return '<option value="' + e(l.id) + '"' + (String(l.id) === filtroImovel ? ' selected' : '') + '>' + e(rotuloImovel(l)) + '</option>'; }).join('') + '</select></label>' : '') + '<div class="cp-filtros"' + (lista().length > 5 || busca || filtro !== 'todos' ? '' : ' hidden') + '><div class="chips">' + ['abertos', 'todos', 'atrasados', 'aguardando', 'emergencias'].map(function (k) { return '<button type="button" class="opt" data-filtro="' + k + '"' + (k !== 'abertos' && k !== 'todos' ? ' data-resumo="' + k + '"' : '') + ' aria-pressed="' + (filtro === k) + '">' + ({ abertos: 'Abertos', todos: 'Todos', atrasados: 'Atrasados', aguardando: 'Aguardando', emergencias: 'Emergências' })[k] + '</button>'; }).join('') + '</div><label class="fld">Buscar título ou O.S.<input class="inp" id="cp-busca" type="search" value="' + e(busca) + '"></label></div>' + rows.map(function (c, i) {
      var status = valorMapa(GI.CHAMADO_STATUS, c.status) || 'Status não informado', at = c.atendimento, trilha = GI.chamadoTrilha(c.status);
      var cor = corStatus(c.status), passo = trilha.findIndex(function (t) { return t.atual; }) + 1;
      return '<details class="acc gi-cp-acc' + (!abertos(c) ? ' acc--hist' : '') + (c.prioridade === 'emergencia' && abertos(c) ? ' gi-cp-urgente' : '') + '" style="--c:var(--' + cor + ')" data-os-id="' + e(c.id) + '" data-chamado="' + i + '"' + (i === 0 && abertos(c) ? ' open' : '') + '><summary class="acc__head">' + resumoCartao(c) + '</summary><div class="acc__body gi-cp-detalhe"><div class="mini gi-cp-trilha" aria-label="Trilha de status">' + segmentos(c.status) + '</div><div class="mini__cap"><span>Status <b data-passo>' + passo + ' de 7</b></span><span data-etapa>' + e(status) + '</span></div>' + dado('Atendimento', at ? (id(at.chat_id) ? '#' + id(at.chat_id) : at.protocolo || '') + (at.canal ? ' · ' + at.canal : '') : null) + dado('Quem paga', valorMapa({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga)) + dado('Valor estimado', moeda(c.valor_estimado_centavos)) + dado('Aprovação do proprietário', aprovacaoProprietario(c)) + dado('Próximo passo', proximoPasso(c)) + dado('Prazo de solução', dataCurta((c.sla || {}).prazo_solucao_em)) + '<div data-complemento="' + e(c.id) + '"></div><div data-os-edicao></div><div class="btns cp-acoes-principais"><button class="btn btn--primary" type="button" data-gestao="' + i + '">Abrir na gestão</button><button class="btn btn--primary btn--icon" type="button" aria-label="Copiar protocolo" title="Copiar protocolo" data-copiar="' + i + '">' + icone('copy') + '</button><span class="cp-editar">' + botaoEditar(c) + '</span><details class="cp-extras cp-acoes-extra"><summary class="btn btn--icon" role="button" aria-label="Mais ações e detalhes" title="Mais ações e detalhes" aria-expanded="false" aria-controls="cp-menu-' + e(c.id) + '">⋯</summary><div class="cp-menu" id="cp-menu-' + e(c.id) + '" role="region" aria-label="Mais ações e detalhes">' + edicaoRapida(c) + '<div class="cp-dados">' + dado('Status', status) + dado('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, c.categoria)) + dado('Aberto em', instante(c.criado_em)) + dado('Relato', c.descricao) + dado('Solicitante', c.solicitante && c.solicitante.nome) + dado('Atendente', c.atendente && c.atendente.nome) + dado('Prestador', c.prestador && c.prestador.nome) + dado('Orçamentos', numero(c.orcamentos_total)) + dado('Visita', instante((c.visita || {}).inicio)) + dado('Prazo', GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + '</div><div class="gi-cp-acoes btns"><button class="btn" type="button" data-detalhes="' + e(c.id) + '">Fotos e observações</button>' + (administrador ? '<button class="btn" type="button" data-lista-completa>Lista completa</button>' : '') + '<button type="button" class="btn" data-copiar-os="' + i + '">Copiar nº da O.S.</button><button type="button" class="btn" data-resumo-copiar="' + i + '">⧉ Copiar resumo</button>' + (escrita() ? '<button type="button" class="btn" data-aviso="' + i + '">✉ Avisar cliente</button>' + (!GI.cockpit.ligado(c, chat.id) ? '<button type="button" class="btn" data-vincular="' + i + '">↔ Vincular este atendimento</button>' : '') : '') + (contato ? '<button type="button" class="btn" data-vincular-residencia>Vincular outra residência</button>' : '') + '<button type="button" class="btn" data-voltar-lista>← Voltar</button></div></div></details></div><div data-acao aria-live="polite"></div></div></details>';
    }).join('') + (todos.length > limiteLista ? '<button type="button" class="btn" id="cp-mais">Mostrar mais 10</button>' : '') + (!rows.length ? '<p class="pc state">Nenhum chamado deste imóvel.' + (escrita() ? ' Para abrir um chamado, use a aba Novo.' : '') + '</p>' : '') + '<p class="foot">Chamados de todas as residências.</p>';
    if ($('cp-filtro-imovel')) $('cp-filtro-imovel').onchange = function () { if (editando) { var sel = this, valor = this.value; this.value = filtroImovel; solicitarSaidaEdicao(function () { sel.value = valor; sel.onchange(); }); return; } filtroImovel = this.value; limiteLista = 10; cabecalho(); renderChamados(); };
    document.querySelectorAll('[data-filtro]').forEach(function (b) { b.onclick = function () { if (editando) { solicitarSaidaEdicao(function () { b.click(); }); return; } filtro = b.dataset.resumo && filtro === b.dataset.filtro ? 'todos' : b.dataset.filtro; limiteLista = 10; cabecalho(); renderChamados(); }; });
    $('cp-busca').oninput = function () { if (editando) { var campo = this, valor = this.value; this.value = busca; solicitarSaidaEdicao(function () { campo.value = valor; campo.oninput(); }); return; } var pos = this.selectionStart; busca = this.value; limiteLista = 10; renderChamados(); $('cp-busca').focus(); $('cp-busca').setSelectionRange(pos, pos); };
    if ($('cp-mais')) $('cp-mais').onclick = function () { if (editando) { solicitarSaidaEdicao(function () { $('cp-mais').click(); }); return; } limiteLista += 10; renderChamados(); };
    document.querySelectorAll('[data-chamado]').forEach(function (card) {
      card.addEventListener('click', function (ev) {
        if (!ev.target.closest('[data-mudar-status]')) return;
        ev.preventDefault(); card.open = true;
        var extras = card.querySelector('.cp-extras'); extras.open = true;
        var select = card.querySelector('[data-rapida="status"]'); if (select) select.focus();
      });
    });
    document.querySelectorAll('[data-chamado]').forEach(function (card, i) { ligarRapida(card, rows[i]); });
    document.querySelectorAll('[data-resumo-copiar]').forEach(function (b) { b.onclick = function () { copiarTexto(resumoTexto(rows[Number(b.dataset.resumoCopiar)]), b); }; });
    document.querySelectorAll('[data-aviso]').forEach(function (b) { b.onclick = function () { avisarCliente(b.closest('[data-os-id]'), rows[Number(b.dataset.aviso)]); }; });
    document.querySelectorAll('[data-vincular]').forEach(function (b) { b.onclick = function () { vincularAtendimento(b.closest('[data-os-id]'), rows[Number(b.dataset.vincular)], b); }; });
    document.querySelectorAll('[data-voltar-lista]').forEach(function (b) { b.onclick = function () { b.closest('[data-os-id]').open = false; b.closest('[data-os-id]').querySelector('summary').focus(); }; });
    document.querySelectorAll('details[data-chamado]').forEach(function (card) { card.addEventListener('toggle', function () { if (card.open) document.querySelectorAll('details[data-chamado]').forEach(function (outro) { if (outro !== card) outro.open = false; }); }); });
    document.querySelectorAll('.cp-acoes-extra').forEach(function (extra) {
      extra.addEventListener('toggle', function () {
        extra.querySelector('summary').setAttribute('aria-expanded', String(extra.open));
        if (extra.open) document.querySelectorAll('.cp-acoes-extra[open]').forEach(function (outro) { if (outro !== extra) outro.open = false; });
      });
    });
    ligarListaCompleta();
    document.querySelectorAll('[data-editar-os]').forEach(function (b) { b.onclick = function () { abrirEdicao(b, rows[Number(b.closest('[data-chamado]').dataset.chamado)]); }; });
    document.querySelectorAll('[data-detalhes]').forEach(function (b) { b.onclick = function () { carregarDetalhes(b); }; });
    document.querySelectorAll('[data-gestao]').forEach(function (b) { b.onclick = function () { abrirGestao(rows[Number(b.dataset.gestao)]); }; });
    document.querySelectorAll('[data-copiar-os]').forEach(function (b) { b.onclick = function () { copiarTexto(GI.chamadoNumero(rows[Number(b.dataset.copiarOs)].numero), b); }; });
    document.querySelectorAll('[data-copiar]').forEach(function (b) { b.onclick = function () { copiar(rows[Number(b.dataset.copiar)]); }; });
  }
  function fecharMenus(ev) {
    if (ev.type === 'keydown' && (editando || $('cp-foto-ampliada') && !$('cp-foto-ampliada').hidden)) return;
    document.querySelectorAll('.cp-acoes-extra[open]').forEach(function (extra) {
      var item = ev.type === 'click' && extra.contains(ev.target) && ev.target.closest('.cp-menu button');
      if (ev.type === 'keydown' && ev.key !== 'Escape' || ev.type === 'click' && (!item && extra.contains(ev.target) || ev.target.closest('[data-mudar-status]'))) return;
      extra.open = false; extra.querySelector('summary').setAttribute('aria-expanded', 'false');
      if (ev.type === 'keydown' || item) extra.querySelector('summary').focus();
      if (ev.type === 'keydown') ev.preventDefault();
    });
  }
  document.addEventListener('keydown', fecharMenus);
  document.addEventListener('click', fecharMenus);
  function impedimentoEdicao(c) {
    if (!abertos(c)) return 'Reabra o chamado (Status → Reabrir) para editar.';
    if (demo()) return 'Demonstração: edição indisponível.';
    if (GI.modo !== 'portal') return 'Conecte o portal para editar.';
    if (!escrita()) return 'Edição de chamados desligada neste cockpit.';
    return '';
  }
  function botaoEditar(c) {
    var motivo = impedimentoEdicao(c);
    return '<button class="btn btn--primary btn--icon" type="button" aria-label="Editar chamado" title="Editar chamado" data-editar-os' + (motivo ? ' disabled' : '') + '><span aria-hidden="true">✎</span><span class="cp-so-leitor"> Editar</span></button><span data-editar-ajuda class="panel__note">' + e(motivo) + '</span>';
  }
  function rotuloEditar(botao) {
    botao.innerHTML = '<span aria-hidden="true">✎</span><span class="cp-so-leitor"> Editar</span>';
  }
  function atualizarBotaoEditar(card, c) {
    var b = card.querySelector('[data-editar-os]');
    if (!b) return;
    b.disabled = !!impedimentoEdicao(c) || !!(editando && editando.card === card);
    card.querySelector('[data-editar-ajuda]').textContent = impedimentoEdicao(c);
  }
  function edicaoSuja(ed) { return ed.original && Object.keys(GI.cockpit.diffEdicao(ed.original, ed.dados)).length > 0; }
  function fecharEdicao() {
    var ed = editando;
    if (!ed) return;
    editando = null;
    ed.card.querySelector('[data-os-edicao]').textContent = '';
    ed.card.querySelectorAll('[data-rapida]').forEach(function (campo) {
      campo.disabled = false;
      if (campo.dataset.rapida === 'prioridade') campo.value = ed.c.prioridade;
    });
    rotuloEditar(ed.botao); ed.botao.removeAttribute('aria-busy');
    atualizarBotaoEditar(ed.card, ed.c);
    if (ed.botao.isConnected && !ed.botao.disabled) ed.botao.focus();
  }
  function solicitarSaidaEdicao(continuar) {
    var ed = editando;
    if (!ed) { if (continuar) continuar(); return; }
    if (ed.ocupado || ed.carregando) return;
    if (!edicaoSuja(ed) || ed.postSalvo) { fecharEdicao(); if (continuar) continuar(); return; }
    ed.card.open = true;
    var caixa = $('cp-edit-descartar'); caixa.hidden = false;
    $('cp-edit-descartar-sim').onclick = function () { fecharEdicao(); if (continuar) continuar(); };
    $('cp-edit-continuar').onclick = function () { caixa.hidden = true; $('cp-edit-titulo').focus(); };
    $('cp-edit-continuar').focus();
  }
  function abrirEdicao(botao, c) {
    if (impedimentoEdicao(c)) return;
    if (editando) { solicitarSaidaEdicao(function () { abrirEdicao(botao, c); }); return; }
    var card = botao.closest('[data-os-id]');
    if (card.querySelector('[data-rapida="status"]:disabled')) return;
    var ed = { botao: botao, card: card, c: c, g: geracao, contexto: chat, carregando: true, ocupado: false };
    editando = ed; card.open = true; botao.disabled = true; botao.setAttribute('aria-busy', 'true'); botao.textContent = 'Carregando…';
    card.querySelectorAll('[data-rapida]').forEach(function (campo) { campo.disabled = true; });
    cache.delete('/chamados/' + c.id);
    Promise.resolve().then(function () { return GI.chamadosObter(c.id); }).then(function (r) {
      return atual(ed.g, ed.contexto).then(function (valido) {
        if (!valido || editando !== ed || !card.isConnected) return;
        ed.original = r.chamado; ed.dados = GI.cockpit.dadosEdicao(r.chamado);
        atualizarCartao(card, c, r);
        if (!abertos(r.chamado)) { fecharEdicao(); recado('Este chamado está encerrado. Reabra antes de editar.', 'erro'); return; }
        montarEdicao(ed);
      });
    }).catch(function (err) {
      if (editando === ed) { fecharEdicao(); recado(GI.mensagemErro(err), 'erro'); }
    }).then(function () {
      ed.carregando = false;
      botao.removeAttribute('aria-busy'); rotuloEditar(botao);
    });
  }
  function montarEdicao(ed) {
    var f = ed.dados;
    function campo(k, rotulo, max, area) {
      return '<div><label for="cp-edit-' + k + '">' + rotulo + '</label>' + (area ? '<textarea' : '<input type="text"') + ' id="cp-edit-' + k + '" maxlength="' + max + '" aria-describedby="cp-edit-' + k + '-erro"' + (k === 'titulo' ? ' required' : '') + (area ? '>' + e(f[k]) + '</textarea>' : ' value="' + e(f[k]) + '">') + '<p id="cp-edit-' + k + '-erro" role="alert" hidden></p></div>';
    }
    function chips(k, rotulo, mapa) {
      return '<fieldset><legend>' + rotulo + '</legend><div class="gi-cp-chips">' + Object.keys(mapa).map(function (v) {
        return '<button type="button" data-edit-' + k + '="' + e(v) + '" aria-pressed="' + (v === f[k]) + '">' + e(mapa[v]) + '</button>';
      }).join('') + '</div><p id="cp-edit-' + k + '-erro" role="alert" hidden></p></fieldset>';
    }
    ed.card.querySelector('[data-os-edicao]').innerHTML = '<form id="cp-edit-form" class="gi-cp-form cp-edit" novalidate><h2>Editar ' + e(GI.chamadoNumero(ed.c.numero)) + '</h2>' + campo('titulo', 'Título', 180) + campo('descricao', 'Descrição', 10000, true) + chips('categoria', 'Categoria', GI.CHAMADO_CATEGORIAS) + chips('prioridade', 'Urgência', GI.CHAMADO_PRIORIDADES) + '<details><summary>Mais detalhes</summary>' + campo('disponibilidade', 'Quando dá para entrar', 500) + '<label for="cp-edit-sem-cliente" class="gi-cp-check"><input type="checkbox" id="cp-edit-sem-cliente"' + (f.sem_cliente ? ' checked' : '') + '>Autoriza entrar sem o cliente</label><p id="cp-edit-sem_cliente-erro" role="alert" hidden></p>' + campo('chaves', 'Chaves / acesso', 500) + '</details><p id="cp-edit-erro" role="alert" hidden></p><div class="gi-cp-acoes"><button id="cp-edit-salvar" class="btn btn-primario" type="submit" disabled>Salvar alterações</button><button id="cp-edit-cancelar" class="btn" type="button">Cancelar</button></div><div id="cp-edit-descartar" hidden><p>Descartar as alterações?</p><div class="gi-cp-acoes"><button type="button" class="btn" id="cp-edit-descartar-sim">Descartar</button><button type="button" class="btn" id="cp-edit-continuar">Continuar editando</button></div></div></form>';
    function validar() {
      var vazio = !f.titulo.trim();
      $('cp-edit-titulo-erro').textContent = vazio ? 'Informe o título do chamado.' : '';
      $('cp-edit-titulo-erro').hidden = !vazio;
      $('cp-edit-titulo').setAttribute('aria-invalid', String(vazio));
      $('cp-edit-salvar').disabled = vazio || !edicaoSuja(ed);
    }
    ['titulo', 'descricao', 'disponibilidade', 'chaves'].forEach(function (k) {
      $('cp-edit-' + k).oninput = function () { f[k] = this.value; validar(); };
    });
    $('cp-edit-sem-cliente').onchange = function () { f.sem_cliente = this.checked; validar(); };
    ['categoria', 'prioridade'].forEach(function (k) {
      ed.card.querySelectorAll('[data-edit-' + k + ']').forEach(function (b) { b.onclick = function () {
        f[k] = b.dataset[k === 'categoria' ? 'editCategoria' : 'editPrioridade'];
        ed.card.querySelectorAll('[data-edit-' + k + ']').forEach(function (outro) { outro.setAttribute('aria-pressed', String(outro === b)); }); validar();
      }; });
    });
    $('cp-edit-cancelar').onclick = function () { solicitarSaidaEdicao(); };
    $('cp-edit-form').onsubmit = function (ev) { ev.preventDefault(); salvarEdicao(ed); };
    validar(); $('cp-edit-titulo').focus();
  }
  function salvarEdicao(ed) {
    if (editando !== ed || ed.ocupado || !ed.dados.titulo.trim() || !edicaoSuja(ed)) return;
    var d = GI.cockpit.diffEdicao(ed.original, ed.dados);
    if (!Object.keys(d).length) return;
    ed.ocupado = true;
    ed.card.querySelectorAll('#cp-edit-form button, #cp-edit-form input, #cp-edit-form textarea').forEach(function (b) { b.disabled = true; });
    $('cp-edit-salvar').textContent = 'Salvando…'; $('cp-edit-salvar').setAttribute('aria-busy', 'true');
    ed.card.querySelectorAll('#cp-edit-form [role="alert"]').forEach(function (p) { p.hidden = true; });
    function reler() { cache.delete('/chamados/' + ed.c.id); return GI.chamadosObter(ed.c.id); }
    atual(ed.g, ed.contexto).then(function (valido) {
      if (!valido || editando !== ed) return;
      return (ed.postSalvo ? Promise.resolve() : GI.chamadosAtualizar(ed.c.id, d)).then(function () {
        ed.postSalvo = true; return reler();
      }).then(function (r) {
        if (ed.g !== geracao || editando !== ed) return;
        atualizarCartao(ed.card, ed.c, r); fecharEdicao();
        recado(GI.chamadoNumero(ed.c.numero) + ' salva ✓', 'sucesso');
      });
    }).catch(function (err) {
      if (ed.g !== geracao || editando !== ed) return;
      if ((err.dados || {}).erro === 'chamado_encerrado') {
        return reler().then(function (r) { if (editando === ed) atualizarCartao(ed.card, ed.c, r); }).catch(function () {}).then(function () {
          if (editando === ed) { fecharEdicao(); recado('Este chamado está encerrado. Reabra antes de editar.', 'erro'); }
        });
      }
      var campos = (err.dados || {}).campos || {}, primeiro;
      Object.keys(campos).forEach(function (k) {
        var chave = k.split('.').pop(), alvo = $('cp-edit-' + chave + '-erro'), campo = $(chave === 'sem_cliente' ? 'cp-edit-sem-cliente' : 'cp-edit-' + chave);
        if (!alvo) return;
        var unico = {}; unico[k] = campos[k];
        alvo.textContent = GI.mensagemErro({ status: err.status, dados: { erro: 'dados_invalidos', campos: unico } }); alvo.hidden = false;
        if (campo) { var detalhe = campo.closest('#cp-edit-form details'); if (detalhe) detalhe.open = true; campo.setAttribute('aria-invalid', 'true'); if (!primeiro) primeiro = campo; }
      });
      $('cp-edit-erro').textContent = ed.postSalvo ? 'Alterações salvas. Não foi possível atualizar o cartão. Tente de novo para consultar.' : GI.mensagemErro(err);
      $('cp-edit-erro').hidden = false;
      ed.focoErro = primeiro;
    }).then(function () {
      ed.ocupado = false;
      if (editando !== ed) return;
      ed.card.querySelectorAll('#cp-edit-form button, #cp-edit-form input, #cp-edit-form textarea').forEach(function (b) { b.disabled = ed.postSalvo && b.id !== 'cp-edit-salvar' && b.id !== 'cp-edit-cancelar'; });
      $('cp-edit-salvar').textContent = 'Tentar de novo'; $('cp-edit-salvar').removeAttribute('aria-busy');
      if (ed.focoErro) ed.focoErro.focus();
    });
  }
  function icone(nome) { return '<svg class="i" aria-hidden="true"><use href="#i-' + nome + '"></use></svg>'; }
  function corStatus(status) { return valorMapa({ novo: 'novo', triagem: 'triagem', orcamento: 'orc', aprovacao: 'aprov', agendado: 'agend', execucao: 'exec', concluido: 'done', cancelado: 'mute' }, status) || 'novo'; }
  function segmentos(status) {
    return GI.chamadoTrilha(status).map(function (s, i) { return '<i title="' + e(s.rotulo) + '" style="--c:var(--' + corStatus(['novo', 'triagem', 'orcamento', 'aprovacao', 'agendado', 'execucao', 'concluido'][i]) + ')" class="' + (s.atual ? 'now' : s.feito ? 'on' : '') + '"></i>'; }).join('');
  }
  function dataCurta(v) {
    var d = new Date(v);
    if (!v || !Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') + ' ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function proximoPasso(c) {
    if ((c.aprovacao || {}).status === 'pendente') return (c.aprovacao || {}).enviada_em ? 'Aguardar proprietário' : 'Enviar ao proprietário';
    return '';
  }
  function resumoCartao(c) {
    var imovel = locacoes.find(function (l) { return String(l.id) === String(c.locacao_id); }) || c.imovel || {}, meta = '', numeroVisual = String(c.numero);
    if (/^\d{1,3}$/.test(numeroVisual)) numeroVisual = ('0000' + numeroVisual).slice(-4);
    if (!abertos(c) && c.concluido_em) meta = 'concluída em ' + new Date(c.concluido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    else if (c.status === 'agendado' && (c.visita || {}).inicio) {
      meta = 'visita ' + GI.janelaVisita(c.visita.inicio, c.visita.fim);
    } else if (c.criado_em) meta = 'aberta há ' + Math.max(0, Math.floor((Date.now() - Date.parse(c.criado_em)) / 3600000)) + ' horas · prioridade ' + String(valorMapa(GI.CHAMADO_PRIORIDADES, c.prioridade) || 'Prioridade não informada').toLowerCase();
    else meta = String(valorMapa(GI.CHAMADO_PRIORIDADES, c.prioridade) || 'Prioridade não informada') + ' · ' + GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ');
    return '<span class="acc__row gi-cp-linha"><strong class="acc__id">' + e(/^\d{4}$/.test(numeroVisual) ? 'OS-' + numeroVisual : GI.chamadoNumero(c.numero)) + '</strong><span class="acc__right"><button type="button" class="pill pill--' + corStatus(c.status) + '" data-mudar-status aria-label="Mudar status: ' + e(valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado') + '">' + e(valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado') + '</button><span class="cp-chevron">' + icone('chev-d') + '</span></span></span>' + '<span class="acc__title gi-cp-titulo">' + e(c.titulo) + '</span><span class="acc__meta gi-cp-meta">' + e(meta) + '</span>' + (GI.cockpit.ligado(c, chat.id) ? '<span class="pill pill--triagem">Este atendimento</span>' : '') + (locacoes.length > 1 ? '<span class="acc__meta">' + e(imovel.imovel_titulo ? rotuloImovel(imovel) : imovel.titulo) + '</span>' : '');
  }
  function resumoTexto(c) {
    var l = c.imovel || locacao() || {};
    return 'O.S.: ' + GI.chamadoNumero(c.numero) + '\nTítulo: ' + (c.titulo || '—') + '\nImóvel: ' + (l.titulo || l.imovel_titulo || '—') + '\nStatus: ' + (valorMapa(GI.CHAMADO_STATUS, c.status) || '—') + '\nPrazo: ' + GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') + '\nPrestador: ' + (c.prestador && c.prestador.nome || '—') + '\nValor: ' + moeda(c.valor_estimado_centavos);
  }
  function dataLocal(v) {
    var d = new Date(v);
    if (!v || !Number.isFinite(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function edicaoRapida(c) {
    if (!escrita()) return '';
    function select(k, label, mapa, atual) {
      return '<label>' + label + '<select data-rapida="' + k + '">' + Object.keys(mapa).map(function (chave) { return '<option value="' + e(chave) + '"' + (chave === atual ? ' selected' : '') + '>' + e(mapa[chave]) + '</option>'; }).join('') + '</select><span data-salvo="' + k + '" role="status"></span></label>';
    }
    return '<div class="gi-cp-form" data-edicao>' + select('status', 'Status', GI.statusDisponiveis(c.status), c.status) + '<p data-reabrir-ajuda' + (abertos(c) ? ' hidden' : '') + '>Reabrir volta o chamado para Triagem.</p>' + '<div data-cancelar-caixa hidden><p>Cancelar este chamado?</p><label>Motivo (opcional)<input data-cancelar-motivo maxlength="500"></label><button type="button" class="btn" data-cancelar-confirmar>Cancelar chamado</button><button type="button" class="btn" data-cancelar-voltar>Voltar</button></div>' +
      select('prioridade', 'Prioridade', GI.CHAMADO_PRIORIDADES, c.prioridade) + '<label>Atendente responsável<select data-rapida="atendente" disabled><option>Carregando…</option></select><span data-salvo="atendente" role="status"></span></label>' +
      select('quem_paga', 'Quem paga', { '': 'A definir', proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga || '') + '<label>Próxima visita<input type="datetime-local" data-rapida="visita" value="' + e(dataLocal((c.visita || {}).inicio)) + '"><span data-salvo="visita" role="status"></span></label></div>';
  }
  function erroRapido(err) { return GI.mensagemErro(err); }

  function atualizarCartao(card, c, r) {
    if (r && r.chamado) Object.assign(c, r.chamado);
    atualizadoEm = Date.now(); cabecalho(); card.querySelector('summary').innerHTML = resumoCartao(c);
    card.classList.toggle('gi-cp-urgente', c.prioridade === 'emergencia' && abertos(c));
    var valores = { Categoria: valorMapa(GI.CHAMADO_CATEGORIAS, c.categoria), Relato: c.descricao, 'Prazo de solução': dataCurta((c.sla || {}).prazo_solucao_em), 'Próximo passo': proximoPasso(c), Status: valorMapa(GI.CHAMADO_STATUS, c.status), Atendente: c.atendente && c.atendente.nome, 'Quem paga': valorMapa({ proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga), Visita: instante((c.visita || {}).inicio), Prazo: GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') };
    card.querySelectorAll('[data-kv]').forEach(function (linha) { if (Object.hasOwn(valores, linha.dataset.kv)) linha.lastElementChild.textContent = valores[linha.dataset.kv] || '—'; });
    atualizarBotaoEditar(card, c);
    var statusSelect = card.querySelector('[data-rapida="status"]');
    if (statusSelect) { statusSelect.innerHTML = Object.keys(GI.statusDisponiveis(c.status)).map(function (k) { return '<option value="' + e(k) + '">' + e(GI.statusDisponiveis(c.status)[k]) + '</option>'; }).join(''); statusSelect.value = c.status; card.querySelector('[data-reabrir-ajuda]').hidden = abertos(c); }
    var trilha = card.querySelector('.gi-cp-trilha');
    trilha.innerHTML = segmentos(c.status);
    card.style.setProperty('--c', 'var(--' + corStatus(c.status) + ')');
    card.classList.toggle('acc--hist', !abertos(c));
    card.querySelector('[data-passo]').textContent = (GI.chamadoTrilha(c.status).findIndex(function (s) { return s.atual; }) + 1) + ' de 7';
    card.querySelector('[data-etapa]').textContent = valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado';
  }
  function ligarRapida(card, c) {
    var controles = card.querySelector('[data-edicao]');
    if (!controles) return;
    var g = geracao, contexto = chat, ocupado = false, mapaUsuarios = {};
    function atualControle(k) { return k === 'atendente' ? String((c.atendente || {}).user_id || '') : k === 'visita' ? dataLocal((c.visita || {}).inicio) : String(c[k] || ''); }
    function restaurar() { controles.querySelectorAll('[data-rapida]').forEach(function (b) { b.value = atualControle(b.dataset.rapida); }); }
    function bloquear(valor) { controles.querySelectorAll('input, select, button').forEach(function (b) { b.disabled = valor; }); }
    GI.usuarios().then(function (mapa) {
      if (g !== geracao || !card.isConnected) return;
      mapaUsuarios = Object.assign({}, mapa);
      if (c.atendente) mapaUsuarios[c.atendente.user_id] = mapaUsuarios[c.atendente.user_id] || GI.nomeDoUsuario({ id: c.atendente.user_id, name: c.atendente.nome });
      var sel = controles.querySelector('[data-rapida="atendente"]');
      sel.innerHTML = '<option value="">Sem atendente</option>' + Object.keys(mapaUsuarios).filter(function (n) { return id(n); }).map(function (n) { return '<option value="' + e(n) + '">' + e(mapaUsuarios[n]) + '</option>'; }).join('');
      sel.value = atualControle('atendente'); sel.disabled = ocupado || !!(editando && editando.card === card);
    });
    async function gravar(k, valor, motivo) {
      if (ocupado || editando && editando.card === card || !escrita() || !card.isConnected) { restaurar(); return; }
      ocupado = true; bloquear(true);
      var mensagem = controles.querySelector('[data-salvo="' + k + '"]'); mensagem.textContent = 'Salvando…';
      controles.querySelector('[data-cancelar-caixa]').hidden = true;
      try {
        if (!await atual(g, contexto) || !card.isConnected) return;
        var dados = {}, r;
        if (demo()) { if (k === 'visita') c.visita = { inicio: valor ? new Date(valor).toISOString() : null }; else if (k === 'atendente') c.atendente = valor ? { user_id: Number(valor), nome: GI.nomeDoUsuario({ id: valor, name: mapaUsuarios[valor] }) } : null; else c[k] = valor || null; r = { chamado: c }; }
        else if (k === 'status') r = await GI.chamadosStatus(c.id, valor, motivo);
        else if (k === 'visita') r = await GI.chamadosVisita(c.id, { inicio: valor ? new Date(valor).toISOString() : null, fim: (c.visita || {}).fim || null });
        else { dados[k] = k === 'atendente' ? (valor ? { user_id: Number(valor), nome: GI.nomeDoUsuario({ id: valor, name: mapaUsuarios[valor] }) } : null) : valor || null; r = await GI.chamadosAtualizar(c.id, dados); }
        if (!await atual(g, contexto) || !card.isConnected) return;
        atualizarCartao(card, c, r); mensagem.textContent = '✓ salvo'; recado('✓ salvo', 'sucesso');
      } catch (err) { if (g === geracao && card.isConnected) { mensagem.textContent = erroRapido(err); recado(erroRapido(err), 'erro');
        if (err.dados && err.dados.erro === 'aprovacao_pendente') { var gestao = document.createElement('button'); gestao.type = 'button'; gestao.className = 'btn'; gestao.textContent = 'Gestão'; gestao.onclick = function () { abrirGestao(c); }; mensagem.appendChild(gestao); } } }
      finally { ocupado = false; if (g === geracao && card.isConnected) { restaurar(); bloquear(false); } }
    }
    controles.querySelectorAll('[data-rapida]').forEach(function (b) { b.onchange = function () {
      if (b.dataset.rapida === 'status' && b.value === 'cancelado') { controles.querySelector('[data-cancelar-caixa]').hidden = false; controles.querySelector('[data-cancelar-motivo]').focus(); return; }
      gravar(b.dataset.rapida, b.value);
    }; });
    controles.querySelector('[data-cancelar-voltar]').onclick = function () { controles.querySelector('[data-cancelar-caixa]').hidden = true; restaurar(); controles.querySelector('[data-rapida="status"]').focus(); };
    controles.querySelector('[data-cancelar-confirmar]').onclick = function () { gravar('status', 'cancelado', controles.querySelector('[data-cancelar-motivo]').value); };
  }
  async function vincularAtendimento(card, c, botao) {
    var g = geracao, contexto = chat, msg = card.querySelector('[data-acao]'); botao.disabled = true;
    try {
      if (!await atual(g, contexto) || !card.isConnected) return;
      var a = GI.atendimentoPortal(contexto, filasConhecidas);
      var r = demo() ? { chamado: Object.assign({}, c, { atendimento: a }) } : await GI.chamadosAtualizar(c.id, { atendimento: a });
      if (!await atual(g, contexto) || !card.isConnected) return;
      atualizarCartao(card, c, r); var primeiro = card.parentNode.querySelector('details[data-chamado]'); if (primeiro !== card) card.parentNode.insertBefore(card, primeiro); botao.hidden = true; msg.textContent = '✓ salvo · Este atendimento'; recado('Atendimento vinculado.', 'sucesso');
    } catch (err) { if (g === geracao && card.isConnected) { msg.textContent = erroRapido(err); recado(erroRapido(err), 'erro'); } }
    finally { if (card.isConnected) botao.disabled = false; }
  }
  function avisarCliente(card, c) {
    var alvo = card.querySelector('[data-acao]'), g = geracao, contexto = chat, enviado = null, notaInterna = null, ocupado = false;
    alvo.innerHTML = '<form class="gi-cp-form" data-aviso-form novalidate><label>Mensagem ao cliente<textarea data-aviso-texto maxlength="10000" required></textarea></label><p>Revise o texto antes de confirmar o envio nesta conversa.</p><div class="gi-cp-acoes"><button class="btn" type="submit">Confirmar envio</button><button class="btn" type="button" data-aviso-voltar>Voltar</button></div><p role="status" data-aviso-recado></p></form>';
    var campo = alvo.querySelector('textarea'), msg = alvo.querySelector('[data-aviso-recado]');
    campo.value = 'Olá! Sua O.S. ' + GI.chamadoNumero(c.numero) + ' (' + (c.titulo || '') + ') está em ' + (valorMapa(GI.CHAMADO_STATUS, c.status) || 'acompanhamento') + '. ' + GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ') + '.';
    campo.focus();
    alvo.querySelector('[data-aviso-voltar]').onclick = function () { if (!ocupado) alvo.textContent = ''; };
    alvo.querySelector('form').onsubmit = async function (ev) {
      ev.preventDefault(); var texto = campo.value.trim(); if (ocupado || !escrita()) return; if (!texto) { recado('Escreva a mensagem antes de enviar.', 'erro'); campo.focus(); return; }
      ocupado = true; alvo.querySelectorAll('button, textarea').forEach(function (b) { b.disabled = true; });
      try {
        if (!await atual(g, contexto) || !card.isConnected) return;
        if (enviado !== texto) {
          var aberto = demo() ? { id: contexto.id, contactId: contexto.contactId, status: 'active' } : await omni.chats.get(contexto.id);
          if (!await atual(g, contexto) || !card.isConnected) return;
          if (!GI.chatAberto(aberto, contexto.contactId)) { msg.textContent = 'Esta conversa não está mais aberta.'; recado(msg.textContent, 'erro'); return; }
          var envio = demo() ? { sent: true } : await omni.chats.sendMessage(contexto.id, { text: texto });
          if (!envio || envio.sent !== true) throw new Error('envio');
          enviado = texto;
        }
        if (!await atual(g, contexto) || !card.isConnected) return;
        if (!demo()) await GI.chamadosNota(c.id, { texto: texto, notificou_cliente: true });
        if (g === geracao && card.isConnected) { alvo.textContent = '✓ Cliente avisado e nota salva.'; recado(alvo.textContent, 'sucesso'); }
      } catch (err) {
        if (g !== geracao || !card.isConnected) return;
        if (err.code === 'forbidden' && enviado !== texto) {
          try {
            if (notaInterna !== texto && !demo()) await GI.chamadosNota(c.id, { texto: texto, notificou_cliente: false });
            if (!await atual(g, contexto) || !card.isConnected) return;
            notaInterna = texto; msg.textContent = 'Nota salva. O cliente não foi avisado porque a janela de 24 h fechou.';
          } catch (falha) { msg.textContent = 'O cliente não foi avisado. Não foi possível salvar a nota: ' + GI.mensagemErro(falha); }
        } else msg.textContent = enviado === texto ? 'Aviso enviado. Não foi possível salvar a nota; tente novamente.' : 'Não foi possível enviar o aviso. Tente novamente.';
        recado(msg.textContent, 'erro');
      } finally { ocupado = false; if (card.isConnected) alvo.querySelectorAll('button, textarea').forEach(function (b) { b.disabled = false; }); }
    };
  }
  function base64(v) { return typeof v === 'string' && v.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v); }
  async function carregarDetalhes(botao) {
    var g = geracao, c = chat, n = id(botao.dataset.detalhes), alvo = botao.closest('[data-os-id]').querySelector('[data-complemento]');
    botao.disabled = true; botao.setAttribute('aria-busy', 'true'); alvo.textContent = 'Carregando fotos e observações…';
    function valido() { return g === geracao && alvo.isConnected; }
    try {
      var d = demo() ? { chamado: {}, anexos: [], eventos: [] } : await GI.chamadosObter(n);
      if (!await atual(g, c) || !valido()) return;
      alvo.innerHTML = '<div class="gi-cp-fotos" data-fotos></div><div data-foto-inteira hidden><button type="button" class="btn" data-fechar-foto>Fechar foto</button><div data-imagem></div></div><h2>Observações</h2><div data-observacoes></div>' +
        (escrita() && !demo() ? '<form class="gi-cp-form" data-nota-form novalidate><label>Nota para a equipe<textarea data-nota maxlength="10000" required></textarea></label><label class="gi-cp-check"><input type="checkbox" data-avisar>Avisar o cliente nesta conversa</label><button type="submit" class="btn" data-salvar-nota>Salvar nota</button><div data-confirmacao-nota hidden><p data-aviso-texto></p><button type="button" class="btn" data-voltar-nota>Voltar</button><button type="button" class="btn" data-confirmar-nota>Confirmar aviso</button></div><p role="status" data-recado-nota></p></form>' : '<p class="panel__note">Somente consulta. Abertura e notas estão desligadas neste cockpit.</p>');
      function no(q) { return alvo.querySelector('[data-' + q + ']'); }
      function observacoes() {
        no('observacoes').textContent = '';
        var notas = (d.eventos || []).filter(function (ev) { return ev.tipo === 'nota'; });
        if (!notas.length) no('observacoes').textContent = 'Nenhuma observação.';
        notas.forEach(function (ev) {
          var p = document.createElement('p'); p.textContent = (ev.autor || 'Equipe') + ' · ' + instante(ev.em) + ': ' + (ev.texto || '') + (ev.notificou_cliente ? ' · Cliente avisado' : '');
          no('observacoes').appendChild(p);
        });
      }
      observacoes();
      if (!(d.anexos || []).length) no('fotos').textContent = 'Nenhuma foto anexada.';
      (d.anexos || []).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ph gi-cp-foto-anexo';
        var legenda = document.createElement('small'); legenda.textContent = a.nome || 'Foto'; b.appendChild(legenda);
        no('fotos').appendChild(b);
        function imagem(url) { var img = document.createElement('img'); img.alt = a.nome || 'Foto'; img.src = url; return img; }
        if (base64(a.miniatura_base64)) b.prepend(imagem('data:image/jpeg;base64,' + a.miniatura_base64));
        b.onclick = async function () {
          b.disabled = true; b.setAttribute('aria-busy', 'true');
          try {
            var r = a.origem === 'upload' ? await GI.chamadosAnexoArquivo(n, a.id) : await omni.chats.getFile(a.file_ref);
            if (!await atual(g, c) || !valido()) return;
            var url = a.origem === 'upload' && /^image\/(jpeg|png|webp|gif)$/.test(r.mimetype) && base64(r.dados_base64) ? 'data:' + r.mimetype + ';base64,' + r.dados_base64 : a.origem !== 'upload' && r.url;
            if (!url || !/^(https?:|data:image\/)/i.test(url)) throw new Error('Foto indisponível.');
            no('imagem').textContent = ''; no('imagem').appendChild(imagem(url)); no('foto-inteira').hidden = false; no('fechar-foto').focus();
          } catch (err) { if (valido()) recado('Não foi possível abrir a foto. ' + GI.mensagemErro(err), 'erro'); }
          finally { if (valido()) { b.disabled = false; b.removeAttribute('aria-busy'); } }
        };
      });
      no('fechar-foto').onclick = function () { no('foto-inteira').hidden = true; };
      if (no('nota-form')) {
        var confirmado = null, enviado = null, salvando = false;
        function mensagem(t, tipo) { if (valido()) { no('recado-nota').textContent = t; recado(t, tipo); } }
        no('nota-form').onsubmit = function (ev) {
          ev.preventDefault(); if (salvando) return;
          var texto = no('nota').value.trim(); if (!texto) { mensagem('Escreva uma nota antes de salvar.', 'erro'); no('nota').focus(); return; }
          if (no('avisar').checked) {
            confirmado = texto; no('aviso-texto').textContent = 'Enviar nesta conversa: ' + texto; no('confirmacao-nota').hidden = false;
          } else salvar(texto, false);
        };
        no('voltar-nota').onclick = function () { confirmado = null; no('confirmacao-nota').hidden = true; };
        no('confirmar-nota').onclick = function () {
          if (confirmado !== no('nota').value.trim() || !no('avisar').checked) { confirmado = null; no('confirmacao-nota').hidden = true; mensagem('A nota mudou. Revise o aviso novamente.', 'info'); return; }
          salvar(confirmado, true);
        };
        async function salvar(texto, avisar) {
          if (salvando || !escrita() || !valido()) return;
          salvando = true; no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = true; no('salvar-nota').textContent = 'Salvando nota…'; mensagem('Salvando nota…', 'info');
          try {
            if (!await atual(g, c) || !valido()) return;
            var falhaEnvio = '';
            if (avisar && enviado !== texto) {
              try {
                var aberto = await omni.chats.get(c.id);
                if (!await atual(g, c) || !valido()) return;
                if (!GI.chatAberto(aberto, c.contactId)) throw new Error('Esta conversa não está mais aberta.');
                var r = await omni.chats.sendMessage(c.id, { text: texto });
                if (r && r.sent === true) enviado = texto;
                if (!await atual(g, c) || !valido()) return;
                if (enviado !== texto) throw new Error('O envio não foi confirmado.');
              } catch (err) {
                if (!valido()) return;
                falhaEnvio = err.code === 'forbidden' ? 'janela de 24 h fechou.' : GI.mensagemErro(err);
              }
            }
            if (!await atual(g, c) || !valido()) return;
            var salvo = await GI.chamadosNota(n, { texto: texto, notificou_cliente: avisar && enviado === texto });
            if (!await atual(g, c) || !valido()) return;
            d.eventos.push(salvo.evento); observacoes(); no('nota').value = ''; no('avisar').checked = false; no('confirmacao-nota').hidden = true; confirmado = enviado = null;
            mensagem(falhaEnvio ? (falhaEnvio === 'janela de 24 h fechou.' ? 'Nota salva. O cliente não foi avisado porque a janela de 24 h fechou.' : 'Nota salva para a equipe. Cliente não avisado: ' + falhaEnvio) : 'Nota salva' + (avisar ? ' e cliente avisado.' : ' para a equipe.'), falhaEnvio ? 'erro' : 'sucesso');
            try {
              var relido = await GI.chamadosObter(n);
              if (!await atual(g, c) || !valido()) return;
              d = relido; observacoes();
            } catch (_) { mensagem('Nota salva. Não foi possível atualizar as observações; atualize o painel.' + (falhaEnvio ? ' Cliente não avisado: ' + falhaEnvio : ''), 'erro'); }
          } catch (err) { mensagem((enviado === texto ? 'Aviso enviado; ' : '') + 'não foi possível salvar a nota. Tente salvar novamente. ' + GI.mensagemErro(err), 'erro'); }
          finally { salvando = false; if (valido()) { no('salvar-nota').disabled = no('confirmar-nota').disabled = no('nota').disabled = no('avisar').disabled = false; no('salvar-nota').textContent = 'Salvar nota'; } }
        }
      }
      botao.disabled = false; botao.hidden = true;
    } catch (err) { if (valido()) { alvo.textContent = 'Não foi possível consultar. ' + GI.mensagemErro(err); recado(alvo.textContent, 'erro'); botao.disabled = false; } }
    finally { botao.removeAttribute('aria-busy'); }
    GI.ajustarAltura();
  }
  function renderImovel() {
    var l = locacao();
    $('cp-conteudo').innerHTML = '<div class="gi-cartao"><h2>' + e(rotuloImovel(l)) + '</h2>' + kv('Código', l.imovel_codigo || 'Fora do catálogo') + kv('Endereço', l.imovel_endereco) + kv('Bairro', l.imovel_bairro) + kv('Cidade', l.imovel_cidade) + kv('Contrato', l.contrato_numero) + kv('Início', data(l.inicio)) + kv('Fim', data(l.fim)) + kv('Aluguel', moeda(l.valor_aluguel_centavos)) + (l.contatos || []).map(function (c) { return kv(papel(c.papel), c.nome) + (c.telefone ? '<button type="button" class="btn btn-texto" data-copia-texto="' + e(c.telefone) + '">' + e(c.telefone) + ' ⧉</button>' : ''); }).join('') + '<div class="gi-cp-acoes">' + [l.imovel_codigo, l.imovel_endereco].filter(Boolean).map(function (t) { return '<button type="button" class="btn" data-copia-texto="' + e(t) + '">' + e(t) + ' ⧉</button>'; }).join('') + '</div></div>';
    document.querySelectorAll('[data-copia-texto]').forEach(function (b) { b.onclick = function () { copiarTexto(b.dataset.copiaTexto, b); }; });
  }
  function rascunho() {
    if (!formulario) formulario = { locacaoId: locacao() && locacao().id, titulo: '', descricao: '', categoria: 'hidraulica', prioridade: 'normal', disponibilidade: '', chaves: '', sem_cliente: false, anexos: [] };
    return formulario;
  }
  function validarImovelNovo() {
    if (!formulario || !formulario.locacaoId || locacoes.some(function (l) { return String(l.id) === String(formulario.locacaoId); })) return;
    formulario.locacaoId = null; formulario.imovelIndisponivel = true;
    selecionada = -1; novoSelecionado = false; confirmado = null;
  }
  function opcoesNovo() {
    return '<option value="">Escolha o imóvel</option>' + locacoes.map(function (l) { return '<option value="' + e(l.id) + '">' + e(rotuloImovel(l)) + '</option>'; }).join('');
  }
  function atualizarEscolhaNovo() {
    if (formulario && formulario.imovelIndisponivel && !$('cp-novo-imovel')) { renderNovo(); return; }
    var seletor = $('cp-novo-imovel');
    if (seletor) {
      seletor.innerHTML = opcoesNovo(); seletor.value = formulario && formulario.locacaoId ? String(formulario.locacaoId) : '';
      $('cp-novo-imovel-aviso').hidden = !(formulario && formulario.imovelIndisponivel);
    }
    if ($('cp-revisar')) $('cp-revisar').disabled = !formulario || !formulario.locacaoId;
    var tituloImovel = document.querySelector('.gi-cp-imovel-novo');
    if (tituloImovel && formulario && !formulario.locacaoId) tituloImovel.textContent = 'Escolha o imóvel';
  }
  function vinculo() { return '#' + id(chat.id) + ' · ' + (GI.textoOuNull(chat.protocol) || 'Sem protocolo') + ' · ' + GI.canalAtendimento(chat.channel); }
  function rotuloImovel(l) { return l.imovel_titulo + (l.contrato_numero ? ' · Contrato ' + l.contrato_numero : ''); }
  function ligarEscolhaNovo() {
    if (!$('cp-novo-imovel')) return;
    $('cp-novo-imovel').onchange = function () {
      novoSelecionado = this.value !== '';
      selecionada = locacoes.findIndex(function (l) { return String(l.id) === this.value; }, this);
      var f = rascunho(); f.locacaoId = locacao() && locacao().id; f.imovelIndisponivel = false;
      confirmado = null; cabecalho(); renderNovo();
    };
  }
  function renderNovo() {
    if (!escrita()) { aba = 'chamados'; renderChamados(); return; }
    var escolha = locacoes.length > 1 || formulario && formulario.imovelIndisponivel ? '<label class="gi-cp-form">Escolha o imóvel para o novo chamado<select id="cp-novo-imovel">' + opcoesNovo() + '</select><span id="cp-novo-imovel-aviso" role="status" hidden>O imóvel escolhido não está mais disponível. Escolha o imóvel de novo.</span></label>' : '';
    if (locacoes.length > 1 && !novoSelecionado && !formulario) { $('cp-conteudo').innerHTML = escolha; ligarEscolhaNovo(); return; }
    var f = rascunho();
    $('cp-conteudo').innerHTML = escolha + '<form id="cp-form" class="pc" novalidate><div class="fld"><span class="lbl">Atendimento</span><div class="inp"><span id="cp-vinculo"></span><span class="pill pill--done">vinculado</span></div><span class="hint">O chamado fica ligado a esta conversa.</span></div><div class="fld"><span class="lbl">Imóvel</span><div class="inp"><span class="gi-cp-imovel-novo">' + e(locacao() ? (locacoes.length > 1 ? rotuloImovel(locacao()) : locacao().imovel_titulo) : 'Escolha o imóvel') + '</span>' + icone('chev-d') + '</div><span class="hint">Locados deste contato.</span></div><div class="fld" role="group" aria-label="O que aconteceu?"><span class="lbl">O que aconteceu?</span><div class="chips">' + Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) { return '<button type="button" class="opt" data-categoria="' + c + '" aria-pressed="' + (f.categoria === c) + '">' + icone(valorMapa({ hidraulica: 'drop', eletrica: 'bolt', gas: 'flame', estrutura: 'brick', esquadrias: 'door', pintura: 'brush', chaveiro: 'key' }, c) || 'wrench') + e(c === 'outros' ? 'Outro' : valorMapa(GI.CHAMADO_CATEGORIAS, c)) + '</button>'; }).join('') + '</div></div><div class="fld" role="group" aria-label="Urgência"><span class="lbl">Urgência</span><div class="seg" style="margin:0">' + ['normal', 'alta', 'emergencia'].map(function (p) { return '<button type="button" data-prioridade="' + p + '" aria-pressed="' + (f.prioridade === p) + '">' + e(valorMapa(GI.CHAMADO_PRIORIDADES, p)) + '</button>'; }).join('') + '</div><span class="hint">Emergência avisa a equipe na hora: gás, vazamento forte, curto-circuito.</span></div><div class="fld"><label class="lbl" for="cp-descricao">Descrição</label><textarea class="inp inp--area" id="cp-descricao" maxlength="10000">' + e(f.descricao) + '</textarea><button type="button" class="pc__link" id="cp-ultima" style="margin:0">Usar última mensagem do cliente</button><p id="cp-ultima-recado" aria-live="polite"></p></div><div class="fld"><span class="lbl">Fotos</span><div id="cp-fotos" class="hint" aria-live="polite"></div></div><div class="fld cp-acesso"><label class="lbl" for="cp-disponibilidade">Quando dá para entrar</label><input class="inp" id="cp-disponibilidade" maxlength="500" value="' + e(f.disponibilidade) + '"><label class="chk"><input id="cp-sem-cliente" class="box" type="checkbox"' + (f.sem_cliente ? ' checked' : '') + '>Autoriza entrar sem o cliente</label><details id="cp-mais-detalhes" class="cp-acesso-extra"><summary aria-label="Chaves / acesso" title="Chaves / acesso">⋯</summary><div class="fld"><label class="lbl" for="cp-chaves">Chaves / acesso</label><input class="inp" id="cp-chaves" maxlength="500" value="' + e(f.chaves) + '"></div></details></div></form><button class="btn btn--primary btn--block" id="cp-revisar" form="cp-form" type="submit">Revisar e abrir chamado</button><p class="foot">Nada é gravado antes da confirmação.</p>';
    ligarEscolhaNovo(); atualizarEscolhaNovo();
    if (criacaoIncerta) $('cp-revisar').textContent = 'Conferir se abriu';
    $('cp-ultima').onclick = async function () {
      var g = geracao, c = chat, botao = this; botao.disabled = true;
      try {
        var msgs = demo() ? [{ direction: 'in', text: 'Relato sintético de manutenção.' }] : linhas(await omni.chats.getMessages(c.id, { limit: 20 }));
        if (!await atual(g, c) || !$('cp-descricao')) return;
        var recebidas = msgs.filter(function (m) { return m.direction === 'in' && typeof m.text === 'string' && m.text.trim() && !m.deleted && !m.fileRef; }).sort(function (a, b) { return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0); });
        if (recebidas.length) { f.descricao = recebidas[0].text.slice(0, 10000); $('cp-descricao').value = f.descricao; $('cp-descricao').focus(); }
        else $('cp-ultima-recado').textContent = 'Nenhuma mensagem do cliente nesta conversa.';
      } catch (_) { if (g === geracao && $('cp-ultima-recado')) $('cp-ultima-recado').textContent = 'Não foi possível ler as mensagens.'; }
      finally { if (botao.isConnected) botao.disabled = false; }
    };
    $('cp-vinculo').textContent = 'Este · #' + id(chat.id) + ' · ' + (GI.textoOuNull(chat.protocol) ? chat.protocol + ' · ' : '') + GI.canalAtendimento(chat.channel);
    ['descricao', 'disponibilidade', 'chaves'].forEach(function (k) { $('cp-' + k).oninput = function () { f[k] = this.value; }; });
    $('cp-sem-cliente').onchange = function () { f.sem_cliente = this.checked; };
    ['categoria', 'prioridade'].forEach(function (k) {
      document.querySelectorAll('[data-' + k + ']').forEach(function (b) { b.onclick = function () {
        f[k] = b.dataset[k]; document.querySelectorAll('[data-' + k + ']').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      }; });
    });
    $('cp-form').onsubmit = function (ev) {
      ev.preventDefault(); recado('', 'info');
      if (criacaoIncerta) return conferirCriacaoIncerta();
      if (!f.locacaoId || !locacao() || String(locacao().id) !== String(f.locacaoId)) return;
      f.titulo = GI.cockpit.tituloNovo(f.descricao, f.categoria); revisar();
    };
    renderFotos(); if (!fotosLidas) carregarFotos();
  }
  function miniaturasConfirmacao(refs) {
    return '<div class="gi-cp-miniaturas">' + refs.map(function (ref) {
      var p = previasFotos[ref];
      return p && p.estado === 'pronta' ? '<img src="' + e(p.url) + '" alt="Foto selecionada">' : '';
    }).join('') + '</div>';
  }
  function atualizarSelecaoFotos() {
    var f = rascunho();
    document.querySelectorAll('[data-foto]').forEach(function (b) { b.setAttribute('aria-checked', String(f.anexos.indexOf(b.dataset.foto) >= 0)); });
    $('cp-fotos-contador').textContent = f.anexos.length + ' foto(s) selecionada(s)';
  }
  function selecionarFoto(ref) {
    var f = rascunho(), i = f.anexos.indexOf(ref);
    if (i >= 0) { f.anexos.splice(i, 1); $('cp-fotos-aviso').textContent = ''; }
    else if (f.anexos.length < 20) f.anexos.push(ref);
    else $('cp-fotos-aviso').textContent = 'Máximo de 20 fotos por chamado.';
    atualizarSelecaoFotos();
  }
  function previaFoto(m) {
    var ref = String(m.fileRef);
    if (previasFotos[ref]) return previasFotos[ref];
    var p = { estado: 'carregando', url: '' }; previasFotos[ref] = p;
    p.promessa = GI.filaArquivos(function () { return omni.chats.getFile(ref); }).then(function (r) {
      if (!r || !r.url) throw new Error('Prévia indisponível');
      var url = new URL(r.url, location.href);
      if (!/^https?:$/.test(url.protocol) && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(r.url)) throw new Error('Prévia indisponível');
      p.url = url.href; p.estado = 'pronta';
    }).catch(function () { p.estado = 'falha'; });
    return p;
  }
  function desenharPrevia(b, m, p) {
    b.setAttribute('data-previa-estado', p.estado);
    var visual = b.querySelector('[data-previa]');
    visual.textContent = '';
    visual.className = p.estado === 'carregando' ? 'gi-cp-foto-visual gi-cp-esqueleto' : 'gi-cp-foto-visual';
    b.setAttribute('aria-busy', String(p.estado === 'carregando'));
    if (p.estado === 'pronta') {
      var img = document.createElement('img'); img.alt = m.fileName || 'Foto da conversa';
      img.onerror = function () { p.estado = 'falha'; if (b.isConnected) desenharPrevia(b, m, p); };
      img.src = p.url; visual.appendChild(img);
    } else visual.textContent = p.estado === 'falha' ? '▧ Prévia indisponível' : 'Carregando…';
  }
  function fecharAmpliacao() {
    if ($('cp-foto-ampliada')) $('cp-foto-ampliada').hidden = true;
    if (ampliacaoOrigem && ampliacaoOrigem.isConnected) ampliacaoOrigem.focus();
    ampliacaoOrigem = null;
  }
  function ampliarFoto(m, botao) {
    var p = previasFotos[String(m.fileRef)], alvo = $('cp-foto-grande');
    ampliacaoOrigem = botao; alvo.textContent = '';
    if (p && p.estado === 'pronta') {
      var img = document.createElement('img'); img.alt = m.fileName || 'Foto da conversa';
      img.onerror = function () { p.estado = 'falha'; alvo.textContent = 'Esta foto não tem prévia, mas será anexada.'; };
      img.src = p.url; alvo.appendChild(img);
    } else alvo.textContent = 'Esta foto não tem prévia, mas será anexada.';
    $('cp-foto-ampliada').hidden = false; $('cp-foto-fechar').focus();
  }
  function adicionarFotos(inicio, fim) {
    document.querySelector('.gi-cp-grade-fotos').insertAdjacentHTML('beforeend', fotos.slice(inicio, fim).map(function (m) {
      var ref = String(m.fileRef), nome = m.fileName || 'Foto da conversa';
      return '<div class="gi-cp-foto-tile"><button type="button" class="gi-cp-foto ph" role="checkbox" aria-checked="false" data-foto="' + e(ref) + '"><span data-previa class="gi-cp-foto-visual"></span><span class="gi-cp-foto-selo" aria-hidden="true">✓</span><small class="gi-cp-foto-legenda" title="' + e(nome) + '">' + e(nome) + '</small></button><button type="button" class="btn gi-cp-ampliar" aria-label="Ampliar foto" data-ampliar-foto="' + e(ref) + '">🔍</button></div>';
    }).join(''));
    var g = geracao;
    Array.prototype.slice.call(document.querySelectorAll('[data-foto]'), inicio).forEach(function (b, i) {
      var m = fotos[inicio + i], p = previaFoto(m);
      desenharPrevia(b, m, p);
      p.promessa.then(function () { if (g === geracao && b.isConnected) desenharPrevia(b, m, p); });
      b.onclick = function () { selecionarFoto(b.dataset.foto); };
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-ampliar-foto]'), inicio).forEach(function (b, i) { b.onclick = function () { ampliarFoto(fotos[inicio + i], b); }; });
  }
  function renderFotos() {
    if (!$('cp-fotos')) return;
    if (!fotos.length) { $('cp-fotos').textContent = fotosAviso || (fotosLidas ? 'Nenhuma foto nesta conversa. Anexe depois, na gestão.' : 'Carregando fotos…'); return; }
    $('cp-fotos').innerHTML = '<div class="gi-cp-acoes"><button type="button" class="btn" id="cp-fotos-todas">Selecionar todas</button><button type="button" class="btn" id="cp-fotos-limpar">Limpar seleção</button></div><p id="cp-fotos-contador" aria-live="polite"></p><p id="cp-fotos-aviso" role="alert"></p><div class="gi-cp-grade-fotos"></div>' + (limiteFotos < fotos.length ? '<button type="button" class="btn" id="cp-fotos-mais">Mostrar mais fotos</button>' : '') + '<div id="cp-foto-ampliada" role="dialog" aria-label="Foto ampliada" aria-modal="true" hidden><button type="button" class="btn" id="cp-foto-fechar">Fechar</button><div id="cp-foto-grande"></div></div>';
    adicionarFotos(0, limiteFotos);
    $('cp-foto-fechar').onclick = fecharAmpliacao;
    $('cp-fotos-todas').onclick = function () {
      var f = rascunho(), excedeu = false;
      fotos.slice(0, limiteFotos).forEach(function (m) {
        var ref = String(m.fileRef);
        if (f.anexos.indexOf(ref) >= 0) return;
        if (f.anexos.length < 20) f.anexos.push(ref); else excedeu = true;
      });
      $('cp-fotos-aviso').textContent = excedeu ? 'Máximo de 20 fotos por chamado.' : '';
      atualizarSelecaoFotos();
    };
    $('cp-fotos-limpar').onclick = function () { rascunho().anexos = []; $('cp-fotos-aviso').textContent = ''; atualizarSelecaoFotos(); };
    if ($('cp-fotos-mais')) $('cp-fotos-mais').onclick = function () {
      var inicio = limiteFotos;
      limiteFotos += 12; adicionarFotos(inicio, limiteFotos); atualizarSelecaoFotos();
      document.querySelectorAll('[data-foto]')[inicio].focus();
      if (limiteFotos >= fotos.length) $('cp-fotos-mais').remove();
    };
    atualizarSelecaoFotos();
  }
  async function carregarFotos() {
    var g = geracao, c = chat;
    fotosLidas = true;
    try {
      if (!leituraFotos) leituraFotos = { concluida: false, promessa: demo() ? Promise.resolve([]) : Promise.resolve().then(function () { return omni.chats.getMessages(c.id, { limit: 50 }); }) };
      var leitura = leituraFotos, r = await leitura.promessa; leitura.concluida = true;
      if (!await atual(g, c)) return;
      var vistos = Object.create(null);
      fotos = linhas(r).filter(function (m) { return m.fileRef && /^image\//.test(m.mimetype || '') && !m.deleted && !m.viewOnce; }).sort(function (a, b) { return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0); }).filter(function (m) {
        var ref = String(m.fileRef); if (Object.hasOwn(vistos, ref)) return false; vistos[ref] = true; return true;
      });
    } catch (_) { if (g !== geracao) return; fotosAviso = 'Fotos indisponíveis. Atualize o painel para tentar novamente.'; recado(fotosAviso, 'erro'); }
    if (g === geracao && aba === 'novo' && !confirmado) renderFotos();
  }
  function revisar() {
    confirmado = { geracao: geracao, chat: chat, locacao: locacao(), contato: contato, dados: JSON.parse(JSON.stringify(rascunho())) };
    var f = confirmado.dados;
    $('cp-cabecalho').hidden = true; $('cp-abas').hidden = true;
    $('cp-conteudo').innerHTML = '<div class="pc"><h4 id="cp-confirmacao-titulo" tabindex="-1">Confirme antes de abrir</h4>' + kv('Cliente', contato.name) + '<div class="kv" data-kv="Imóvel"><span class="k">Imóvel</span><span class="v gi-cp-imovel-novo">' + e(locacoes.length > 1 ? rotuloImovel(locacao()) : locacao().imovel_titulo) + '</span></div>' + kv('Atendimento', '#' + id(chat.id) + ' · este') + kv('Categoria', valorMapa(GI.CHAMADO_CATEGORIAS, f.categoria)) + '<div class="kv"><span class="k">Urgência</span><span class="v"><span class="pill pill--mute">' + icone('flag') + e(valorMapa(GI.CHAMADO_PRIORIDADES, f.prioridade)) + '</span></span></div>' + kv('Fotos', f.anexos.length ? f.anexos.length + ' foto(s)' : 'nenhuma') + miniaturasConfirmacao(f.anexos) + '<div class="kv" data-kv="Prazo de solução" id="cp-prazo" hidden><span class="k">Prazo de solução</span><span class="v"></span></div><label class="chk" style="margin-top:8px"><span class="box cp-checkbox"><input type="checkbox" id="cp-conferencia" checked>' + icone('check') + '</span>Conferi os dados com o cliente</label><details class="cp-extras cp-confirm-extra"><summary aria-label="Descrição e acesso" title="Descrição e acesso">⋯</summary>' + kv('Título', f.titulo) + kv('Descrição', f.descricao) + kv('Vínculo', vinculo()) + dado('Contrato', locacao().contrato_numero) + kv('Acesso', f.disponibilidade) + kv('Sem o cliente', f.sem_cliente ? 'Autorizado' : 'Não autorizado') + kv('Chaves', f.chaves) + '</details></div><div class="btns" style="margin:0"><button type="button" class="btn" id="cp-voltar">Voltar e editar</button><button type="button" class="btn btn--primary" id="cp-confirmar">Abrir chamado</button></div>';
    var revisao = confirmado, prazo = $('cp-prazo');
    if (!demo() && GI.modo === 'portal') GI.manutencaoConfig().then(function (cfg) {
      if (confirmado !== revisao || revisao.geracao !== geracao || !prazo.isConnected) return;
      var sla = cfg && cfg.sla && valorMapa(cfg.sla, f.prioridade), horas = sla && Number(sla.solucao_h);
      if (!Number.isFinite(horas) || horas <= 0 || Math.floor(horas) !== horas) return;
      var dias = horas / 24;
      prazo.querySelector('.v').textContent = horas % 24 === 0 ? dias + (dias === 1 ? ' dia' : ' dias') : horas + (horas === 1 ? ' hora' : ' horas');
      prazo.hidden = false;
    }).catch(function () { /* Sem configuração legível, não inventar um prazo. */ });
    $('cp-voltar').onclick = function () { confirmado = null; $('cp-cabecalho').hidden = false; $('cp-abas').hidden = false; renderNovo(); $('cp-descricao').focus(); };
    $('cp-conferencia').onchange = function () { $('cp-confirmar').disabled = !this.checked; };
    $('cp-confirmar').onclick = salvar;
    if (criacaoIncerta) $('cp-confirmar').textContent = 'Conferir se abriu';
    $('cp-confirmacao-titulo').focus();
  }
  async function salvar() {
    if (criacaoIncerta) { await conferirCriacaoIncerta(); return; }
    var plano = confirmado;
    if (!plano || gravando || !escrita() || !$('cp-conferencia') || !$('cp-conferencia').checked) return;
    gravando = true; $('cp-confirmar').textContent = 'Abrindo chamado…'; $('cp-confirmar').disabled = true; $('cp-voltar').disabled = true; recado('Abrindo chamado…', 'info');
    var g = plano.geracao, c = plano.chat, f = plano.dados, operacaoCriacao;
    try {
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.', 'info'); }
        return;
      }
      var u = demo() ? { id: 9990, name: 'Agente Demonstração' } : await omni.session.getUser();
      if (u && !String(u.name || '').trim()) await GI.usuarios();
      if (!await atual(g, c)) {
        if (g === geracao && $('cp-confirmar')) { $('cp-confirmar').disabled = false; $('cp-voltar').disabled = false; recado('O atendimento mudou; revise de novo.', 'info'); }
        return;
      }
      if (!u || !id(u.id)) throw new Error('Usuário da sessão indisponível. Tente novamente.');
      var d = { locacao_id: plano.locacao.id, titulo: f.titulo.trim(), descricao: f.descricao, categoria: f.categoria, prioridade: f.prioridade,
        origem: 'atendimento', solicitante: { contato_id: GI.contatoEfetivo(c), nome: GI.nomeContato(plano.contato, c), telefone: GI.textoOuNull(plano.contato.phone) },
        atendente: { user_id: id(u.id), nome: GI.nomeDoUsuario(u) }, atendimento: GI.atendimentoPortal(c, filasConhecidas),
        acesso: { disponibilidade: f.disponibilidade, sem_cliente: f.sem_cliente, chaves: f.chaves },
        anexos: f.anexos.map(function (ref) { var m = fotos.find(function (foto) { return String(foto.fileRef) === ref; }); return { file_ref: String(m.fileRef), nome: m.fileName, mimetype: m.mimetype, origem: 'atendimento' }; }) };
      var r;
      if (demo()) { r = { chamado: Object.assign({}, d, { id: 9001, numero: 9001, status: 'novo', sla: {} }) }; chamados.unshift(r.chamado); }
      else {
        operacaoCriacao = { chatId: id(c.id), chatContactId: id(c.contactId), contatoId: GI.contatoEfetivo(c), locacaoId: id(d.locacao_id), titulo: d.titulo, inicio: Date.now() };
        r = await GI.chamadosCriarSeguro(d);
      }
      criacaoIncerta = null;
      if (!await atual(g, c)) return;
      // POST confirmado: mesmo se a releitura falhar, nunca reapresentar o botão de gravar.
      confirmado = null; formulario = null;
      $('cp-cabecalho').hidden = true; $('cp-abas').hidden = true;
      var protocoloCopiado = !demo() && copiar(r.chamado);
      $('cp-conteudo').innerHTML = '<div class="ok" id="cp-sucesso" role="status">' + icone('check') + '<div><h2 tabindex="-1">' + e(GI.chamadoNumero(r.chamado.numero)) + ' aberta</h2><p>' + (demo() ? 'Demonstração: chamado sintético, sem gravação.' : (protocoloCopiado ? 'Protocolo copiado. ' : '') + 'A equipe vê o chamado com o status Novo.') + '</p></div></div><div class="btns" style="margin:0"><button class="btn" type="button" id="cp-ver-gestao">Ver na gestão</button><button class="btn btn--icon" type="button" id="cp-copiar-sucesso" aria-label="Copiar protocolo" title="Copiar protocolo">' + icone('copy') + '</button></div><details class="cp-extras cp-result-extra"><summary aria-label="Mais ações" title="Mais ações">⋯</summary><div class="gi-cp-acoes btns">' + (administrador ? '<button class="btn" type="button" data-lista-completa>Lista completa</button>' : '') + '<button class="btn" type="button" id="cp-copiar-os">Copiar nº da O.S.</button><button class="btn" type="button" id="cp-resumo-sucesso">Copiar resumo</button><button class="btn" type="button" id="cp-lista-sucesso">Voltar à lista</button></div></details>';
      $('cp-copiar-os').onclick = function () { copiarTexto(GI.chamadoNumero(r.chamado.numero), this); };
      $('cp-resumo-sucesso').onclick = function () { copiarTexto(resumoTexto(r.chamado), this); };
      $('cp-lista-sucesso').onclick = function () { mudarAba('chamados'); };
      ligarListaCompleta();
      if ($('cp-ver-gestao')) $('cp-ver-gestao').onclick = function () { abrirGestao(r.chamado); };
      $('cp-copiar-sucesso').onclick = function () { copiar(r.chamado); };
      recado(GI.chamadoNumero(r.chamado.numero) + ' aberta ✓', 'sucesso'); document.querySelector('#cp-sucesso h2').focus();
      try {
        var inicioLeitura = Date.now();
        var l = demo() ? { rows: locacoes } : await GI.chamarPortal('/contatos/' + GI.contatoEfetivo(c) + '/locacoes');
        if (!await atual(g, c)) return;
        var ch = demo() ? { rows: chamados } : await GI.chamadosPorContato(GI.contatoEfetivo(c));
        if (!await atual(g, c)) return;
        locacoes = linhas(l); chamados = linhas(ch); aplicarLeitura(dadosObtidosEm(c, inicioLeitura)); atualizadoEm = Date.now(); cabecalho();
      } catch (_) { if (g === geracao) recado('Chamado aberto. Não foi possível atualizar a lista; consulte novamente.', 'erro'); }
    } catch (err) {
      if (g === geracao) {
        recado(err.criacaoAusente ? 'Não consegui falar com o servidor. O chamado não foi aberto. Confira sua conexão e tente de novo.' : GI.mensagemErro(err), 'erro');
        if ($('cp-confirmar')) {
          if (err.criacaoIncerta) {
            criacaoIncerta = operacaoCriacao;
            $('cp-confirmar').disabled = false; $('cp-confirmar').textContent = 'Conferir se abriu'; $('cp-confirmar').onclick = conferirCriacaoIncerta;
            $('cp-voltar').disabled = false;
          } else { $('cp-confirmar').disabled = false; $('cp-confirmar').textContent = 'Tentar de novo'; $('cp-confirmar').onclick = salvar; $('cp-voltar').disabled = false; }
        }
      }
    } finally { if (g === geracao) gravando = false; }
  }
  async function conferirCriacaoIncerta() {
    if (!criacaoIncerta || gravando || GI.modo !== 'portal') return;
    var incerta = criacaoIncerta, g = geracao, contexto = { id: incerta.chatId, contactId: incerta.chatContactId || incerta.contatoId };
    if (!await atual(g, contexto) || criacaoIncerta !== incerta || gravando) return;
    gravando = true;
    var botao = $('cp-confirmar') || $('cp-revisar');
    if (botao) { botao.disabled = true; botao.textContent = 'Conferindo…'; }
    try {
      var resposta = await GI.chamadosPorContato(incerta.contatoId);
      if (!await atual(g, contexto) || criacaoIncerta !== incerta) return;
      var encontrado = GI.reconciliarCriacao(linhas(resposta), incerta);
      if (encontrado) {
        criacaoIncerta = null; confirmado = null;
        if (botao) { botao.disabled = true; botao.textContent = GI.chamadoNumero(encontrado.numero) + ' aberta ✓'; }
        recado(GI.chamadoNumero(encontrado.numero) + ' aberta ✓', 'sucesso');
      } else {
        criacaoIncerta = null;
        if (botao) { botao.disabled = false; botao.textContent = 'Tentar de novo'; if (botao.id === 'cp-confirmar') botao.onclick = salvar; }
        recado('Não consegui falar com o servidor. O chamado não foi aberto. Confira sua conexão e tente de novo.', 'erro');
      }
    } catch (_) {
      if (g !== geracao || criacaoIncerta !== incerta) return;
      if (botao) { botao.disabled = false; botao.textContent = 'Conferir se abriu'; }
      recado('Não foi possível conferir. Tente de novo.', 'erro');
    } finally { if (g === geracao) gravando = false; }
  }
  function ligarListaCompleta() {
    document.querySelectorAll('[data-lista-completa]').forEach(function (b) {
      b.onclick = function () { if (administrador) Promise.resolve().then(function () { return omni.ui.openContribution('gi-chamados'); }).catch(function () { recado('Não foi possível abrir a lista completa.', 'erro'); }); };
    });
  }
  function abrirGestao(c) {
    var g = geracao, l = locacao(), params = { chatId: id(chat && chat.id), nome: contato && contato.name, chamadoId: id(c.id), contatoId: GI.contatoEfetivo(chat) || id(contato && contato.id), locacaoId: id(c.locacao_id || l && l.id) };
    Promise.resolve().then(function () {
      return omni.storage.set('gi-os-alvo', { chatId: params.chatId, nome: params.nome, chamadoId: params.chamadoId, contatoId: params.contatoId, em: Date.now() });
    }).catch(function () { /* Os parâmetros continuam disponíveis se o storage falhar. */ }).then(function () {
      if (g !== geracao) return;
      return omni.ui.openContribution('gi-os', params);
    }).catch(function () { if (g === geracao) recado('Não foi possível abrir a gestão deste chamado. Atualize a extensão e tente de novo.', 'erro'); });
  }
  function copiar(c) { return copiarTexto(c.atendimento && c.atendimento.protocolo || GI.chamadoNumero(c.numero)); }
  function copiarTexto(texto, botao) {
    var foco = document.activeElement, campo = document.createElement('textarea');
    campo.value = String(texto); campo.style.position = 'fixed'; campo.style.opacity = '0'; campo.setAttribute('aria-label', 'Texto para copiar'); document.body.appendChild(campo); campo.select();
    var copiado = false;
    try { copiado = document.execCommand('copy'); } catch (_) { /* O host pode negar cópia. */ }
    campo.remove(); if (foco && foco.isConnected) foco.focus();
    if (copiado) { if (botao) botao.textContent = '✓ Copiado'; recado('Copiado.', 'sucesso'); }
    else recado('Selecione para copiar: ' + texto, 'info');
    return copiado;
  }
  function mudarAba(nova) { if (editando) { solicitarSaidaEdicao(function () { mudarAba(nova); }); return; } if (gravando || nova === 'novo' && !escrita()) return; if (nova === 'novo' && !formulario) novoSelecionado = false; aba = nova; confirmado = null; recado('', 'info'); render(); }
  $('cp-abas').onclick = function (ev) { var b = ev.target.closest('[data-aba]'); if (b) mudarAba(b.dataset.aba); };
  $('cp-abas').onkeydown = function (ev) {
    var botoes = Array.from(document.querySelectorAll('[data-aba]')), i = botoes.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault(); var n = ev.key === 'Home' ? 0 : ev.key === 'End' ? 2 : (i + (ev.key === 'ArrowRight' ? 1 : 2)) % 3;
    mudarAba(botoes[n].dataset.aba); botoes[n].focus();
  };
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab' && $('cp-foto-ampliada') && !$('cp-foto-ampliada').hidden) { ev.preventDefault(); $('cp-foto-fechar').focus(); return; }
    if (ev.key === 'Enter' && ev.target.matches('[data-cancelar-motivo]')) { ev.preventDefault(); ev.target.closest('[data-cancelar-caixa]').querySelector('[data-cancelar-confirmar]').click(); return; }
    if (ev.key === 'Enter' && ev.target.matches('[data-rapida="visita"]')) { ev.preventDefault(); ev.target.dispatchEvent(new Event('change')); }
    if (ev.key === 'Escape' && pessoaAberta) { ev.preventDefault(); fecharPessoa(); $('cp-outra-pessoa').focus({ preventScroll: true }); return; }
    if (ev.key !== 'Escape' || gravando || ev.defaultPrevented) return;
    if ($('cp-foto-ampliada') && !$('cp-foto-ampliada').hidden) { ev.preventDefault(); fecharAmpliacao(); return; }
    if (editando) { ev.preventDefault(); solicitarSaidaEdicao(); return; }
    ev.preventDefault();
    var aberto = document.querySelector('[data-confirmacao-nota]:not([hidden])');
    if (aberto) { aberto.querySelector('[data-voltar-nota]').click(); return; }
    aberto = document.querySelector('[data-cancelar-caixa]:not([hidden]), [data-aviso-form]');
    if (aberto) { var voltar = aberto.querySelector('[data-cancelar-voltar], [data-aviso-voltar]'); if (voltar) voltar.click(); return; }
    if (confirmado && $('cp-voltar')) { $('cp-voltar').click(); return; }
    if (residencia) { residencia = null; render(); return; }
    if (aba === 'novo' || aba === 'imovel') { mudarAba('chamados'); return; }
    aberto = document.querySelector('details[data-chamado][open]');
    if (aberto) { aberto.open = false; aberto.querySelector('summary').focus(); }
  });
  $('cp-imovel').onchange = function () {
    if (editando) { var sel = this, valor = this.value; this.value = locacao() ? String(locacao().id) : ''; solicitarSaidaEdicao(function () { sel.value = valor; sel.onchange(); }); return; }
    if (gravando) { this.value = locacao() ? String(locacao().id) : ''; return; }
    selecionada = locacoes.findIndex(function (l) { return String(l.id) === this.value; }, this);
    if (formulario) { formulario.locacaoId = locacao() && locacao().id; formulario.imovelIndisponivel = false; novoSelecionado = selecionada >= 0; }
    confirmado = null; cabecalho(); render();
  };
  $('cp-atualizar').onclick = function () {
    if (editando) { solicitarSaidaEdicao(function () { $('cp-atualizar').click(); }); return; }
    if (gravando || Date.now() - ultimaAtualizacao < 5000) return;
    ultimaAtualizacao = Date.now(); this.disabled = true; this.title = 'Aguarde 5 segundos entre atualizações';
    $('cp-idade').textContent = 'Aguarde 5 segundos entre atualizações';
    atualizarTimer = setTimeout(function () { $('cp-atualizar').disabled = false; $('cp-atualizar').title = 'Atualizar consulta'; }, 5000);
    iniciar(true);
  };
  function trocarChat() {
    ++geracao; clearTimeout(temporizador); limpar(); estado('Carregando atendimento selecionado…');
    temporizador = setTimeout(iniciar, 400);
  }
  var desassinar, desassinarDestroy, destruido = false;
  function destruir() {
    if (destruido) return;
    destruido = true; fecharPessoa(); pararVerificacao(); ++geracao; clearTimeout(temporizador); clearTimeout(timerResidencia); clearTimeout(inicioTimer); clearTimeout(atualizarTimer); ++buscaResidencia; observer.disconnect(); fixo = true;
    if (typeof desassinar === 'function') desassinar();
    if (typeof desassinarDestroy === 'function') desassinarDestroy();
  }
  inicioTimer = setTimeout(falhaPainel, 20000);
  GI.pronto(function () {
    if (destruido) return;
    GI.manutencaoMostrarModo();
    if (demo()) $('gi-modo').textContent = 'DEMONSTRAÇÃO · dados sintéticos · sem rede nem gravação no portal.';
    if (window.omni && omni.on) {
      desassinar = omni.on('omniChatSelected', trocarChat);
      desassinarDestroy = omni.on('destroy', destruir);
    }
    if (!demo() && omni.queues && omni.queues.list) Promise.resolve().then(function () { return omni.queues.list(); }).then(function (r) { filasConhecidas = linhas(r); }).catch(function () {});
    return iniciar();
  });
  window.addEventListener('pagehide', destruir);
})();
