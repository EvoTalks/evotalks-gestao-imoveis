/* Formulário compartilhado: o mesmo vínculo e as mesmas validações nas duas listas. */
(function () {
  'use strict';
  var e = GI.escapar;
  GI.GARANTIAS = { fiador: 'Fiador', seguro_fianca: 'Seguro fiança', caucao: 'Caução',
    titulo_capitalizacao: 'Título de capitalização', sem_garantia: 'Sem garantia', outra: 'Outra' };
  GI.iconeLocacao = function (tipo) {
    var formas = { chave: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
      editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      encerrar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
      ver: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' };
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + formas[tipo] + '</svg>';
  };
  GI.erroLocacao = function (err) {
    var d = err.dados || {};
    if (d.campos) return Object.keys(d.campos).map(function (k) { return d.campos[k]; }).join(' · ');
    if (d.erro === 'imovel_ja_locado') return 'Este imóvel já tem uma locação ativa. Consulte Locados antes de continuar.';
    if (d.erro === 'locacao_encerrada') return 'Esta locação já foi encerrada. Atualize a lista.';
    return d.detalhe || err.message || 'Não foi possível gravar a locação.';
  };
  function campo(id, rotulo, valor, tipo, extra) {
    return '<div class="gi-campo-caixa"><label for="l-' + id + '">' + rotulo + '</label>' +
      '<input id="l-' + id + '" type="' + (tipo || 'text') + '" value="' + e(valor) + '" ' + (extra || '') + '></div>';
  }
  function contato(c) {
    return { contato_id: c.contato_id || null, papel: c.papel, nome: c.nome, telefone: c.telefone || null, email: c.email || null };
  }
  GI.modalLocacao = function (op) {
    op = op || {};
    if (GI.modo !== 'portal') return Promise.reject(new Error('Locados exigem o portal conectado'));
    var l = op.locacao || {}, edicao = !!l.id, encerrada = !!l.encerrada_em;
    var contatos = (l.contatos || []).map(contato);
    var inquilinoOriginal = contatos.filter(function (c) { return c.papel === 'locatario'; })[0] || null;
    var inquilino = inquilinoOriginal;
    var dono = contatos.filter(function (c) { return c.papel === 'proprietario'; })[0] || null;
    var selecionado = op.imovel || null;
    var modo = edicao ? (l.imovel_codigo ? 'catalogo' : 'fora') : selecionado ? 'catalogo' : 'fora';
    var corpo = '<fieldset class="gi-form-locacao"' + (encerrada ? ' disabled' : '') + '>';
    if (!edicao) corpo += '<div class="gi-segmentos" aria-label="Origem do imóvel">' +
      '<button type="button" class="btn btn-slim" data-modo="catalogo">Imóvel do catálogo</button>' +
      '<button type="button" class="btn btn-slim" data-modo="fora">Imóvel fora do catálogo</button></div>' +
      '<div id="l-catalogo"><div class="gi-barra"><div class="gi-campo gi-flex"><label for="l-busca-imovel">Buscar no catálogo</label>' +
      '<input id="l-busca-imovel" type="search" placeholder="código, título ou bairro"></div>' +
      '<button type="button" class="btn btn-slim" id="l-buscar-imovel">Buscar imóvel</button></div>' +
      '<div id="l-resultados-imovel" class="gi-resultados" aria-live="polite"></div></div>';
    corpo += '<div class="gi-modal-imovel" id="l-resumo"></div>';
    if (!edicao) corpo += '<div class="gi-grade-modal" id="l-fora">' +
      campo('titulo', 'Título do imóvel', '') + campo('endereco', 'Endereço', '') + campo('tipo', 'Tipo', '') +
      campo('bairro', 'Bairro', '') + campo('cidade', 'Cidade', '') + '</div>';
    corpo += '<div class="gi-secao"><strong>Locação</strong><span class="gi-ajuda">O locatário é um contato do EvoTalks.</span></div>' +
      '<div class="gi-grade-modal">' +
      '<div><div class="gi-campo-caixa"><label for="l-locatario">Locatário · buscar contato</label>' +
      '<input id="l-locatario" type="search" autocomplete="off" value="' + e(inquilino && inquilino.nome) +
      '" placeholder="Digite ao menos 2 caracteres"></div><div id="l-contatos" class="gi-resultados" aria-live="polite"></div>' +
      '<div class="gi-ajuda" id="l-vinculo">' + e(inquilino ? 'Contato ' + (inquilino.contato_id || 'ainda sem vínculo') : 'Escolha um contato da lista.') + '</div></div>' +
      campo('proprietario', 'Proprietário', dono && dono.nome) +
      campo('contrato', 'Número do contrato', l.contrato_numero) +
      '<div class="gi-campo-caixa"><label for="l-garantia">Garantia</label><select id="l-garantia"><option value="">não informada</option>' +
      Object.keys(GI.GARANTIAS).map(function (g) { return '<option value="' + g + '"' + (l.garantia === g ? ' selected' : '') + '>' + GI.GARANTIAS[g] + '</option>'; }).join('') + '</select></div>' +
      campo('inicio', 'Início do contrato', l.inicio, 'date') + campo('fim', 'Fim do contrato', l.fim, 'date') +
      campo('aluguel', 'Valor do aluguel (R$)', l.valor_aluguel_centavos == null ? '' : (Number(l.valor_aluguel_centavos) / 100).toFixed(2).replace('.', ','), 'text', 'inputmode="decimal"') +
      campo('vencimento', 'Dia do vencimento', l.dia_vencimento, 'number', 'min="1" max="31" step="1"') +
      '<div class="gi-campo-caixa gi-campo-caixa--todo"><label for="l-observacao">Observação</label><textarea id="l-observacao" rows="2">' + e(l.observacao) + '</textarea></div></div></fieldset>' +
      '<div class="gi-aviso">Enquanto estiver locado, o imóvel sai das buscas da assistente de IA e passa a aparecer em Locados. Ao encerrar, volta a ficar disponível; o histórico permanece.</div>' +
      (encerrada ? '<p class="gi-ajuda">Encerrada por ' + e(l.encerrada_por) + ' · ' + e(l.motivo_encerramento || 'sem motivo informado') + '</p>' : '');
    return GI.modal({
      titulo: edicao ? (encerrada ? 'Consultar locação encerrada' : 'Editar locação') : 'Marcar imóvel como locado',
      corpo: corpo, rotuloOk: edicao ? 'Atualizar' : 'Marcar como locado',
      aoAbrir: function (caixa) {
        var no = function (id) { return caixa.querySelector('#l-' + id); };
        function resumo() {
          var p = edicao ? { name: l.imovel_titulo, internalcode: l.imovel_codigo, value: l.valor_aluguel_centavos,
            category: [l.imovel_tipo, l.imovel_cidade, l.imovel_bairro, l.imovel_endereco].filter(Boolean).join(' · ') } : selecionado;
          no('resumo').hidden = !p || modo === 'fora' && !edicao;
          if (p) no('resumo').innerHTML = '<div class="gi-modal-imovel-titulo">' + e(p.name) + '</div>' +
            '<div class="gi-ajuda">' + e(p.internalcode || 'fora do catálogo') + ' · ' + e(p.category) +
            (p.value == null ? '' : ' · ' + GI.dinheiro(p.value)) + '</div>';
        }
        resumo();
        if (encerrada) { caixa.parentNode.querySelector('[data-ok]').disabled = true; return; }
        if (!edicao) {
          function alternar(novo) {
            modo = novo;
            no('fora').hidden = modo !== 'fora'; no('catalogo').hidden = modo !== 'catalogo';
            Array.prototype.forEach.call(caixa.querySelectorAll('[data-modo]'), function (b) {
              b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === modo));
            });
            resumo();
          }
          Array.prototype.forEach.call(caixa.querySelectorAll('[data-modo]'), function (b) {
            b.onclick = function () { alternar(b.getAttribute('data-modo')); };
          });
          alternar(modo);
          if (selecionado && selecionado.value != null) no('aluguel').value = (Number(selecionado.value) / 100).toFixed(2).replace('.', ',');
          var buscaImovel = 0;
          no('buscar-imovel').onclick = function () {
            var geracao = ++buscaImovel;
            no('resultados-imovel').textContent = 'Buscando imóveis…';
            GI.buscarImoveis({ termo: no('busca-imovel').value.trim(), porPagina: 25 }).then(function (r) {
              if (!caixa.isConnected || geracao !== buscaImovel) return;
              no('resultados-imovel').innerHTML = r.itens.length ? r.itens.map(function (p, i) {
                return '<button type="button" class="btn btn-slim" data-imovel="' + i + '">' + e(p.internalcode) + ' · ' + e(p.name) + '</button>';
              }).join('') : 'Nenhum imóvel encontrado.';
              Array.prototype.forEach.call(no('resultados-imovel').querySelectorAll('[data-imovel]'), function (b) {
                b.onclick = function () {
                  selecionado = r.itens[Number(b.getAttribute('data-imovel'))];
                  no('aluguel').value = selecionado.value == null ? '' : (Number(selecionado.value) / 100).toFixed(2).replace('.', ',');
                  no('resultados-imovel').textContent = ''; resumo();
                };
              });
            }).catch(function (err) { if (caixa.isConnected && geracao === buscaImovel) no('resultados-imovel').textContent = err.message; });
          };
          no('busca-imovel').onkeydown = function (ev) { if (ev.key === 'Enter') no('buscar-imovel').click(); };
        }
        var geracaoContato = 0, espera;
        no('locatario').oninput = function () {
          inquilino = null;
          no('vinculo').textContent = 'Escolha um contato da lista.';
          var geracao = ++geracaoContato, termo = no('locatario').value.trim();
          clearTimeout(espera); no('contatos').textContent = '';
          if (termo.length < 2) return;
          espera = setTimeout(function () {
            if (!caixa.isConnected) return;
            no('contatos').textContent = 'Buscando contatos…';
            GI.buscarContatos(termo).then(function (lista) {
              if (!caixa.isConnected || geracao !== geracaoContato) return;
              no('contatos').innerHTML = lista.length ? lista.map(function (c, i) {
                return '<button type="button" class="btn btn-slim" data-contato="' + i + '">' + e(c.name) + ' · ' + e(c.phone || c.email) + '</button>';
              }).join('') : 'Nenhum contato encontrado.';
              Array.prototype.forEach.call(no('contatos').querySelectorAll('[data-contato]'), function (b) {
                b.onclick = function () {
                  var c = lista[Number(b.getAttribute('data-contato'))];
                  inquilino = { contato_id: c.id, papel: 'locatario', nome: c.name, telefone: c.phone, email: c.email };
                  no('locatario').value = c.name; no('vinculo').textContent = 'Contato ' + c.id + ' selecionado';
                  no('contatos').textContent = '';
                };
              });
            }).catch(function (err) { if (caixa.isConnected && geracao === geracaoContato) no('contatos').textContent = err.message; });
          }, 350);
        };
      },
      aoConfirmar: function (caixa) {
        var valor = function (id) { return caixa.querySelector('#l-' + id).value.trim(); };
        if (encerrada) throw new Error('Locação encerrada.');
        if (!inquilino) throw new Error('Escolha o locatário na busca de contatos do EvoTalks.');
        if (!edicao && modo === 'catalogo' && !selecionado) throw new Error('Escolha um imóvel do catálogo.');
        if (!edicao && modo === 'fora' && !valor('titulo')) throw new Error('Informe o título do imóvel.');
        if (valor('aluguel') && (!GI.numeroValido(valor('aluguel')) || GI.paraNumero(valor('aluguel')) < 0)) throw new Error('Informe um valor de aluguel válido.');
        var vencimento = valor('vencimento');
        if (vencimento && (!/^\d+$/.test(vencimento) || Number(vencimento) < 1 || Number(vencimento) > 31)) throw new Error('O dia do vencimento deve estar entre 1 e 31.');
        if (valor('inicio') && valor('fim') && valor('fim') < valor('inicio')) throw new Error('O fim do contrato deve ser igual ou posterior ao início.');
        // A API substitui a lista inteira. Preserve fiadores, outros e os contatos adicionais.
        var lista = contatos.filter(function (c) {
          return c !== inquilinoOriginal && c !== dono;
        });
        lista.unshift(inquilino);
        if (valor('proprietario')) lista.push(dono && dono.nome === valor('proprietario') ? dono : { papel: 'proprietario', nome: valor('proprietario') });
        var dados = { contrato_numero: valor('contrato') || null, garantia: valor('garantia') || null,
          inicio: valor('inicio') || null, fim: valor('fim') || null,
          valor_aluguel_centavos: valor('aluguel') ? GI.valorReais(valor('aluguel')) : null,
          dia_vencimento: vencimento ? Number(vencimento) : null, observacao: valor('observacao') || null, contatos: lista };
        if (!edicao) {
          if (modo === 'catalogo') {
            var cat = GI.partesCategoria(selecionado.category);
            dados.imovel_codigo = String(selecionado.internalcode);
            dados.imovel = { titulo: selecionado.name, tipo: cat.tipo, bairro: cat.bairro, cidade: cat.cidade };
          } else dados.imovel = { titulo: valor('titulo'), endereco: valor('endereco'), tipo: valor('tipo'), bairro: valor('bairro'), cidade: valor('cidade') };
        }
        return (edicao ? GI.locacoesAtualizar(l.id, dados) : GI.locacoesCriar(dados))
          .then(function (r) { return r.locacao; })
          .catch(function (err) { throw new Error(GI.erroLocacao(err)); });
      }
    });
  };
  GI.editarLocacao = function (id) {
    return GI.locacoesObter(id).then(function (r) { return GI.modalLocacao({ locacao: r.locacao }); });
  };
  GI.encerrarLocacao = function (id) {
    return GI.confirmar({ titulo: 'Encerrar locação', mensagem: 'Encerrar esta locação e devolver o imóvel às buscas da assistente?',
      detalhe: 'Nenhum dado será apagado. O histórico permanece disponível.', rotuloOk: 'Continuar' }).then(function (ok) {
      if (!ok) return null;
      return GI.pedirTexto({ titulo: 'Motivo do encerramento', rotulo: 'Motivo', rotuloOk: 'Continuar' });
    }).then(function (motivo) {
      if (motivo === null) return null;
      // A gravação fica num modal para que falhas permitam tentar de novo sem perder o motivo.
      return GI.modal({ titulo: 'Confirmar encerramento', corpo: '<p class="gi-modal-texto">' + e(motivo) + '</p>',
        rotuloOk: 'Encerrar locação', aoConfirmar: function () {
          return GI.locacoesEncerrar(id, motivo).then(function (r) { return r.locacao; })
            .catch(function (err) { throw new Error(GI.erroLocacao(err)); });
        } });
    });
  };
})();
