/* Diálogo de manutenção acessível no atendimento para todos os perfis. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); }, e = GI.escapar;
  var geracao = 0, contato = null, fecharEdicao = null, fecharHost = false, listaVista = false, demoItens = [];
  function id(v) { if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+$/.test(v))) return null; var n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function mapa(m, k) { return Object.hasOwn(m, k) ? m[k] : 'Não informado'; }
  function demo() { return GI.cfg('modoDemonstracao', false) === true; }
  function recado(t, tipo) { el('os-recado').textContent = t || ''; GI.recado(t, tipo || 'info'); }
  function fechar() {
    Promise.resolve().then(function () { return omni.ui.close(); }).catch(function () { recado('Não foi possível fechar. Feche pela janela do atendimento.', 'erro'); });
  }
  function voltar() {
    if (fecharEdicao) { fecharEdicao(false); return; }
    el('os-form').textContent = ''; el('os-edicao').hidden = true; el('os-listagem').hidden = false;
    if (fecharHost) { fecharHost = false; fechar(); } else carregar();
  }
  function apresentar(op) {
    op.alvo = el('os-form'); op.rotuloCancelar = listaVista ? 'Voltar à lista' : 'Fechar';
    el('b-voltar').hidden = !listaVista;
    op.aoControlar = function (fn) { fecharEdicao = fn; };
    return GI.modal(op);
  }
  function editar(detalhe, g) {
    if (g !== geracao) return;
    recado('', 'info'); el('os-listagem').hidden = true; el('os-edicao').hidden = false;
    var form = GI.criarChamadoForm({ apresentar: function (op) { return g === geracao ? apresentar(op) : Promise.resolve(null); }, contatoInicial: contato });
    form.formulario(detalhe).then(function (resultado) {
      if (g !== geracao) return;
      fecharEdicao = null;
      if (resultado === null && !listaVista) { fecharHost = false; fechar(); return; }
      voltar();
    }).catch(function () { if (g === geracao) recado('Não foi possível editar este chamado. Tente novamente.', 'erro'); });
  }
  function abrir(n) {
    if (demo()) {
      el('os-listagem').hidden = true; el('os-edicao').hidden = false;
      el('os-form').textContent = 'Reparo Demonstração · Status: Novo · Prioridade: Normal · Dados sintéticos. Edição disponível com o portal conectado.';
      return;
    }
    if (GI.modo !== 'portal' || !id(n)) return;
    var g = ++geracao;
    recado('Carregando chamado…', 'info');
    GI.chamadosObter(n).then(function (d) { editar(d, g); }).catch(function () { if (g === geracao) recado('Não foi possível carregar este chamado. Atualize e tente de novo.', 'erro'); });
  }
  function desenhar(rows) {
    el('os-lista').innerHTML = rows.map(function (c) {
      return '<button type="button" class="gi-os-cartao" data-os="' + id(c.id) + '"><strong>' + e(GI.chamadoNumero(c.numero)) + ' · ' + e(c.titulo) + '</strong><span class="gi-estado ' + e(Object.hasOwn(GI.CHAMADO_STATUS_CLASSES, c.status) ? GI.CHAMADO_STATUS_CLASSES[c.status] : 'gi-estado-off') + '">' + e(mapa(GI.CHAMADO_STATUS, c.status)) + '</span><small>' + e(GI.chamadoPrazo(c).replace(/^SLA /, 'Prazo ')) + ' · ' + e(mapa(GI.CHAMADO_PRIORIDADES, c.prioridade)) + ' · ' + e(c.imovel && c.imovel.titulo || '') + '</small></button>';
    }).join('');
    el('os-lista').querySelectorAll('[data-os]').forEach(function (b) { b.onclick = function () { abrir(id(b.dataset.os)); }; });
    if (!rows.length) recado('Nenhum chamado deste contato.', 'info');
  }
  function carregar() {
    var g = ++geracao; contato = null; listaVista = true;
    el('b-novo').disabled = true; el('b-atualizar').disabled = GI.modo !== 'portal'; el('os-lista').textContent = '';
    if (demo()) { desenhar(demoItens); recado('Demonstração · dados sintéticos, sem gravação.', 'info'); return Promise.resolve(); }
    if (GI.modo !== 'portal') { el('gi-sem-portal').hidden = false; return Promise.resolve(); }
    recado('Carregando chamados do contato…', 'info');
    return GI.pessoas.ler().then(function () { return omni.chats.getSelected(); }).then(function (chat) {
      if (g !== geracao) return;
      if (!chat || !id(chat.id)) { recado('Abra um atendimento para consultar os chamados.', 'info'); return; }
      var contatoId = GI.contatoEfetivo(chat);
      if (!contatoId) { recado('Vincule um contato a este atendimento.', 'info'); return; }
      return Promise.all([GI.chamadosPorContato(contatoId), omni.contacts.get(contatoId)]).then(function (rs) {
        return omni.chats.getSelected().then(function (atual) {
          if (g !== geracao || !atual || id(atual.id) !== id(chat.id) || id(atual.contactId) !== id(chat.contactId) || GI.contatoEfetivo(atual) !== contatoId) return;
          contato = rs[1]; el('b-novo').disabled = false; recado('', 'info'); desenhar(rs[0].rows || []);
        });
      });
    }).catch(function () { if (g === geracao) recado('Não foi possível consultar os chamados. Use Atualizar para tentar novamente.', 'erro'); });
  }
  function alvo(ctx) {
    var params = ctx && ctx.contribution && ctx.contribution.params, direto = id(params && params.chamadoId);
    // Consuma o segundo canal mesmo quando os parâmetros tiverem precedência.
    return Promise.resolve().then(function () { return omni.storage.get('gi-os-alvo'); }).then(function (valor) {
      return Promise.resolve().then(function () { return omni.storage.remove('gi-os-alvo'); }).then(function () { return valor; });
    }).catch(function () { return null; }).then(function (valor) {
      var idade = valor && typeof valor.em === 'number' && valor.em > 0 ? Date.now() - valor.em : NaN;
      var destino = direto ? params : Number.isFinite(idade) && idade >= 0 && idade <= 60000 ? valor : null;
      if (!destino || !id(destino.chamadoId) || !id(destino.contatoId)) return null;
      return GI.pessoas.ler().then(function () { return omni.chats.getSelected(); }).then(function (chat) {
        if (!chat || !id(chat.id)) return null;
        if (GI.contatoEfetivo(chat) === id(destino.contatoId)) return id(destino.chamadoId);
        // Parâmetros do cockpit identificam também o chat: funcionam sem storage.
        if (id(destino.chatId) !== id(chat.id)) return null;
        return GI.pessoas.escolher(chat, { id: destino.contatoId, name: destino.nome }, true).then(function () { return id(destino.chamadoId); });
      });
    }).catch(function () { return null; });
  }
  el('b-voltar').onclick = voltar;
  el('b-fechar').onclick = function () { if (fecharEdicao) { fecharHost = true; fecharEdicao(false); } else fechar(); };
  el('b-atualizar').onclick = carregar;
  el('b-novo').onclick = function () { if (GI.modo === 'portal' && contato) editar(null, ++geracao); };
  GI.pronto(function (ctx) {
    GI.manutencaoMostrarModo();
    demoItens = [{ id: 9000, numero: 9000, titulo: 'Reparo Demonstração', status: 'novo', prioridade: 'normal', imovel: { titulo: 'Imóvel Fictício Demonstração' } }];
    if (window.omni && omni.on) {
      omni.on('omniChatSelected', function () {
        ++geracao;
        if (fecharEdicao) { fecharEdicao(true); fecharEdicao = null; }
        fecharHost = false; el('os-form').textContent = ''; el('os-edicao').hidden = true; el('os-listagem').hidden = false;
        carregar();
      });
      omni.on('destroy', function () { ++geracao; if (fecharEdicao) fecharEdicao(true); });
    }
    var g = geracao;
    return alvo(ctx).then(function (n) { if (g !== geracao) return; if (n && !demo() && GI.modo === 'portal') abrir(n); else return carregar(); });
  });
})();
