/* Edição única para a lista administrativa e para o diálogo da O.S. */
(function () {
  'use strict';
  GI.criarChamadoForm = function (op) {
    op = op || {};
    var e = GI.escapar, el = function (id) { return document.getElementById(id); };
    var filaStatus = Promise.resolve(), gravandoStatus = Object.create(null), atualizarModalStatus = null;
    var carregar = op.carregar || function () { return Promise.resolve(); };
    var atualizarLinha = op.atualizarLinha || function () {};
    var apresentar = op.apresentar || GI.modal;
    function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
    function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
    function idValido(v) { var n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
    function data(v) {
      var s = String(v || '');
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s)) ? GI.dataHora(s) : '—';
    }
    function opcoes(mapa, atual) {
      return Object.keys(mapa).map(function (k) { return '<option value="' + e(k) + '"' + (k === atual ? ' selected' : '') + '>' + e(mapa[k]) + '</option>'; }).join('');
    }
    function status(c) {
      return '<span class="gi-estado ' + (valorMapa(GI.CHAMADO_STATUS_CLASSES, c.status) || 'gi-estado-off') + '"><span class="gi-ponto"></span>' + e(valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado') + '</span>';
    }
    function erro(err) { return GI.mensagemErro(err); }
    function sdk(grupo, metodo, args) {
      return Promise.resolve().then(function () {
        if (!window.omni || !omni[grupo] || !omni[grupo][metodo]) throw new Error('Recurso indisponível: ' + grupo + '.' + metodo);
        return grupo === 'chats' && metodo === 'getFile' ? GI.filaArquivos(function () { return omni[grupo][metodo].apply(omni[grupo], args || []); }) : omni[grupo][metodo].apply(omni[grupo], args || []);
      });
    }
    function controleStatus(c, modal) {
      var conhecido = Object.hasOwn(GI.CHAMADO_STATUS, c.status), bloqueado = GI.modo !== 'portal';
      return '<div data-status-controle="' + e(c.id) + '"' + (modal ? ' id="c-status-controle"' : '') + '>' +
        (modal ? '<label for="c-status">Status</label>' : '') +
        '<select data-status-id="' + e(c.id) + '"' + (modal ? ' id="c-status"' : '') + ' aria-label="Status de ' + e(GI.chamadoNumero(c.numero)) + '" class="gi-status-select gi-estado ' +
        (valorMapa(GI.CHAMADO_STATUS_CLASSES, c.status) || 'gi-estado-off') + '"' + (bloqueado || gravandoStatus[c.id] ? ' disabled' : '') + '>' +
        (!conhecido ? '<option value="' + e(c.status) + '" selected>Não informado</option>' : '') + opcoes(GI.statusDisponiveis(c.status), c.status) + '</select>' +
        '<p class="gi-ajuda" data-status-mensagem role="status" aria-live="polite">' + (bloqueado ? 'Manutenção exige o portal conectado.' : terminal(c) ? 'Reabrir volta o chamado para Triagem.' : '') + '</p>' +
        (modal ? '<button type="button" class="btn btn-slim" data-status-decisao hidden>Registrar decisão</button>' : '') +
        '<div data-status-cancelamento hidden><strong>Cancelar este chamado?</strong><label>Motivo (opcional)<input data-status-motivo maxlength="500"></label>' +
        '<div class="gi-barra"><button type="button" class="btn btn-slim btn-perigo" data-status-confirmar>Cancelar chamado</button>' +
        '<button type="button" class="btn btn-slim" data-status-voltar>Voltar</button></div></div></div>';
    }
    function bloquearStatus(id, valor) {
      document.querySelectorAll('[data-status-id="' + idValido(id) + '"]').forEach(function (s) { s.disabled = valor || GI.modo !== 'portal'; });
      var editar = el('gi-corpo') && el('gi-corpo').querySelector('[data-editar="' + idValido(id) + '"]');
      var cancelarBotao = editar && editar.closest('tr').querySelector('[data-cancelar-chamado]');
      if (cancelarBotao) cancelarBotao.disabled = valor || GI.modo !== 'portal';
    }
    function mudarStatus(c, destino, motivo) {
      if (GI.modo !== 'portal') return Promise.reject(new Error('Manutenção exige o portal conectado.'));
      if (gravandoStatus[c.id]) return Promise.reject(new Error('Aguarde a gravação do status.'));
      gravandoStatus[c.id] = true; bloquearStatus(c.id, true);
      var tarefa = filaStatus.then(function () {
        return GI.chamadosStatus(c.id, destino, motivo).then(function (r) {
          // O portal já devolve a linha completa. Só reler se essa resposta vier incompleta.
          return r && r.chamado && r.chamado.id ? r.chamado : GI.chamadosObter(c.id).then(function (d) { return d.chamado; }).catch(function () {
            return carregar().then(function () {
              var lido = (op.itens ? op.itens() : []).find(function (item) { return String(item.id) === String(c.id); });
              if (!lido) throw new Error('Status gravado. Use Buscar para consultar o chamado atualizado.');
              return lido;
            });
          });
        }).then(function (atualizado) {
          atualizarLinha(atualizado);
          if (atualizarModalStatus) atualizarModalStatus(atualizado);
          return atualizado;
        });
      }).finally(function () { delete gravandoStatus[c.id]; bloquearStatus(c.id, false); });
      filaStatus = tarefa.catch(function () {});
      return tarefa;
    }
    function ligarControleStatus(raiz, obter, impedido) {
      var select = raiz.querySelector('select');
      var cancelarInline = raiz.querySelector('[data-status-cancelamento]'), decisao = raiz.querySelector('[data-status-decisao]');
      function recado(texto, tipo, aprovar) {
        GI.recado(texto, tipo || 'info');
        // Lista e modal recebem o mesmo aviso, mesmo após redesenhar a linha.
        document.querySelectorAll('[data-status-controle="' + idValido(obter().id) + '"]').forEach(function (atual) {
          atual.querySelector('[data-status-mensagem]').textContent = texto;
          var botao = atual.querySelector('[data-status-decisao]');
          if (botao) botao.hidden = !aprovar;
        });
      }
      function gravar(destino, motivo) {
        var c = obter();
        if (gravandoStatus[c.id] || impedido && impedido()) { select.value = c.status; return; }
        cancelarInline.hidden = true; recado('Gravando…', 'info');
        mudarStatus(c, destino, motivo).then(function (atual) {
          if (atual) recado(GI.chamadoNumero(c.numero) + ': ' + (valorMapa(GI.CHAMADO_STATUS, c.status) || 'Não informado') + ' → ' + (valorMapa(GI.CHAMADO_STATUS, atual.status) || 'Não informado'), 'sucesso');
        }).catch(function (err) {
          select.value = c.status;
          recado(erro(err).replace(/^\d+ · /, ''), 'erro', ['aprovacao_pendente', 'aprovacao_recusada'].includes(err.dados && err.dados.erro));
        });
      }
      select.onchange = function () {
        var c = obter(), destino = select.value;
        if (GI.modo !== 'portal') { select.value = c.status; bloquearStatus(c.id, false); recado('Manutenção exige o portal conectado.', 'erro'); return; }
        if (gravandoStatus[c.id] || impedido && impedido()) { select.value = c.status; return; }
        if (decisao) decisao.hidden = true;
        if (destino === c.status) { cancelarInline.hidden = true; return; }
        if (destino === 'cancelado') { cancelarInline.hidden = false; recado('', 'info'); raiz.querySelector('[data-status-motivo]').focus(); return; }
        gravar(destino);
      };
      raiz.querySelector('[data-status-voltar]').onclick = function () { select.value = obter().status; cancelarInline.hidden = true; };
      raiz.querySelector('[data-status-confirmar]').onclick = function () { gravar('cancelado', raiz.querySelector('[data-status-motivo]').value.trim()); };
      if (decisao) decisao.onclick = function () {
        el('c-mais').open = true; el('c-aprovacao').scrollIntoView({ block: 'nearest' });
      };
    }
    function terminal(c) { return c.status === 'concluido' || c.status === 'cancelado'; }
    function moeda(v) { return v != null && Number.isFinite(Number(v)) ? GI.dinheiro(Number(v)) : '—'; }
    function valorMonetario(v) { return GI.valorReais(v); }
    function dataLocal(v) {
      if (data(v) === '—') return '';
      var d = new Date(v);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    function instanteLocal(v) {
      if (!v) return null;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error('Informe uma data e hora válidas.');
      return new Date(v).toISOString();
    }
    function campo(id, rotulo, valor, tipo, extra) {
      return '<div class="gi-campo-caixa"><label for="c-' + id + '">' + rotulo + '</label><input id="c-' + id + '" type="' + (tipo || 'text') + '" value="' + e(valor || '') + '" ' + (extra || '') + '></div>';
    }
    function seletor(id, rotulo, mapa, valor) {
      return '<div class="gi-campo-caixa"><label for="c-' + id + '">' + rotulo + '</label><select id="c-' + id + '">' + opcoes(mapa, valor) + '</select></div>';
    }
    function atendimentoTexto(a) { return GI.atendimentoTexto(a); }
    function seletorAtendimento() {
      return '<div id="c-atendimentos" class="gi-lista-atend"></div><p id="c-atendimento-aviso" class="gi-ajuda" aria-live="polite"></p>';
    }
    function formulario(detalhe, restantes, avisoInicial, rascunhoNota) {
      var c = detalhe && detalhe.chamado || {}, editando = !!c.id, fechado = terminal(c), acesso = c.acesso || {};
      var contato = editando ? { id: c.solicitante.contato_id, name: c.solicitante.nome, phone: c.solicitante.telefone } : null;
      var usuariosCarregados = false, locacoes = [], usuarios = c.atendente ? [{ id: c.atendente.user_id, name: c.atendente.nome }] : [], atendimentos = [];
      var consultaAtendimentos = null, limiteAtendimentos = 10;
      var selecionado = c.atendimento || null, modoAtendimento = selecionado ? 'atual' : 'nenhum';
      var caixa, no, mudou = false, ocupado = false, versaoContato = 0, versaoFotos = 0, timerBusca, anexos = [], enviado = rascunhoNota && rascunhoNota.enviado || null;
      var avisoNotaFinal = '', fecharAposFotos = false, envioFotos = false, cancelarFotos = false, confirmarVolume = false, criacaoIncerta = false;
      var pendentes = restantes || [], retomada = null, fotosInteiras = {}, notaConfirmada = rascunhoNota && rascunhoNota.confirmada || null;
      var prestadores = [], configManutencao = null, envioProprietario = null, avisoAberto = false, versaoAviso = 0, timerPrestador, versaoPrestador = 0;
      var corpo = '<div class="gi-form-chamado"><div id="c-mensagem" class="gi-chamado-msg" role="alert" aria-live="polite"></div><button type="button" class="btn btn-slim" id="c-salvar-pendentes" hidden>Salvar dados pendentes</button>';
      if (editando) corpo += '<div class="gi-modal-imovel"><div class="gi-modal-imovel-titulo">' + e(c.titulo) + '</div><div class="gi-ajuda">' +
        e(GI.chamadoNumero(c.numero)) + ' · ' + e(c.imovel && c.imovel.titulo) + ' · ' + e(c.solicitante.nome) + ' · aberto em ' + e(data(c.criado_em)) + '</div></div>' +
        '<div id="c-cabecalho-status"><span id="c-selo">' + status(c) + '</span> <span id="c-prazo" class="gi-ajuda">' + e(GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + '</span></div>' +
        '<div id="c-faixa-aprovacao"></div>' + controleStatus(c, true);
      corpo += '<fieldset id="c-dados"' + (fechado ? ' disabled' : '') + '><div class="gi-secao"><strong>Cliente e imóvel</strong></div><div class="gi-grade-modal">' +
        campo('cliente', editando ? 'Cliente' : 'Cliente · buscar contato', contato && contato.name, 'search', editando ? 'readonly' : 'autocomplete="off" placeholder="Digite ao menos 2 caracteres"') +
        (editando ? campo('imovel', 'Imóvel locado', c.imovel && c.imovel.titulo, 'text', 'readonly') : '<div class="gi-campo-caixa"><label for="c-locacao">Imóvel locado</label><select id="c-locacao" disabled><option value="">Escolha um cliente</option></select></div>') +
        '</div><div id="c-contatos" class="gi-resultados" aria-live="polite"></div><div class="gi-grade-modal">' + campo('titulo', 'Título', c.titulo) +
        '<div class="gi-campo-caixa gi-campo-caixa--todo"><label for="c-descricao">Descrição</label><textarea id="c-descricao" rows="3">' + e(c.descricao) + '</textarea></div>' +
        seletor('prioridade', 'Prioridade', GI.CHAMADO_PRIORIDADES, c.prioridade || 'normal') + '</div>' +
        '<div class="gi-secao"><strong>Atendimento</strong></div><p id="c-vinculo">' + e(atendimentoTexto(c.atendimento)) + '</p>' +
        '<div class="gi-barra"><button type="button" class="btn btn-slim" id="c-trocar">Escolher atendimento</button><button type="button" class="btn btn-slim" id="c-tirar-vinculo">Tirar vínculo</button>' +
        (editando ? '<button type="button" class="btn btn-slim" id="c-abrir-atendimento"' + (!idValido(c.atendimento && c.atendimento.chat_id) ? ' disabled' : '') + '>Abrir atendimento</button>' : '') + '</div>' +
        '<div id="c-atendimento-unico" class="gi-aviso" hidden></div><div id="c-escolha-atendimento"' + (editando ? ' hidden' : '') + '>' + seletorAtendimento() + '</div>' +
        '</fieldset><fieldset id="c-fotos-edicao"' + (fechado ? ' disabled' : '') + '><div class="gi-secao"><strong>Fotos</strong><button class="btn btn-slim" type="button" id="c-carregar-fotos">Buscar fotos do chat</button><button class="btn btn-slim" type="button" id="c-buscar-pasta"' + (GI.modo !== 'portal' ? ' disabled title="Manutenção exige o portal conectado."' : '') + '>Buscar na pasta</button></div>' +
        '<button type="button" class="btn" id="c-cancelar-fotos" hidden>Cancelar fotos restantes</button><p id="c-cota-fotos" class="gi-ajuda"></p><input id="c-pasta" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>' +
        '<p class="gi-ajuda">Do computador: até 10 fotos por seleção e 20 pendentes, até 25 MB cada. Reduzidas antes de enviar ao portal.</p>' +
        '</fieldset><div id="c-fotos" class="gi-fotos" aria-live="polite"></div><div id="c-pendentes" class="gi-fotos" aria-live="polite" aria-label="Fotos do computador pendentes"></div>' +
        '<p id="c-fotos-erros" class="gi-chamado-msg" role="alert" aria-live="polite"></p>';
      if (editando) corpo += '<div id="c-orcamentos"></div><div class="gi-secao"><strong>Nota para a equipe</strong></div>' +
        '<div class="gi-campo-caixa"><label for="c-nota">Nota para a equipe</label><textarea id="c-nota" rows="3">' + e(rascunhoNota && rascunhoNota.texto || '') + '</textarea></div>' +
        '<label class="gi-nota-check"><input id="c-avisar" type="checkbox" disabled>Avisar o cliente neste atendimento</label><p id="c-aviso-dica" class="gi-ajuda">Escolha o atendimento acima para avisar o cliente.</p>' +
        '<button class="btn btn-slim" id="c-salvar-nota" type="button">Salvar nota</button>';
      corpo += '<div id="c-foto-ampliada" class="gi-foto-ampliada" hidden><button type="button" class="btn btn-slim" id="c-fechar-foto">Fechar foto</button><div id="c-foto-inteira"></div></div>' +
        '<div id="c-descarte" class="gi-confirmacao" hidden><strong id="c-descarte-texto"></strong><div class="gi-barra"><button type="button" class="btn" id="c-voltar-descarte">Voltar</button><button type="button" class="btn btn-perigo" id="c-descartar">Descartar</button></div></div>' +
        '<details id="c-mais"><summary>Mais opções</summary><fieldset id="c-dados-mais"' + (fechado ? ' disabled' : '') + '><div class="gi-grade-modal">' +
        seletor('categoria', 'Categoria', GI.CHAMADO_CATEGORIAS, c.categoria || 'outros') +
        campo('disponibilidade', 'Quando dá para entrar', acesso.disponibilidade) + seletor('sem-cliente', 'Entrar sem o cliente', { nao: 'Não', sim: 'Sim' }, acesso.sem_cliente ? 'sim' : 'nao') + campo('chaves', 'Onde estão as chaves', acesso.chaves) +
        '<div class="gi-campo-caixa"><label for="c-atendente">Atendente responsável</label><select id="c-atendente" disabled><option value="">Sem atendente</option></select></div>' +
        (editando ? seletor('quem-paga', 'Quem paga', { '': 'Não informado', proprietario: 'Proprietário', inquilino: 'Inquilino', imobiliaria: 'Imobiliária' }, c.quem_paga || '') +
          '<div id="c-valor-caixa"></div>' +
          seletor('repasse', 'Lançar no repasse', { nao: 'Não', sim: 'Sim' }, c.repasse ? 'sim' : 'nao') : '') + '</div></fieldset>' +
        (editando ? '<div id="c-visita"></div><div id="c-prestador"></div><div id="c-aprovacao"></div><div class="gi-secao"><strong>Histórico</strong></div><ul id="c-historico" class="gi-historico"></ul><p id="c-ultima" class="gi-ajuda">Última alteração: ' + e(data(c.atualizado_em)) + '</p>' : '') + '</details>' +
        '<div id="c-confirmacao" class="gi-confirmacao" hidden><strong>Confirmar envio</strong><p id="c-confirmacao-texto"></p><div class="gi-barra"><button class="btn" type="button" id="c-voltar">Voltar</button><button class="btn btn-primario" type="button" id="c-confirmar-acao">Enviar</button></div></div></div>';

      function mensagem(t, tipo) {
        if (!caixa || !caixa.isConnected) return;
        no('mensagem').textContent = t || '';
        tipo = tipo || 'info';
        var modal = caixa.closest('.gi-modal');
        modal.querySelector('.gi-modal-recado').textContent = t || '';
        GI.recado(t, tipo, modal.querySelector('[data-recado-form]'));
      }
      function guardado(fn, propagar) {
        if (ocupado || editando && gravandoStatus[c.id]) return Promise.resolve();
        mensagem('', 'info'); ocupado = true;
        var botoes = Array.from(caixa.closest('.gi-modal').querySelectorAll('button')).filter(function (b) { return !b.disabled && !b.matches('.gi-modal-x, [data-cancelar], #c-cancelar-fotos, #c-voltar-descarte, #c-descartar'); });
        var campos = Array.from(caixa.querySelectorAll('input, select, textarea')).filter(function (b) { return !b.disabled; });
        botoes.forEach(function (b) { b.disabled = true; });
        campos.forEach(function (b) { b.disabled = true; });
        return Promise.resolve().then(fn).catch(function (err) { mensagem(erro(err), 'erro'); if (propagar) throw err; }).finally(function () {
          ocupado = false; botoes.concat(campos).forEach(function (b) { b.disabled = false; });
          if (fecharAposFotos) { pendentes = []; setTimeout(function () { if (caixa.isConnected) caixa.closest('.gi-modal').querySelector('[data-cancelar]').click(); }, 0); }
          if (!caixa.isConnected) return;
          if (editando) { no('avisar').disabled = !avisoAberto; bloquearStatus(c.id, !!gravandoStatus[c.id]); }
          atualizarBotoesAtendimento();
        });
      }
      function historico(eventos) {
        no('historico').innerHTML = eventos.length ? eventos.slice().sort(function (a, b) { return String(a.em).localeCompare(String(b.em)) || numero(a.id) - numero(b.id); }).map(function (ev) {
          var d = ev.detalhe || {}, texto = ev.texto || (ev.tipo === 'status' ? 'Status: ' + (valorMapa(GI.CHAMADO_STATUS, d.de) || d.de || '') + ' → ' + (valorMapa(GI.CHAMADO_STATUS, d.para) || d.para || '') + (d.motivo ? ' · ' + d.motivo : '') :
            valorMapa({ criou: 'Chamado aberto', atualizou: 'Dados atualizados', vinculou_atendimento: 'Atendimento vinculado alterado', nota: 'Nota interna', anexo: 'Anexo incluído',
              orcamento: 'Orçamento · ' + (d.acao || 'registrado'), aprovacao: 'Aprovação · ' + (d.acao || d.status || 'atualizada'), prestador: 'Prestador alterado', sla: 'SLA · ' + (d.acao || 'atualizado') }, ev.tipo) || ev.tipo);
          return '<li><time class="gi-ajuda">' + e(data(ev.em)) + ' · ' + e(ev.autor) + '</time><p>' + e(texto) + '</p>' + (ev.notificou_cliente ? '<span class="gi-chip">Cliente avisado</span>' : '') + '</li>';
        }).join('') : '<li>Sem eventos.</li>';
      }
      function confirmarAcao(texto, fn) {
        mensagem('', 'info'); no('confirmacao').hidden = false; no('confirmacao-texto').textContent = texto;
        no('confirmar-acao').hidden = false;
        no('confirmar-acao').onclick = function executar() {
          if (!confirmarNotaPendente(executar)) return;
          guardado(function () { return fn().then(function () { no('confirmacao').hidden = true; }); });
        };
        no('confirmacao').scrollIntoView({ block: 'nearest' }); no('confirmar-acao').focus();
      }
      function atualizarFatia4() {
        return GI.chamadosObter(c.id).then(function (r) {
          if (!caixa.isConnected) return;
          detalhe = r; mudou = true; atualizarEstadoStatus(r.chamado);
          desenharValor();
          historico(r.eventos || []); no('ultima').textContent = 'Última alteração: ' + data(c.atualizado_em);
          desenharFatia4(); fotosSalvas(); atualizarLinha(c);
        }).catch(function (err) { throw new Error('Operação registrada; não repita sem consultar o chamado. A releitura falhou. ' + erro(err)); });
      }
      function acaoFatia4(fn, orcamento) {
        if (!confirmarNotaPendente(function () { acaoFatia4(fn, orcamento); })) return;
        return guardado(function () {
          if (fechado) throw new Error('Use Reabrir no Status para voltar à Triagem antes de alterar.');
          clearTimeout(timerPrestador); ++versaoPrestador;
          return aplicarPendentes({ semReleitura: true, orcamento: orcamento }).then(fn).then(function () { mudou = true; return atualizarFatia4(); }).then(function () { mensagem(avisoNotaFinal || 'Alteração salva.', avisoNotaFinal ? 'erro' : 'sucesso'); });
        });
      }
      function opcoesPrestadores(atual, vazio) {
        var lista = prestadores.filter(function (p) { return p.ativo || Number(p.id) === Number(atual); });
        if (atual && !lista.some(function (p) { return Number(p.id) === Number(atual); })) lista.push({ id: atual, nome: c.prestador && c.prestador.nome || 'Prestador vinculado', ativo: false });
        return '<option value="">' + vazio + '</option>' + lista.filter(function (p) { return idValido(p.id); }).map(function (p) {
          return '<option value="' + idValido(p.id) + '"' + (Number(p.id) === Number(atual) ? ' selected' : '') + '>' + e(p.nome) + (p.ativo ? '' : ' (inativo)') + '</option>';
        }).join('');
      }
      function desenharFaixaAprovacao() {
        var ap = c.aprovacao || {};
        no('faixa-aprovacao').innerHTML = ['pendente', 'recusada'].includes(ap.status) ? '<div class="gi-aviso">' +
          (ap.status === 'pendente' ? 'Aguardando o proprietário aprovar o orçamento.' : 'O proprietário recusou o orçamento.') +
          ' <button class="btn btn-slim" type="button" id="c-registrar-decisao">Registrar decisão</button></div>' : '';
        if (no('registrar-decisao')) no('registrar-decisao').onclick = function () { no('mais').open = true; no('aprovacao').scrollIntoView({ block: 'nearest' }); };
      }
      function atualizarEstadoStatus(atual) {
        if (!caixa.isConnected || String(c.id) !== String(atual.id)) return;
        c = atual; detalhe.chamado = c; fechado = terminal(c);
        no('status').innerHTML = opcoes(GI.statusDisponiveis(c.status), c.status);
        no('status').value = no('status-controle').querySelector('[data-status-cancelamento]').hidden ? c.status : 'cancelado';
        no('status').className = 'gi-status-select gi-estado ' + (valorMapa(GI.CHAMADO_STATUS_CLASSES, c.status) || 'gi-estado-off');
        no('selo').innerHTML = status(c); no('prazo').textContent = GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ');
        no('ultima').textContent = 'Última alteração: ' + data(c.atualizado_em);
        no('atendente').disabled = fechado || !usuariosCarregados;
        no('fotos').querySelectorAll('[data-foto]').forEach(function (b) { b.disabled = fechado; });
        ['dados', 'dados-mais', 'fotos-edicao'].forEach(function (id) { no(id).disabled = fechado; });
        ['orcamentos', 'prestador', 'visita', 'aprovacao'].forEach(function (id) {
          var grupo = no(id).querySelector('fieldset');
          if (grupo) grupo.disabled = fechado || id === 'aprovacao' && (!c.aprovacao || c.aprovacao.status === 'nao_necessaria');
        });
        desenharFaixaAprovacao(); desenharPendentes();
      }
      function orcamentoEscolhido() { return (detalhe.orcamentos || []).some(function (o) { return o.escolhido; }); }
      function desenharValor() {
        no('valor-caixa').innerHTML = orcamentoEscolhido() ? '<label>Valor estimado</label><p id="c-valor">' + e(moeda(c.valor_estimado_centavos)) + ' · definido pelo orçamento escolhido</p>' :
          campo('valor', 'Valor estimado (R$)', c.valor_estimado_centavos == null || !Number.isFinite(Number(c.valor_estimado_centavos)) ? '' : (Number(c.valor_estimado_centavos) / 100).toFixed(2), 'text', 'inputmode="decimal"');
      }
      function desenharFatia4() {
        clearTimeout(timerPrestador); ++versaoPrestador;
        var orcamentos = detalhe.orcamentos || [], ap = c.aprovacao || { status: 'nao_necessaria' }, visita = c.visita || {};
        var desabilitado = fechado ? ' disabled' : '';
        no('orcamentos').innerHTML = '<div class="gi-secao"><strong>Orçamentos</strong></div><fieldset class="gi-fatia4"' + desabilitado + '>' +
          (orcamentos.length ? orcamentos.map(function (o, i) {
            return '<div class="gi-orcamento"><strong>' + e(o.prestador_nome) + '</strong> · ' + e(o.valor_centavos == null ? 'sem valor' : moeda(o.valor_centavos)) +
              '<p>' + e(o.observacao) + '</p><div class="gi-barra">' + (o.escolhido ? '<span class="gi-chip">Escolhido</span>' : '<button class="btn btn-slim" type="button" data-escolher-orcamento="' + i + '">Escolher</button>') +
              '<button class="btn btn-slim btn-perigo" type="button" data-apagar-orcamento="' + i + '">Remover</button></div></div>';
          }).join('') : '<p class="gi-ajuda">Nenhum orçamento registrado.</p>') +
          '<div class="gi-grade-modal">' + campo('orc-nome', 'Prestador', '', 'text', 'list="c-prestador-sugestoes" autocomplete="off"') +
          '<datalist id="c-prestador-sugestoes"></datalist>' + campo('orc-valor', 'Valor (R$) · opcional', '', 'text', 'inputmode="decimal"') +
          '<div class="gi-campo-caixa gi-campo-caixa--todo"><label for="c-orc-observacao">Descrição</label><textarea id="c-orc-observacao" rows="3" placeholder="O que inclui, prazo, condições…"></textarea></div></div>' +
          '<button class="btn btn-slim" type="button" id="c-salvar-orcamento">Adicionar orçamento</button></fieldset>';
        desenharFaixaAprovacao();
        no('aprovacao').innerHTML = '<div class="gi-secao"><strong>Aprovação do proprietário</strong><span class="gi-chip">' + e(valorMapa({ nao_necessaria: 'Não necessária', pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' }, ap.status) || 'Não informada') + '</span></div>' +
          '<div class="gi-aviso"><span>Limite para aprovação: ' + e(configManutencao ? moeda(configManutencao.alcada_centavos) : 'não foi possível consultar') + '. ' +
          (ap.status === 'pendente' ? 'Aprovação pendente bloqueia Agendado e Em execução.' : ap.status === 'recusada' ? 'Orçamento recusado. Defina outra cotação ou registre nova decisão antes de prosseguir.' : 'O limite se aplica ao orçamento escolhido pago pelo proprietário.') + '</span>' +
          '<div class="gi-ajuda">Envio registrado em: ' + e(data(ap.enviada_em)) + ' · Resposta: ' + e(data(ap.resposta_em)) + ' · ' + e(ap.por || '') + ' · ' + e(ap.canal || '') + '</div><p class="gi-pequeno">' + e(ap.observacao || '') + '</p></div>' +
          '<fieldset class="gi-fatia4"' + (fechado || ap.status === 'nao_necessaria' ? ' disabled' : '') + '><div class="gi-grade-modal">' +
          '<div class="gi-campo-caixa"><label for="c-proprietario">Proprietário da locação</label><select id="c-proprietario">' +
          ((detalhe.locacao && detalhe.locacao.contatos || []).filter(function (p) { return p.papel === 'proprietario'; }).map(function (p, i) { return '<option value="' + i + '">' + e(p.nome) + (idValido(p.contato_id) ? '' : ' (sem vínculo)') + '</option>'; }).join('') || '<option value="">Sem proprietário cadastrado</option>') + '</select></div>' +
          campo('aprovacao-observacao', 'Observação (opcional)', '') +
          '</div><div class="gi-barra"><button class="btn btn-slim" type="button" id="c-enviar-proprietario">Enviar ao proprietário</button><button class="btn btn-slim" type="button" id="c-aprovar">Aprovado</button><button class="btn btn-slim btn-perigo" type="button" id="c-recusar">Recusado</button></div></fieldset>';
        no('prestador').innerHTML = '<div class="gi-secao"><strong>Prestador</strong></div><fieldset class="gi-fatia4"' + desabilitado + '><div class="gi-grade-modal"><div class="gi-campo-caixa"><label for="c-prestador-id">Prestador responsável</label><select id="c-prestador-id">' +
          opcoesPrestadores(c.prestador && c.prestador.id, 'Sem prestador') + '</select></div></div></fieldset>';
        no('visita').innerHTML = '<div class="gi-secao"><strong>Visita</strong><span class="gi-ajuda">obrigatória antes de mudar para Agendado</span></div><fieldset class="gi-fatia4"' + desabilitado + '><div class="gi-grade-modal">' +
          campo('visita-inicio', 'Início da visita', dataLocal(visita.inicio), 'datetime-local') + campo('visita-fim', 'Fim da visita (opcional)', dataLocal(visita.fim), 'datetime-local') +
          '</div><p class="gi-ajuda">Para remover a visita, deixe o início vazio e salve.</p></fieldset>';
        var ultimoTermoPrestador = '';
        no('orc-nome').oninput = function () {
          var termo = no('orc-nome').value.trim();
          if (termo === ultimoTermoPrestador) return;
          ultimoTermoPrestador = termo;
          clearTimeout(timerPrestador); var v = ++versaoPrestador;
          no('prestador-sugestoes').textContent = '';
          if (!termo) return;
          timerPrestador = setTimeout(function () {
            GI.prestadores({ busca: termo, ativo: 1, por_pagina: 8 }).then(function (r) {
              if (!caixa.isConnected || v !== versaoPrestador) return;
              var nomes = Object.create(null);
              no('prestador-sugestoes').innerHTML = (r.rows || []).filter(function (p) {
                var chave = GI.normalizarPrestador(p.nome); if (Object.hasOwn(nomes, chave)) return false; nomes[chave] = true; return true;
              }).map(function (p) { return '<option value="' + e(p.nome) + '"></option>'; }).join('');
            }).catch(function () { if (caixa.isConnected && v === versaoPrestador) mensagem('Não foi possível buscar sugestões. Você pode informar o nome livremente.', 'erro'); });
          }, 300);
        };
        no('salvar-orcamento').onclick = function () { acaoFatia4(function () {
          var nome = no('orc-nome').value.trim(), valor = no('orc-valor').value.trim();
          if (!nome) throw new Error('Informe o prestador do orçamento.');
          return GI.chamadosOrcamentoCriar(c.id, { prestador_nome: nome, valor_centavos: valor ? valorMonetario(valor) : null,
            observacao: no('orc-observacao').value.trim() || null });
        }, true); };
        no('orcamentos').querySelectorAll('[data-escolher-orcamento]').forEach(function (b) { b.onclick = function () {
          var o = orcamentos[Number(b.dataset.escolherOrcamento)];
          acaoFatia4(function () { return GI.chamadosOrcamentoEscolher(c.id, o.id).then(function (r) { envioProprietario = null; return r; }); }, true);
        }; });
        no('orcamentos').querySelectorAll('[data-apagar-orcamento]').forEach(function (b) { b.onclick = function () {
          if (!b.dataset.confirmar) { b.dataset.confirmar = '1'; b.textContent = 'Confirmar remoção?'; return; }
          var o = orcamentos[Number(b.dataset.apagarOrcamento)];
          acaoFatia4(function () { return GI.chamadosOrcamentoApagar(c.id, o.id); }, true);
        }; });
        ['aprovar', 'recusar'].forEach(function (id) { no(id).onclick = function () {
          var donos = (detalhe.locacao && detalhe.locacao.contatos || []).filter(function (p) { return p.papel === 'proprietario'; });
          var dono = donos[Number(no('proprietario').value)];
          var d = { acao: id === 'aprovar' ? 'aprovada' : 'recusada', por: dono && dono.nome || 'Proprietário', canal: 'WhatsApp', observacao: no('aprovacao-observacao').value.trim() };
          acaoFatia4(function () { return GI.chamadosAprovacao(c.id, d); });
        }; });
        no('enviar-proprietario').onclick = function prepararEnvio() {
          if (!confirmarNotaPendente(prepararEnvio)) return;
          return guardado(function () {
            return aplicarPendentes().then(function () {
              var escolhido = (detalhe.orcamentos || []).find(function (o) { return o.escolhido; });
              if (!escolhido) throw new Error('Escolha um orçamento antes de solicitar aprovação.');
              var donos = (detalhe.locacao && detalhe.locacao.contatos || []).filter(function (p) { return p.papel === 'proprietario'; });
              var dono = donos[Number(no('proprietario').value)];
              var texto = textoProprietario(escolhido);
              confirmarAcao('Solicitar aprovação de ' + (dono && dono.nome || 'proprietário não vinculado') + '?\n\n' + texto + '\n\nSó será enviado se houver atendimento aberto acessível deste proprietário. Caso contrário, será registrada uma nota interna.', function () {
                return aplicarPendentes().then(function () {
                  if (texto !== textoProprietario(escolhido)) throw new Error('Os dados mudaram. Clique em Enviar ao proprietário para revisar o texto atualizado.');
                  return solicitarAprovacao(dono, texto);
                });
              });
            });
          });
        };
      }
      function textoProprietario(escolhido) {
        return 'Solicitação de aprovação · ' + GI.chamadoNumero(c.numero) + '\nImóvel: ' + (c.imovel && c.imovel.titulo || '') + '\n' + c.titulo +
          '\nPrestador: ' + escolhido.prestador_nome + '\nValor: ' + moeda(escolhido.valor_centavos) + '\nPrazo: ' + (escolhido.prazo_dias == null ? 'não informado' : numero(escolhido.prazo_dias) + ' ' + GI.plural(numero(escolhido.prazo_dias), 'dia', 'dias')) +
          '\nVisita proposta: ' + data(escolhido.visita_em) + '\nVocê aprova este orçamento?';
      }
      function chatAberto(chat, contatoId) { return GI.chatAberto(chat, contatoId); }
      function localizarChatProprietario(contatoId) {
        if (!idValido(contatoId)) return Promise.resolve(null);
        return Promise.allSettled([sdk('chats', 'listMine'), sdk('chats', 'getSelected'), sdk('session', 'getPermissions')]).then(function (rs) {
          var chats = rs[0].status === 'fulfilled' && Array.isArray(rs[0].value) ? rs[0].value : [];
          if (rs[1].status === 'fulfilled' && rs[1].value) chats = chats.concat(rs[1].value);
          var perm = rs[2].status === 'fulfilled' && rs[2].value || {};
          var filas = Array.from(new Set(chats.map(function (a) { return idValido(a.queueId); }).filter(Boolean)));
          return (perm.isAdmin || perm.isSupervisor ? Promise.allSettled(filas.map(function (n) { return sdk('chats', 'listByQueue', [n]); })) : Promise.resolve([])).then(function (filasRs) {
            filasRs.forEach(function (r) { if (r.status === 'fulfilled' && Array.isArray(r.value)) chats = chats.concat(r.value); });
            return chats.find(function (a) { return chatAberto(a, contatoId); }) || null;
          });
        });
      }
      function solicitarAprovacao(dono, texto) {
        var contatoId = dono && idValido(dono.contato_id), chave = String(contatoId) + '\n' + texto;
        if (envioProprietario && envioProprietario.chave === chave && envioProprietario.registrado) { mensagem('Solicitação já registrada nesta edição. Consulte o histórico antes de repetir.', 'info'); return Promise.resolve(); }
        if (!envioProprietario || envioProprietario.chave !== chave) envioProprietario = { chave: chave, enviado: false, registrado: false };
        var estado = envioProprietario;
        return (estado.enviado ? Promise.resolve({ id: estado.chatId }) : localizarChatProprietario(contatoId)).then(function (chat) {
          if (!chat) {
            var aviso = 'Solicitação de aprovação registrada internamente. Mensagem não enviada: ' + (contatoId ? 'nenhum atendimento aberto acessível do proprietário foi localizado.' : 'proprietário sem contato vinculado.') + ' Vincule o contato e abra o atendimento, ou contate o proprietário por outro canal e registre a resposta.';
            return GI.chamadosNota(c.id, { texto: aviso + '\n' + texto, notificou_cliente: false }).then(function () { estado.registrado = true; return aviso; });
          }
          return (estado.enviado ? Promise.resolve() : sdk('chats', 'get', [chat.id]).then(function (atual) {
            if (!chatAberto(atual, contatoId)) throw new Error('O atendimento não está mais aberto para este proprietário. Nenhuma mensagem foi enviada.');
            return sdk('chats', 'sendMessage', [atual.id, { text: texto }]);
          }).then(function (r) {
            if (!r || r.sent !== true) throw new Error('O SDK não confirmou o envio. Confira o atendimento antes de repetir.');
            estado.enviado = true; estado.chatId = chat.id;
          })).then(function () {
            return GI.chamadosAprovacao(c.id, { acao: 'enviada', canal: 'EvoTalks', observacao: 'Solicitação enviada no atendimento #' + estado.chatId });
          }).then(function () { estado.registrado = true; return 'Solicitação enviada ao proprietário e registrada no histórico.'; });
        }).then(function (aviso) { mudou = true; return atualizarFatia4().then(function () { mensagem(aviso, 'sucesso'); }); }).catch(function (err) {
          if (err.code === 'forbidden') throw new Error('Envio não permitido: verifique a permissão e a janela de 24 horas. Nenhum envio foi registrado.');
          if (estado.enviado && !estado.registrado) throw new Error('Mensagem enviada, mas o registro no portal falhou. Tente confirmar novamente para registrar sem reenviar. ' + erro(err));
          throw err;
        });
      }
      function atendimentoEscolhido() {
        return selecionado;
      }
      function atualizarAviso() {
        if (!editando) return Promise.resolve();
        var v = ++versaoAviso, a = selecionado;
        avisoAberto = false; no('abrir-atendimento').hidden = true; no('avisar').disabled = true; no('avisar').checked = false;
        no('aviso-dica').textContent = 'Vincule um atendimento aberto para avisar o cliente.';
        no('salvar-nota').textContent = 'Salvar nota';
        if (!a || !idValido(a.chat_id)) return Promise.resolve();
        return sdk('chats', 'get', [a.chat_id]).then(function (chat) {
          if (!caixa.isConnected || v !== versaoAviso) return;
          no('abrir-atendimento').hidden = !chatAberto(chat, contato.id);
          avisoAberto = chatAberto(chat, contato.id) && !chat.sessionLocked && ['E-mail', 'Atendimento'].indexOf(GI.canalAtendimento(chat.channel)) < 0;
          no('avisar').disabled = !avisoAberto;
          no('aviso-dica').textContent = avisoAberto ? '' : !chatAberto(chat, contato.id) ? 'Atendimento encerrado' : chat.sessionLocked ? 'Janela de 24 h fechada' : 'Canal não permite mensagem';
        }).catch(function () { if (caixa.isConnected && v === versaoAviso) no('aviso-dica').textContent = 'Não foi possível consultar o atendimento. Escolha outro atendimento.'; });
      }
      function aplicarAtendimento(a) {
        return guardado(function () {
          return (editando ? GI.chamadosAtualizar(c.id, { atendimento: a }) : Promise.resolve()).then(function (r) {
            selecionado = a; if (editando) mensagem('Atendimento vinculado.', 'sucesso'); modoAtendimento = a ? 'atual' : 'nenhum';
            if (editando) { atualizarEstadoStatus(r.chamado); atualizarLinha(c); mudou = true; }
            ++versaoFotos; anexos = []; no('fotos').textContent = ''; no('confirmacao').hidden = true;
            no('vinculo').textContent = atendimentoTexto(a); no('escolha-atendimento').hidden = true;
            atualizarBotoesAtendimento();
            return atualizarAviso();
          });
        }).then(function () { if (editando) no('avisar').disabled = !avisoAberto; });
      }
      function atualizarBotoesAtendimento() {
        no('trocar').disabled = !contato || fechado; no('trocar').title = contato ? '' : 'Escolha o cliente primeiro';
        no('tirar-vinculo').hidden = !selecionado;
        if (no('abrir-atendimento')) {
          no('abrir-atendimento').disabled = ocupado || !idValido(selecionado && selecionado.chat_id);
          if (!selecionado) no('abrir-atendimento').hidden = true;
        }
        var abertos = atendimentos.filter(function (a) { return a.vivo; });
        var unico = editando && !selecionado && abertos.length === 1 ? abertos[0] : null;
        no('atendimento-unico').hidden = !unico;
        no('atendimento-unico').innerHTML = unico ? e(atendimentoTexto(unico)) + ' <button class="btn btn-slim" type="button" id="c-vincular-unico">Vincular este</button>' : '';
        if (unico) no('vincular-unico').onclick = function () { aplicarAtendimento({ chat_id: unico.chat_id, protocolo: unico.protocolo, canal: unico.canal, fila: unico.fila, iniciado_em: unico.iniciado_em }); };
      }
      function redesenharAtendimentos() {
        atualizarBotoesAtendimento();
        var admin = GI.ctx() && GI.ctx().user && GI.ctx().user.type === 0;
        no('atendimentos').innerHTML = atendimentos.length ? atendimentos.slice(0, limiteAtendimentos).map(function (a, i) {
          return '<button class="gi-atend" type="button" data-atendimento="' + i + '"><span class="gi-atend__corpo"><strong>' + e(data(a.iniciado_em)) + ' · ' + e(a.canal || 'Atendimento') + ' · ' + e(a.fila || 'Sem fila') +
            '</strong><span class="gi-ajuda"><span class="gi-chip">' + (a.vivo ? 'Aberto' : 'Encerrado') + '</span>' + (a.motivo && !a.vivo ? ' · ' + e(a.motivo) : '') + (a.protocolo ? ' · <small>' + e(a.protocolo) + '</small>' : '') + '</span>' +
            (a.vivo && a.ultima ? '<span class="gi-ultima-mensagem">' + e(a.ultima) + '</span>' : '') + '</span></button>';
        }).join('') + (atendimentos.length > limiteAtendimentos ? '<button type="button" class="btn btn-slim" id="c-mais-atendimentos">Mostrar mais</button>' : '') :
          '<p>' + (contato ? admin ? 'Este cliente ainda não tem atendimento.' : 'Nenhum atendimento deste cliente nas suas filas.' : 'Escolha o cliente para consultar os atendimentos.') + '</p>';
        if (no('mais-atendimentos')) no('mais-atendimentos').onclick = function () { limiteAtendimentos += 10; redesenharAtendimentos(); };
        no('atendimentos').querySelectorAll('[data-atendimento]').forEach(function (b) { b.onclick = function () {
          var a = atendimentos[Number(b.dataset.atendimento)];
          aplicarAtendimento({ chat_id: a.chat_id, protocolo: a.protocolo, canal: a.canal, fila: a.fila, iniciado_em: a.iniciado_em });
        }; });
      }
      function carregarAtendimentos(contatoId, versao, tentar) {
        if (!tentar && consultaAtendimentos && consultaAtendimentos.contatoId === contatoId && consultaAtendimentos.versao === versao) return consultaAtendimentos.promessa;
        var consulta = { contatoId: contatoId, versao: versao };
        consultaAtendimentos = consulta; limiteAtendimentos = 10;
        no('atendimentos').textContent = 'Buscando atendimentos…'; no('atendimento-aviso').textContent = '';
        consulta.promessa = Promise.allSettled([
          sdk('data', 'request', ['contacts/getItemChatsHistory', 'POST', { id: contatoId }]),
          Promise.allSettled([sdk('chats', 'listMine'), sdk('session', 'getPermissions')]).then(function (rs) {
            var perm = rs[1].status === 'fulfilled' && rs[1].value || {};
            return (perm.isAdmin || perm.isSupervisor ? sdk('queues', 'list').catch(function () { return []; }) : Promise.resolve([])).then(function (filas) {
              return Promise.allSettled(filas.map(function (f) { return sdk('chats', 'listByQueue', [Number(f.id)]); })).then(function (fs) {
                var sucessos = [rs[0]].concat(fs).filter(function (r) { return r.status === 'fulfilled'; });
                if (!sucessos.length) throw new Error('Listagem indisponível');
                var abertos = GI.mesclarAtendimentos(sucessos.map(function (r) { return r.value; }), contatoId, filas);
                return Promise.allSettled(abertos.map(function (a) {
                  return sdk('chats', 'getMessages', [a.chat_id, { limit: 1 }]).then(function (msgs) { a.ultima = msgs[0] && (msgs[0].text || msgs[0].fileName) || ''; });
                })).then(function () { return abertos; });
              });
            });
          })
        ]).then(function (rs) {
          if (versao !== versaoContato || consultaAtendimentos !== consulta || !caixa.isConnected) return;
          var historico = rs[0].status === 'fulfilled', sdkOk = rs[1].status === 'fulfilled';
          if (!historico && !sdkOk) {
            no('atendimentos').innerHTML = '<p>Não foi possível listar os atendimentos deste cliente. Tente de novo.</p><button type="button" class="btn btn-slim" id="c-tentar-atendimentos">Tentar de novo</button>';
            no('tentar-atendimentos').onclick = function () { carregarAtendimentos(contatoId, versao, true); }; return;
          }
          atendimentos = GI.unirHistoricoAtendimentos(historico ? GI.lista(rs[0].value) : [], sdkOk ? rs[1].value : []);
          redesenharAtendimentos();
          no('atendimento-aviso').textContent = historico ? '' : 'Não foi possível carregar o histórico completo deste cliente.';
          if (!editando && atendimentos.length === 1 && atendimentos[0].vivo && !selecionado && modoAtendimento === 'nenhum') {
            var a = atendimentos[0]; selecionado = { chat_id: a.chat_id, protocolo: a.protocolo, canal: a.canal, fila: a.fila, iniciado_em: a.iniciado_em };
            modoAtendimento = 'atual'; no('vinculo').textContent = atendimentoTexto(selecionado); atualizarBotoesAtendimento();
          }
        });
        return consulta.promessa;
      }
      function escolherContato(p) {
        contato = p; no('cliente').value = p.name; no('contatos').textContent = '';
        var v = ++versaoContato;
        selecionado = null; no('vinculo').textContent = atendimentoTexto(null); modoAtendimento = 'nenhum'; atendimentos = []; redesenharAtendimentos();
        ++versaoFotos; anexos = []; no('fotos').textContent = '';
        no('locacao').disabled = true; no('locacao').innerHTML = '<option value="">carregando…</option>';
        GI.chamarPortal('/contatos/' + encodeURIComponent(p.id) + '/locacoes').then(function (r) {
          if (v !== versaoContato || !caixa.isConnected) return;
          locacoes = r.rows || [];
          no('locacao').innerHTML = '<option value="">' + (locacoes.length ? 'Escolha o imóvel' : 'Nenhum imóvel locado para este contato') + '</option>' + locacoes.map(function (l, i) {
            return '<option value="' + i + '">' + e(l.imovel_titulo) + ' · contrato ' + e(l.contrato_numero || '—') + '</option>';
          }).join(''); no('locacao').disabled = false;
          if (locacoes.length === 1) no('locacao').value = '0';
        }).catch(function (err) { if (v === versaoContato) { no('locacao').innerHTML = '<option value="">Falha ao consultar imóveis; selecione o cliente novamente</option>'; mensagem(erro(err), 'erro'); } });
        carregarAtendimentos(p.id, v).catch(function (err) { if (v === versaoContato) mensagem(erro(err), 'erro'); });
      }
      function dados() {
        if (!contato) throw new Error('Busque e selecione um cliente da lista.');
        var l = !editando && no('locacao').value !== '' && locacoes[Number(no('locacao').value)];
        if (!editando && !l) throw new Error('Escolha um imóvel locado do cliente.');
        var titulo = no('titulo').value.trim(); if (!titulo) throw new Error('Informe o título do chamado.');
        var u = no('atendente').value === '' ? null : usuarios[Number(no('atendente').value)];
        var d = { titulo: titulo, descricao: no('descricao').value.trim(), categoria: no('categoria').value, prioridade: no('prioridade').value,
          atendente: u ? { user_id: idValido(u.id), nome: String(u.name || u.id) } : null, atendimento: atendimentoEscolhido(),
          acesso: { disponibilidade: no('disponibilidade').value.trim(), sem_cliente: no('sem-cliente').value === 'sim', chaves: no('chaves').value.trim() } };
        if (!editando) { d.locacao_id = idValido(l.id); d.origem = 'gestao'; d.solicitante = { contato_id: idValido(contato.id), nome: GI.nomeContato(contato), telefone: GI.textoOuNull(contato.phone) }; d.anexos = anexosSelecionados(); }
        else {
          d.quem_paga = no('quem-paga').value || null; d.repasse = no('repasse').value === 'sim';
          if (!orcamentoEscolhido()) d.valor_estimado_centavos = no('valor').value.trim() === '' ? null : valorMonetario(no('valor').value.trim());
          var original = { titulo: (c.titulo || '').trim(), descricao: (c.descricao || '').trim(), categoria: c.categoria, prioridade: c.prioridade,
            atendente: c.atendente || null, atendimento: c.atendimento || null,
            acesso: { disponibilidade: (c.acesso && c.acesso.disponibilidade || '').trim(), sem_cliente: !!(c.acesso && c.acesso.sem_cliente), chaves: (c.acesso && c.acesso.chaves || '').trim() },
            quem_paga: c.quem_paga || null, valor_estimado_centavos: c.valor_estimado_centavos == null ? null : Number(c.valor_estimado_centavos), repasse: !!c.repasse };
          Object.keys(d).forEach(function (k) { if (JSON.stringify(d[k]) === JSON.stringify(original[k])) delete d[k]; });
        }
        return d;
      }
      function anexosSelecionados() {
        return Array.from(no('fotos').querySelectorAll('[data-foto]:checked')).map(function (b) { return anexos[Number(b.dataset.foto)]; });
      }
      function desenharPendentes() {
        no('pendentes').textContent = '';
        no('cota-fotos').textContent = pendentes.length ? pendentes.length + ' requisições para as fotos' + (pendentes.length > 10 ? '; vai levar alguns segundos.' : '.') : '';
        pendentes.forEach(function (foto, i) {
          var linha = document.createElement('div'), img = document.createElement('img'), texto = document.createElement('span'), remover = document.createElement('button');
          linha.className = 'gi-foto gi-foto-pendente'; img.src = foto.previa; img.alt = 'Prévia da foto reduzida';
          texto.textContent = (foto.nomeOriginal || foto.nome) + ' · ' + GI.fotos.tamanho(foto.tamanho) + ' · pendente';
          remover.type = 'button'; remover.className = 'btn btn-slim'; remover.textContent = '×'; remover.disabled = ocupado || fechado;
          remover.setAttribute('aria-label', 'Remover ' + (foto.nomeOriginal || foto.nome));
          remover.onclick = function () { if (!ocupado) { pendentes.splice(i, 1); desenharPendentes(); } };
          linha.appendChild(img); linha.appendChild(texto); linha.appendChild(remover); no('pendentes').appendChild(linha);
        });
      }
      function portalParaFotos() {
        if (GI.modo === 'portal' && !fechado) return true;
        no('buscar-pasta').disabled = true;
        no('fotos-erros').textContent = 'Manutenção exige o portal conectado. Nenhuma foto será enviada.';
        return false;
      }
      function escolherFotos() {
        var arquivos = Array.from(no('pasta').files || []), recusas = [];
        no('pasta').value = '';
        if (!portalParaFotos() || ocupado || !arquivos.length) return;
        no('fotos-erros').textContent = '';
        if (arquivos.length > 10) {
          no('fotos-erros').textContent = arquivos.map(function (a) { return a.name + ': escolha até 10 por seleção; selecione novamente.'; }).join('\n'); return;
        }
        guardado(function () {
          return arquivos.reduce(function (fila, arquivo) {
            return fila.then(function () {
              if (pendentes.length >= 20) { recusas.push(arquivo.name + ': limite de 20 fotos pendentes.'); return; }
              mensagem('Preparando ' + arquivo.name + '…', 'info');
              return GI.fotos.processar(arquivo).then(function (foto) { pendentes.push(foto); }).catch(function (err) { recusas.push(arquivo.name + ': ' + erro(err)); });
            });
          }, Promise.resolve()).then(function () { no('fotos-erros').textContent = recusas.join('\n'); mensagem('', 'info'); });
        }).then(desenharPendentes);
      }
      function enviarPendentes(id) {
        envioFotos = true; cancelarFotos = false; no('cancelar-fotos').hidden = !pendentes.length; no('cancelar-fotos').disabled = false;
        var lista = pendentes.slice(), enviadas = 0, recusas = [];
        return lista.reduce(function (fila, foto, i) {
          return fila.then(function () {
            if (cancelarFotos || !caixa.isConnected) return;
            mensagem('Enviando foto ' + (i + 1) + ' de ' + lista.length + '…', 'info');
            return GI.chamadosAnexoUpload(id, { nome: foto.nome, mimetype: foto.mimetype, dados_base64: foto.dados_base64, miniatura_base64: foto.miniatura_base64 }).then(function (r) {
              if (!r || !r.ok || !r.anexo) throw new Error('O portal não confirmou a foto. Tente novamente; uma repetição não duplica o arquivo.');
              enviadas++; pendentes.splice(pendentes.indexOf(foto), 1); desenharPendentes();
            }).catch(function (err) { recusas.push((foto.nomeOriginal || foto.nome) + ': ' + erro(err)); });
          });
        }, Promise.resolve()).then(function () {
          if (cancelarFotos) throw new Error('Chamado salvo. Envio cancelado; as fotos restantes foram mantidas.');
          if (recusas.length) throw new Error('Chamado salvo. ' + enviadas + ' de ' + lista.length + ' fotos enviadas; envie de novo as que ficaram.\n' + recusas.join('\n'));
        }).finally(function () { envioFotos = false; if (caixa.isConnected) no('cancelar-fotos').hidden = true; });
      }
      function resolverFoto(a, alvo) {
        sdk('chats', 'getFile', [a.file_ref]).then(function (r) {
          if (!alvo.isConnected || !r || !/^image\//.test(r.mimetype || a.mimetype || '')) return;
          var url = new URL(r.url, location.href);
          // SVG e esquemas executáveis nunca entram na prévia. A URL do SDK só vai para img.src.
          if (!['https:', 'http:', 'blob:'].includes(url.protocol) && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(r.url)) return;
          var img = document.createElement('img'); img.alt = a.nome || 'Foto do atendimento'; img.src = url.href; alvo.prepend(img);
        }).catch(function () { alvo.title = 'Prévia indisponível; a referência do arquivo foi preservada.'; });
      }
      function base64Imagem(v) {
        return typeof v === 'string' && v.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v);
      }
      function ampliarFoto(a) {
        var chave = String(a.id);
        if (!fotosInteiras[chave]) fotosInteiras[chave] = GI.chamadosAnexoArquivo(c.id, a.id).then(function (r) {
          if (!r || !/^image\/(jpeg|png|webp|gif)$/.test(r.mimetype) || !base64Imagem(r.dados_base64)) throw new Error('Imagem inválida no portal.');
          return r;
        }).catch(function (err) { delete fotosInteiras[chave]; throw err; });
        fotosInteiras[chave].then(function (r) {
          if (!caixa.isConnected) return;
          var img = document.createElement('img'); img.alt = a.nome || 'Foto do computador'; img.src = 'data:' + r.mimetype + ';base64,' + r.dados_base64;
          no('foto-inteira').textContent = ''; no('foto-inteira').appendChild(img); no('foto-ampliada').hidden = false;
          no('foto-ampliada').scrollIntoView({ block: 'nearest' }); no('fechar-foto').focus();
        }).catch(function (err) { mensagem('Prévia indisponível. ' + erro(err), 'erro'); });
      }
      function fotosSalvas() {
        no('fotos').textContent = '';
        (detalhe && detalhe.anexos || []).forEach(function (a, i) {
          var alvo = document.createElement(a.origem === 'upload' ? 'button' : 'div'); alvo.className = 'gi-foto'; alvo.textContent = a.nome || a.file_ref;
          no('fotos').appendChild(alvo);
          if (a.origem !== 'upload') { resolverFoto(a, alvo); return; }
          alvo.type = 'button'; alvo.dataset.ampliar = String(i); alvo.setAttribute('aria-label', 'Ampliar ' + (a.nome || 'foto'));
          if (base64Imagem(a.miniatura_base64)) {
            var img = document.createElement('img'); img.alt = a.nome || 'Miniatura da foto'; img.src = 'data:image/jpeg;base64,' + a.miniatura_base64; alvo.prepend(img);
          }
          alvo.onclick = function () { ampliarFoto(a); };
        });
      }
      function buscarFotos() {
        var a;
        try { a = atendimentoEscolhido(); } catch (err) { mensagem(erro(err), 'erro'); return; }
        if (!a || !idValido(a.chat_id)) { mensagem('Selecione um atendimento consultado no EvoTalks para buscar as fotos.', 'info'); return; }
        var v = ++versaoFotos; no('fotos').textContent = 'Buscando…';
        sdk('chats', 'getMessages', [a.chat_id, { limit: 50 }]).then(function (msgs) {
          if (v !== versaoFotos || !caixa.isConnected) return;
          anexos = msgs.filter(function (m) { return m.fileRef && /^image\//.test(m.mimetype || ''); }).map(function (m) { return { file_ref: String(m.fileRef), nome: m.fileName, mimetype: m.mimetype, origem: 'atendimento' }; });
          fotosSalvas();
          if (!anexos.length) { var p = document.createElement('p'); p.textContent = 'Mostrando as últimas 50 mensagens da conversa. Nenhuma foto encontrada. Mídias anteriores podem ser consultadas no atendimento.'; p.className = 'gi-ajuda'; no('fotos').appendChild(p); }
          anexos.forEach(function (a, i) {
            var label = document.createElement('label'); label.className = 'gi-atend gi-foto';
            label.innerHTML = '<input type="checkbox" data-foto="' + i + '"><span>' + e(a.nome || a.file_ref) + '</span>';
            label.querySelector('input').disabled = fechado;
            no('fotos').appendChild(label); resolverFoto(a, label);
          });
        }).catch(function (err) { if (v === versaoFotos) { fotosSalvas(); mensagem(erro(err), 'erro'); } });
      }
      function gravarNota(semReleitura) {
        var texto = no('nota').value.trim(), avisar = no('avisar').checked, a = c.atendimento, falhaEnvio = '';
        if (!texto) return Promise.resolve();
        var chave = texto + '\n' + (a && a.chat_id);
        return Promise.resolve().then(function () {
          if (!avisar || enviado === chave) return;
          if (!a || !idValido(a.chat_id)) throw new Error('Vincule um atendimento aberto e salve o chamado antes de avisar o cliente.');
          return sdk('chats', 'get', [a.chat_id]).then(function (chat) {
            if (!chatAberto(chat, c.solicitante.contato_id)) throw new Error('O atendimento não está aberto para este cliente. Escolha outro atendimento antes de enviar.');
            return sdk('chats', 'sendMessage', [a.chat_id, { text: texto }]);
          }).then(function (r) { if (!r || r.sent !== true) throw new Error('Envio não confirmado. A nota não foi registrada como enviada.'); enviado = chave; }).catch(function (err) {
            if (err.code !== 'forbidden') throw err;
            falhaEnvio = 'Nota salva. O cliente não foi avisado porque a janela de 24 h fechou.';
          });
        }).then(function () { return GI.chamadosNota(c.id, { texto: texto, notificou_cliente: enviado === chave }); }).then(function () {
          mudou = true;
          if (no('nota').value.trim() === texto) no('nota').value = '';
          var semAviso = avisar && enviado !== chave;
          no('avisar').checked = false; enviado = null; notaConfirmada = null;
          no('salvar-nota').textContent = 'Salvar nota';
          avisoNotaFinal = falhaEnvio;
          mensagem(falhaEnvio || 'Nota salva.', falhaEnvio ? 'erro' : 'sucesso');
          if (semReleitura) return;
          return GI.chamadosObter(c.id).then(function (r) { atualizarEstadoStatus(r.chamado); atualizarLinha(c); historico(r.eventos || []); no('ultima').textContent = 'Última alteração: ' + data(r.chamado.atualizado_em); mensagem(falhaEnvio || (semAviso ? 'Nota salva sem aviso ao cliente: o envio não foi confirmado.' : 'Nota salva.'), semAviso ? 'erro' : 'sucesso'); });
        });
      }
      function confirmarNotaPendente(fn) {
        if (!editando || !no('nota').value.trim() || !no('avisar').checked) return true;
        var chave = no('nota').value.trim() + '\n' + (c.atendimento && c.atendimento.chat_id);
        if (notaConfirmada === chave || enviado === chave) return true;
        confirmarAcao('Enviar esta nota ao cliente ' + c.solicitante.nome + ' no atendimento ' + atendimentoTexto(c.atendimento) + '?\n\n' + no('nota').value.trim(), function () { return Promise.resolve(); });
        no('confirmar-acao').onclick = function () { notaConfirmada = chave; no('confirmacao').hidden = true; fn(); };
        return false;
      }
      function salvarNota() {
        if (!no('nota').value.trim()) { mensagem('Escreva uma nota antes de salvar.', 'erro'); no('nota').focus(); return; }
        if (confirmarNotaPendente(salvarNota)) return guardado(gravarNota);
      }
      function aplicarPendentes(op) {
        op = op || {}; avisoNotaFinal = '';
        if (GI.modo !== 'portal') throw new Error('Manutenção exige o portal conectado.');
        if (criacaoIncerta) throw new Error('Confira a lista de chamados antes de tentar criar novamente. A resposta da abertura não pôde ser conferida.');
        var d = fechado ? null : dados(), gravado = null;
        var visita = null, prestadorId = null;
        if (editando && !fechado) {
          visita = { inicio: instanteLocal(no('visita-inicio').value), fim: instanteLocal(no('visita-fim').value) };
          if (!visita.inicio) visita.fim = null;
          if (visita.fim && visita.fim < visita.inicio) throw new Error('O fim da visita deve ser posterior ao início.');
          prestadorId = idValido(no('prestador-id').value);
        }
        var novos = editando ? anexosSelecionados() : [], fotosAlteradas = novos.length > 0 || pendentes.length > 0;
        var dadosAlterados = d && Object.keys(d).length > 0, antesVisita = c.visita || {};
        var visitaAlterada = visita && (dataLocal(visita.inicio) !== dataLocal(antesVisita.inicio) || dataLocal(visita.fim) !== dataLocal(antesVisita.fim));
        var prestadorAlterado = editando && !fechado && prestadorId !== idValido(c.prestador && c.prestador.id);
        var operacoes = (dadosAlterados ? 1 : 0) + (visitaAlterada ? 1 : 0) + (prestadorAlterado ? 1 : 0) + (novos.length ? 1 : 0) + pendentes.length + (editando && no('nota').value.trim() ? 1 : 0);
        var previsto = operacoes + (editando && no('nota').value.trim() && !op.semReleitura ? 1 : 0) + (op.semReleitura ? 0 : 1);
        if (previsto > 0 && GI.cotaPortal.restantes && previsto > GI.cotaPortal.restantes()) throw new Error('Esta gravação precisa de ' + previsto + ' requisições. Aguarde um minuto antes de salvar para respeitar o limite de 30 por minuto.');
        if (pendentes.length > 10 && !confirmarVolume) {
          confirmarAcao('Enviar ' + pendentes.length + ' fotos vai levar alguns segundos e usar ' + previsto + ' requisições. Você pode cancelar as restantes.', function () { return Promise.resolve(); });
          no('confirmar-acao').onclick = function () { confirmarVolume = true; no('confirmacao').hidden = true; caixa.closest('.gi-modal').querySelector('[data-ok]').click(); };
          throw new Error('Revise a quantidade de fotos e confirme o envio.');
        }
        if (op.orcamento && operacoes > 1) {
          no('salvar-pendentes').hidden = false;
          throw new Error('Salve os dados, fotos e notas pendentes antes de alterar os orçamentos. O orçamento digitado será mantido.');
        }
        return (fechado || editando && !dadosAlterados ? Promise.resolve({ chamado: c }) : editando ? GI.chamadosAtualizar(c.id, d) : GI.chamadosCriarSeguro(d)).then(function (r) {
          gravado = r.chamado; mudou = mudou || !editando || operacoes > 0;
          return (editando && !fechado ? Promise.resolve().then(function () {
            return visitaAlterada ? GI.chamadosVisita(c.id, visita).then(function (r) { gravado = r.chamado; }) : null;
          }).then(function () { return prestadorAlterado ? GI.chamadosPrestador(c.id, prestadorId).then(function (r) { gravado = r.chamado; }) : null; }) : Promise.resolve()).then(function () { if (editando) { c = gravado; return gravarNota(op.semReleitura); } }).then(function () {
            return novos.length ? GI.chamadosAnexos(gravado.id, novos) : null;
          }).then(function () {
            // Referências do chat confirmadas não voltam à seleção se uma foto local falhar.
            no('fotos').querySelectorAll('[data-foto]').forEach(function (b) { b.checked = false; });
            return enviarPendentes(gravado.id);
          }).then(function () {
            return op.semReleitura || editando && !operacoes ? { chamado: c } : GI.chamadosObter(gravado.id);
          }).then(function (lido) {
            if (editando) { if (lido.eventos) detalhe = lido; c = lido.chamado; atualizarLinha(c); if (fotosAlteradas && lido.anexos) fotosSalvas(); }
            if (!op.semReleitura && operacoes) mensagem(avisoNotaFinal || GI.chamadoNumero(gravado.numero) + (editando ? ' salva.' : ' aberta ✓'), avisoNotaFinal ? 'erro' : 'sucesso');
            return lido.chamado;
          });
        }).catch(function (err) {
          if (err.criacaoIncerta) criacaoIncerta = true;
          return Promise.resolve().then(function () {
            if (gravado && (!editando || terminal(gravado) && pendentes.length)) {
              // Fotos já escolhidas podem ser repetidas mesmo após encerrar pelo select.
              return GI.chamadosObter(gravado.id).catch(function () {
                return { chamado: gravado, locacao: editando ? detalhe.locacao : locacoes[Number(no('locacao').value)], anexos: [], eventos: [] };
              }).then(function (lido) {
                retomada = { detalhe: lido, pendentes: pendentes, nota: editando ? { texto: no('nota').value, avisar: no('avisar').checked, enviado: enviado, confirmada: notaConfirmada } : null, aviso: pendentes.length ? erro(err) : 'Chamado salvo. Não foi possível reler os dados. ' + erro(err) };
                throw new Error(retomada.aviso);
              });
            }
            mensagem(erro(err), 'erro'); throw new Error(erro(err));
          });
        });
      }
      return apresentar({ titulo: editando ? 'Editar chamado ' + GI.chamadoNumero(c.numero) : 'Novo chamado', largura: 920, corpo: corpo,
        rotuloOk: 'Salvar', rotuloCancelar: 'Fechar',
        aoAbrir: function (elemento) {
          caixa = elemento; no = function (id) { return caixa.querySelector('#c-' + id); };
          var faixa = document.createElement('div'); faixa.setAttribute('data-recado-form', ''); faixa.hidden = true;
          caixa.closest('.gi-modal').insertBefore(faixa, caixa);
          caixa.closest('.gi-modal').querySelector('.gi-modal-recado').setAttribute('role', 'alert');
          no('cancelar-fotos').onclick = function () { cancelarFotos = true; mensagem('Cancelando as fotos restantes…', 'info'); };
          caixa.querySelectorAll('form').forEach(function (f) { f.noValidate = true; });
          sdk('users', 'list').then(function (r) {
            if (!caixa.isConnected) return;
            usuarios = (Array.isArray(r) ? r : []).filter(function (u) { return idValido(u.id) && u.name; });
            preencherUsuarios();
          }).catch(function () { if (caixa.isConnected) { usuarios = []; preencherUsuarios(); mensagem('Não foi possível listar atendentes. O vínculo existente foi preservado; reabra para tentar novamente.', 'erro'); } });
          function preencherUsuarios() {
            var original = c.atendente, atual = editando ? original : GI.ctx() && GI.ctx().user;
            if (original && !usuarios.some(function (u) { return Number(u.id) === Number(original.user_id); })) usuarios.push({ id: original.user_id, name: original.nome });
            no('atendente').innerHTML = '<option value="">Sem atendente</option>' + usuarios.map(function (u, i) { return '<option value="' + i + '"' + (atual && Number(u.id) === Number(atual.user_id || atual.id) ? ' selected' : '') + '>' + e(u.name) + '</option>'; }).join('');
            usuariosCarregados = true; no('atendente').disabled = fechado;
          }
          redesenharAtendimentos();
          no('trocar').onclick = function () {
            no('escolha-atendimento').hidden = false;
            if (contato) carregarAtendimentos(contato.id, versaoContato).catch(function (err) { mensagem(erro(err), 'erro'); });
          };
          no('tirar-vinculo').onclick = function () { aplicarAtendimento(null); };
          no('carregar-fotos').onclick = buscarFotos;
          no('buscar-pasta').onclick = function () { if (portalParaFotos() && !ocupado) no('pasta').click(); };
          no('pasta').onchange = escolherFotos;
          desenharPendentes(); mensagem(avisoInicial, 'erro');
          no('salvar-pendentes').onclick = function salvarPendentes() {
            if (!confirmarNotaPendente(salvarPendentes)) return;
            guardado(function () { return aplicarPendentes().then(function () { no('salvar-pendentes').hidden = true; mensagem('Dados salvos. Agora adicione, escolha ou remova o orçamento.', 'sucesso'); }); });
          };
          no('fechar-foto').onclick = function () { no('foto-ampliada').hidden = true; };
          no('voltar-descarte').onclick = function () { no('descarte').hidden = true; };
          no('descartar').onclick = function () {
            cancelarFotos = true;
            if (envioFotos) fecharAposFotos = true; else pendentes = [];
            if (envioFotos) { mensagem('Cancelando as fotos restantes…', 'info'); return; }
            caixa.closest('.gi-modal').querySelector('[data-cancelar]').click();
          };
          if (editando) {
            atualizarModalStatus = atualizarEstadoStatus;
            ligarControleStatus(no('status-controle'), function () { return c; }, function () { return ocupado; });
          }

          no('voltar').onclick = function () { no('confirmacao').hidden = true; };
          if (!editando) {
            if (op.contatoInicial) escolherContato(op.contatoInicial);
            no('cliente').oninput = function () {
              contato = null; ++versaoContato; ++versaoFotos; anexos = []; no('fotos').textContent = ''; selecionado = null; no('vinculo').textContent = atendimentoTexto(null); modoAtendimento = 'nenhum'; atendimentos = []; redesenharAtendimentos();
              no('locacao').disabled = true; no('locacao').innerHTML = '<option value="">Escolha um cliente</option>'; clearTimeout(timerBusca);
              var termo = no('cliente').value.trim(), v = versaoContato; no('contatos').textContent = '';
              if (termo.length < 2) return;
              timerBusca = setTimeout(function () {
                GI.buscarContatos(termo).then(function (ps) {
                  if (v !== versaoContato || !caixa.isConnected) return;
                  no('contatos').innerHTML = ps.length ? ps.map(function (p, i) { return '<button type="button" class="btn btn-slim" data-contato="' + i + '">' + e(p.name) + ' · ' + e(p.phone) + '</button>'; }).join('') : 'Nenhum contato encontrado.';
                  no('contatos').querySelectorAll('[data-contato]').forEach(function (b) { b.onclick = function () { escolherContato(ps[Number(b.dataset.contato)]); }; });
                }).catch(function (err) { if (v === versaoContato) mensagem(erro(err), 'erro'); });
              }, 400);
            };
          } else {
            desenharValor();
            if (contato && contato.id) carregarAtendimentos(contato.id, versaoContato).catch(function (err) { mensagem(erro(err), 'erro'); });
            no('orcamentos').textContent = 'Carregando orçamentos…';
            Promise.allSettled([GI.prestadores(), GI.manutencaoConfig()]).then(function (rs) {
              if (!caixa.isConnected) return;
              if (rs[0].status === 'fulfilled') prestadores = rs[0].value.rows || [];
              if (rs[1].status === 'fulfilled') configManutencao = rs[1].value;
              desenharFatia4();
              if (rs.some(function (r) { return r.status === 'rejected'; })) mensagem('Não foi possível consultar os prestadores ou o limite para aprovação. Feche e reabra para tentar novamente. Os dados do chamado foram preservados.', 'erro');
            });
            historico(detalhe.eventos || []); fotosSalvas(); atualizarAviso().then(function () {
              if (caixa.isConnected && rascunhoNota && rascunhoNota.avisar && avisoAberto) {
                no('avisar').checked = true; no('salvar-nota').textContent = 'Enviar ao cliente';
              }
            });
            no('avisar').onchange = function () { no('salvar-nota').textContent = no('avisar').checked ? 'Enviar ao cliente' : 'Salvar nota'; };
            no('abrir-atendimento').onclick = function () { if (c.atendimento) sdk('chats', 'select', [c.atendimento.chat_id]).catch(function (err) { mensagem(erro(err), 'erro'); }); };
            no('salvar-nota').onclick = salvarNota;
          }
        },
        aoFechar: function () {
          if (retomada) return true;
          if (envioFotos) {
            no('descarte-texto').textContent = 'Cancelar as fotos restantes? A foto em envio termina antes de fechar.';
            no('descarte').hidden = false; no('descartar').disabled = false; no('voltar-descarte').disabled = false;
            no('descartar').textContent = 'Cancelar as restantes'; no('descarte').scrollIntoView({ block: 'nearest' }); no('voltar-descarte').focus(); return false;
          }
          if (ocupado || editando && gravandoStatus[c.id]) { mensagem('Aguarde a operação em andamento.', 'info'); return false; }
          if (!pendentes.length) return true;
          no('descarte-texto').textContent = 'Descartar ' + pendentes.length + ' foto(s) escolhida(s)?';
          no('descarte').hidden = false; no('voltar-descarte').focus(); no('descarte').scrollIntoView({ block: 'nearest' });
          return false;
        },
        aoConfirmar: function () {
          if (ocupado || editando && gravandoStatus[c.id]) throw new Error('Aguarde a operação em andamento.');
          if (editando && !no('status-controle').querySelector('[data-status-cancelamento]').hidden) throw new Error('Confirme o cancelamento ou escolha Voltar antes de salvar os dados.');
          if (!confirmarNotaPendente(function () { caixa.closest('.gi-modal').querySelector('[data-ok]').click(); })) throw new Error('Confirme o envio da nota no próprio modal.');
          return guardado(aplicarPendentes, true).finally(function () {
            desenharPendentes();
            if (retomada) caixa.closest('.gi-modal').querySelector('[data-cancelar]').click();
          });
        }
      }).then(function (r) { if (atualizarModalStatus === atualizarEstadoStatus) atualizarModalStatus = null; clearTimeout(timerBusca); clearTimeout(timerPrestador); ++versaoPrestador; ++versaoAviso; ++versaoContato; ++versaoFotos; if (retomada) return formulario(retomada.detalhe, retomada.pendentes, retomada.aviso, retomada.nota); return mudou ? carregar().then(function () { return r; }) : r || null; });
    }
    function abrirEdicao(id) { return GI.chamadosObter(id).then(formulario); }
    function cancelar(c) {
      return GI.modal({ titulo: 'Cancelar ' + GI.chamadoNumero(c.numero), largura: 480,
        corpo: '<p>Confirme o cancelamento. O chamado e seu histórico serão mantidos.</p><div class="gi-campo-caixa"><label for="c-cancelamento">Motivo (opcional)</label><input id="c-cancelamento"></div>', rotuloOk: 'Confirmar cancelamento', perigo: true,
        aoConfirmar: function (caixa) { return mudarStatus(c, 'cancelado', caixa.querySelector('input').value.trim()).catch(function (err) { throw new Error(erro(err)); }); }
      });
    }
    return { formulario: formulario, abrirEdicao: abrirEdicao, cancelar: cancelar, controleStatus: controleStatus, ligarControleStatus: ligarControleStatus };
  };
})();
