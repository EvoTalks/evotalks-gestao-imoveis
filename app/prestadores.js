/* Prestadores são compartilhados pelo portal. Desativar nunca apaga o cadastro. */
(function () {
  'use strict';
  var e = GI.escapar, el = function (id) { return document.getElementById(id); };
  var itens = [], pagina = 1, geracao = 0;
  function valorMapa(mapa, chave) { return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined; }
  function erro(err) { return GI.mensagemErro(err); }
  function desenhar() {
    var tamanho = Number(el('f-porpagina').value), inicio = (pagina - 1) * tamanho, rows = itens.slice(inicio, inicio + tamanho);
    el('gi-resumo').textContent = itens.length + ' ' + GI.plural(itens.length, 'prestador', 'prestadores') + ' neste filtro';
    el('gi-pagina').textContent = String(pagina); el('gi-total').textContent = rows.length + ' nesta página · ' + itens.length + ' no total';
    el('b-anterior').disabled = pagina <= 1; el('b-proxima').disabled = inicio + tamanho >= itens.length;
    el('gi-corpo').innerHTML = rows.length ? rows.map(function (p, i) {
      return '<tr><td><strong>' + e(p.nome) + '</strong><div class="gi-ajuda">' + e(p.observacao) + '</div></td><td>' +
        e((p.categorias || []).map(function (c) { return valorMapa(GI.CHAMADO_CATEGORIAS, c) || 'Não informada'; }).join(' · ') || '—') + '</td><td>' + e(p.telefone || '—') + '</td><td>' + e(p.email || '—') +
        '</td><td><span class="gi-estado ' + (p.ativo ? 'gi-estado-ok' : 'gi-estado-off') + '"><span class="gi-ponto"></span>' + (p.ativo ? 'Ativo' : 'Inativo') + '</span></td><td><div class="gi-acoes">' +
        '<button class="btn btn-slim btn-icone" type="button" data-editar="' + i + '" aria-label="Editar ' + e(p.nome) + '" title="Editar prestador"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9M16 4l4 4L7 21H3v-4Z"/></svg></button>' +
        '<button class="btn btn-slim" type="button" data-ativar="' + i + '">' + (p.ativo ? 'Desativar' : 'Ativar') + '</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="gi-vazio">Nenhum prestador com esses filtros.</div></td></tr>';
    el('gi-corpo').querySelectorAll('[data-editar]').forEach(function (b) { b.onclick = function () { formulario(rows[Number(b.dataset.editar)]); }; });
    el('gi-corpo').querySelectorAll('[data-ativar]').forEach(function (b) { b.onclick = function () { alternar(rows[Number(b.dataset.ativar)]); }; });
    GI.ajustarAltura();
  }
  function carregar() {
    var atual = ++geracao;
    el('gi-erro').style.display = 'none'; el('gi-corpo').innerHTML = '<tr><td colspan="6">buscando prestadores…</td></tr>';
    return GI.prestadores({ busca: el('f-busca').value.trim(), categoria: el('f-categoria').value, ativos: el('f-ativos').value }).then(function (r) {
      if (atual !== geracao) return;
      itens = r.rows || []; pagina = 1; desenhar();
    }).catch(function (err) {
      if (atual !== geracao) return;
      el('gi-corpo').innerHTML = '<tr><td colspan="6">Não foi possível carregar. Tente Buscar novamente.</td></tr>';
      el('gi-erro').textContent = erro(err); el('gi-erro').style.display = 'block';
    });
  }
  function campo(id, rotulo, valor, tipo) {
    return '<div class="gi-campo-caixa"><label for="p-' + id + '">' + rotulo + '</label><input id="p-' + id + '" type="' + (tipo || 'text') + '" value="' + e(valor) + '"></div>';
  }
  function formulario(p) {
    p = p || {};
    return GI.modal({ titulo: p.id ? 'Editar prestador' : 'Novo prestador', largura: 680, rotuloOk: p.id ? 'Atualizar prestador' : 'Cadastrar prestador',
      corpo: '<div class="gi-form-chamado"><div class="gi-grade-modal">' + campo('nome', 'Nome', p.nome) + campo('telefone', 'Telefone', p.telefone) + campo('email', 'E-mail', p.email, 'email') +
        '<div class="gi-campo-caixa"><label for="p-observacao">Observação</label><textarea id="p-observacao" rows="2">' + e(p.observacao) + '</textarea></div></div>' +
        '<fieldset class="gi-fatia4"><legend class="gi-secao">Categorias</legend><div class="gi-prestador-categorias">' + Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) {
          return '<label><input type="checkbox" name="p-categoria" value="' + e(c) + '"' + ((p.categorias || []).includes(c) ? ' checked' : '') + '>' + e(GI.CHAMADO_CATEGORIAS[c]) + '</label>';
        }).join('') + '</div></fieldset></div>',
      aoConfirmar: function (caixa) {
        var v = function (id) { return caixa.querySelector('#p-' + id).value.trim(); };
        if (!v('nome')) throw new Error('Informe o nome do prestador.');
        var d = { nome: v('nome'), telefone: v('telefone') || null, email: v('email') || null, observacao: v('observacao') || null,
          categorias: Array.from(caixa.querySelectorAll('[name="p-categoria"]:checked')).map(function (b) { return b.value; }) };
        return (p.id ? GI.prestadoresAtualizar(p.id, d) : GI.prestadoresCriar(d)).catch(function (err) { throw new Error(erro(err)); });
      }
    }).then(function (r) { if (r) return carregar(); }).catch(GI.erroFatal);
  }
  function alternar(p) {
    return GI.modal({ titulo: (p.ativo ? 'Desativar' : 'Ativar') + ' prestador', largura: 480,
      corpo: '<p>' + e(p.nome) + '</p><p class="gi-ajuda">O cadastro e os chamados anteriores serão preservados.</p>', rotuloOk: p.ativo ? 'Desativar' : 'Ativar',
      aoConfirmar: function () { return (p.ativo ? GI.prestadoresDesativar(p.id) : GI.prestadoresAtivar(p.id)).catch(function (err) { throw new Error(erro(err)); }); }
    }).then(function (r) { if (r) return carregar(); }).catch(GI.erroFatal);
  }
  GI.pronto(function () {
    el('gi-nav').innerHTML = GI.cabecalho('gi-prestadores'); GI.ligarNavegacao(); GI.manutencaoMostrarModo();
    el('f-categoria').innerHTML += Object.keys(GI.CHAMADO_CATEGORIAS).map(function (c) { return '<option value="' + e(c) + '">' + e(GI.CHAMADO_CATEGORIAS[c]) + '</option>'; }).join('');
    if (GI.modo !== 'portal') {
      el('gi-sem-portal').hidden = false; el('gi-resumo').textContent = 'Manutenção exige o portal conectado';
      el('gi-corpo').innerHTML = '<tr><td colspan="6">Conecte o portal para consultar prestadores.</td></tr>';
      document.querySelectorAll('#gi-lista input, #gi-lista select, #gi-lista button').forEach(function (b) { b.disabled = true; }); return;
    }
    el('b-novo').onclick = function () { formulario(); }; el('b-buscar').onclick = carregar;
    el('f-busca').onkeydown = function (ev) { if (ev.key === 'Enter') carregar(); };
    el('b-limpar').onclick = function () { el('f-busca').value = ''; el('f-categoria').value = ''; el('f-ativos').value = '1'; el('f-porpagina').value = '25'; carregar(); };
    el('f-porpagina').onchange = function () { pagina = 1; desenhar(); };
    el('b-anterior').onclick = function () { if (pagina > 1) { pagina--; desenhar(); } };
    el('b-proxima').onclick = function () { if (pagina * Number(el('f-porpagina').value) < itens.length) { pagina++; desenhar(); } };
    return carregar();
  });
})();
