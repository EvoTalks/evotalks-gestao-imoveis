import assert from 'node:assert/strict';

// Mesmo roteiro no servidor estrito e no router/SQL reais. Só dados sintéticos.
export async function testarImpeditivos(b, origem, real) {
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const abrir = async q => { await b.navegar(origem + '/app/painel.html?' + q); };
  const pronto = () => b.esperar(() => !!document.querySelector('#cp-busca'));
  const prova = t => process.stdout.write('OK ' + (real ? 'real ' : '') + 'F14 ' + t + '\n');
  const api = (rota, dados) => dados === undefined ? b.avaliar(r => GI.chamarPortal(r), rota) : b.avaliar(async (r, d) => GI.chamarPortal(r, d === undefined ? undefined : { corpo: d }), rota, dados);
  const estado = async (card, destino) => {
    await b.preencher(card + ' [data-rapida="status"]', destino);
    await b.esperar(s => document.querySelector(s + ' [data-salvo="status"]').textContent === '✓ salvo' && !document.querySelector(s + ' [data-rapida="status"]').disabled, card);
  };
  async function capturarEstado(nome) {
    for (const tema of ['claro', 'escuro']) for (const largura of [260, 300, 334]) {
      await b.viewport(largura, 1300);
      await b.avaliar(escuro => {
        const tokens = escuro ? { '--ext-color-bg': '#17191d', '--ext-color-surface': '#24272e', '--ext-color-surface-alt': '#30343d', '--ext-color-text': '#f0f2f4', '--ext-color-text-muted': '#b4bdc9', '--ext-color-border': '#4e5665', '--ext-color-primary': '#dce2ec', '--ext-color-on-primary': '#17191d', '--ext-color-warning': '#e7b75b', '--ext-color-success': '#62ce9b', '--ext-color-error': '#ff8b8b' } : {};
        for (const k of ['--ext-color-bg', '--ext-color-surface', '--ext-color-surface-alt', '--ext-color-text', '--ext-color-text-muted', '--ext-color-border', '--ext-color-primary', '--ext-color-on-primary', '--ext-color-warning', '--ext-color-success', '--ext-color-error']) {
          if (tokens[k]) document.documentElement.style.setProperty(k, tokens[k]); else document.documentElement.style.removeProperty(k);
        }
      }, tema === 'escuro');
      assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
      await b.captura((real ? 'real-' : '') + 'f14-' + nome + '-' + largura + '-' + tema);
    }
  }
  await abrir('chat=8804');
  await b.esperar(() => document.querySelector('#cp-conteudo').textContent.includes('Sem contato cadastrado'));
  assert.match(await texto('#cp-conteudo'), /no topo da conversa.*Adicionar dados a contato existente/);
  for (const [chatId, esperado] of [[8810, '2025-10-09T08:53:20.000Z'], [8811, '2025-10-09T08:53:20.000Z'], [8812, null], [8813, null], [8814, null]]) assert.equal(await b.avaliar(async n => GI.atendimentoPortal(await omni.chats.get(n)).iniciado_em, chatId), esperado);
  prova('sem contato explica o caminho existente no produto');

  for (const modo of ['local', 'fora']) {
    await abrir('modo=' + modo);
    await b.esperar(() => !!document.querySelector('#cp-tentar'));
    assert.match(await texto('#cp-conteudo'), /Confira a URL e o token em Configurações da extensão/);
    const antes = await b.avaliar(() => bancada.chamadas.filter(r => r.caminho.endsWith('/info')).length);
    await b.clicar('#cp-tentar');
    await b.esperar(() => !!document.querySelector('#cp-tentar'));
    if (modo === 'fora') assert.ok(await b.avaliar(n => bancada.chamadas.filter(r => r.caminho.endsWith('/info')).length > n, antes));
    await b.avaliar(() => { bancada.portalRestaurado = true; GI.ctx().config.portalUrl = 'http://portal.bancada.invalid'; GI.ctx().config.portalToken = 'bancada-sintetica'; });
    await b.clicar('#cp-tentar'); await pronto();
  }
  prova('portal fora/local orienta configuração; retry consulta /info novamente');

  for (const q of ['perfil=supervisor', 'perfil=agente&usuario=531', 'perfil=agente&usuario=600', 'perfil=admin']) {
    await abrir(q + '&escrita=0'); await pronto();
    const extra = q.includes('531') || q.includes('admin');
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-lista-completa]')), extra);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-tab-novo').hidden), true);
    assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir, [data-rapida]')), false);
    assert.match(await texto('#cp-escrita-aviso'), /Abertura e edição.*desligadas nesta instalação/);
    await b.clicar('#cp-tab-imovel');
    assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir-imovel')), false);
    await b.clicar('#cp-tab-chamados');
    assert.equal(await b.avaliar(() => GI.gestor()), extra);
    const nav = await b.avaliar(() => GI.cabecalho('gi-imoveis'));
    assert.equal(nav.includes('data-tela="gi-chamados"'), extra);
    await b.avaliar(() => { bancada.navegarContribuicao = false; });
    await b.avaliar(() => document.querySelector('[data-gestao]').click());
    await b.esperar(() => bancada.aberturas.length === 1);
    assert.equal(await b.avaliar(() => bancada.aberturas[0].id), 'gi-os');
    if (extra) {
      await b.avaliar(() => document.querySelector('[data-lista-completa]').click());
      await b.esperar(() => bancada.aberturas.length === 2);
      assert.equal(await b.avaliar(() => bancada.aberturas[1].id), 'gi-chamados');
    }
  }
  prova('supervisor/administrador/531/600: diálogo acessível; gestão completa só admin e 531; escrita desligada sem beco');

  await abrir('escrita=1'); await pronto();
  const l1 = (await api('/locacoes', { imovel: { titulo: 'Residência Alfa Sintética F14' }, contrato_numero: 'F14-ALFA', contatos: [{ contato_id: 9901, nome: 'Locatário Sintético F14', papel: 'locatario' }] })).locacao;
  const l2 = (await api('/locacoes', { imovel: { titulo: 'Residência Beta Sintética F14' }, contrato_numero: 'F14-BETA', contatos: [{ contato_id: 9901, nome: 'Locatário Sintético F14', papel: 'locatario' }] })).locacao;
  const entrada = { categoria: 'outros', solicitante: { contato_id: 9901, nome: 'Locatário Sintético F14' } };
  const c1 = (await api('/chamados', { ...entrada, locacao_id: l1.id, titulo: 'Reparo Alfa Sintético F14' })).chamado;
  const c2 = (await api('/chamados', { ...entrada, locacao_id: l2.id, titulo: 'Reparo Beta Sintético F14' })).chamado;
  await abrir('escrita=1'); await pronto(); await b.preencher('#cp-busca', 'Sintético F14');
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-os-id]').length), 2);
  assert.match(await texto('#cp-conteudo'), /Residência Alfa Sintética F14/); assert.match(await texto('#cp-conteudo'), /Residência Beta Sintética F14/);
  await b.preencher('#cp-filtro-imovel', String(l1.id));
  assert.match(await texto('#cp-conteudo'), /Reparo Alfa/); assert.doesNotMatch(await texto('#cp-conteudo'), /Reparo Beta/);
  await b.preencher('#cp-filtro-imovel', '');
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-os-id]').length), 2);
  await b.clicar('#cp-tab-novo');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-novo-imovel').value), '');
  assert.equal(await b.avaliar(() => !!document.querySelector('#cp-revisar')), false);
  const indice = await b.avaliar(() => Array.from(document.querySelector('#cp-novo-imovel').options).find(o => o.textContent.includes('F14-BETA')).value);
  await b.preencher('#cp-novo-imovel', indice);
  assert.match(await texto('.gi-cp-imovel-novo'), /Residência Beta Sintética F14.*F14-BETA/);
  await b.preencher('#cp-titulo', 'Novo Segundos Sintético F14'); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  const criado = (await api('/contatos/9901/chamados')).rows.find(c => c.titulo === 'Novo Segundos Sintético F14');
  assert.equal(criado.locacao_id, l2.id); assert.equal(new Date(criado.atendimento.iniciado_em).toISOString(), '2025-10-09T08:53:20.000Z');
  if (real) {
    const c = (await real.pg.query('SELECT atendimento_iniciado_em FROM chamados WHERE id=$1', [criado.id])).rows[0];
    assert.equal(new Date(c.atendimento_iniciado_em).toISOString(), '2025-10-09T08:53:20.000Z');
  }
  prova('todos os imóveis com etiquetas e filtro; Novo exige escolha e grava residência/contrato corretos com segundos em 2025');

  await abrir('escrita=1'); await pronto(); await b.preencher('#cp-busca', 'Reparo Alfa Sintético F14');
  const card = '[data-os-id="' + c1.id + '"]';
  await b.avaliar(s => { document.querySelector(s).open = true; }, card);
  await b.esperar(s => !document.querySelector(s + ' [data-rapida="atendente"]').disabled, card);
  await b.clicar(card + ' [data-vincular]');
  await b.esperar(s => document.querySelector(s + ' [data-acao]').textContent.includes('Este atendimento'), card);
  assert.equal((await api('/chamados/' + c1.id)).chamado.atendimento.iniciado_em, '2025-10-09T08:53:20.000Z');
  await estado(card, 'concluido');
  assert.deepEqual(await b.avaliar(s => Array.from(document.querySelector(s + ' [data-rapida="status"]').options).map(o => o.value), card), ['concluido', 'triagem']);
  assert.match(await texto(card), /Reabrir volta o chamado para Triagem/);
  await capturarEstado('reabrir');
  await b.avaliar(s => { const o = document.createElement('option'); o.value = 'execucao'; o.textContent = 'Opção obsoleta sintética'; document.querySelector(s + ' [data-rapida="status"]').appendChild(o); }, card);
  await b.preencher(card + ' [data-rapida="status"]', 'execucao');
  await b.esperar(s => document.querySelector(s + ' [data-salvo="status"]').textContent.includes('Use Reabrir') && document.querySelector(s + ' [data-rapida="status"]').value === 'concluido', card);
  await estado(card, 'triagem');
  assert.equal((await api('/chamados/' + c1.id)).chamado.status, 'triagem');
  assert.match(await texto(card + ' summary'), /Triagem/);
  // Regra real: chamado terminal não pode ir direto para execução.
  await api('/chamados/' + c1.id + '/status', { status: 'concluido' });
  await b.navegar(origem + '/app/os.html?chamado=' + c1.id + '&perfil=supervisor');
  await b.esperar(() => !!document.querySelector('#c-status') && !document.querySelector('#c-status').disabled);
  assert.deepEqual(await b.avaliar(() => Array.from(document.querySelector('#c-status').options).map(o => o.value)), ['concluido', 'triagem']);
  await b.avaliar(() => { const o = document.createElement('option'); o.value = 'execucao'; o.textContent = 'Opção obsoleta sintética'; document.querySelector('#c-status').appendChild(o); });
  await b.preencher('#c-status', 'execucao');
  await b.esperar(() => document.querySelector('[data-status-mensagem]').textContent.includes('Use Reabrir') && document.querySelector('#c-status').value === 'concluido');
  await b.preencher('#c-status', 'triagem');
  await b.esperar(() => document.querySelector('#c-selo').textContent.includes('Triagem') && !document.querySelector('#c-status').disabled);
  assert.equal((await api('/chamados/' + c1.id)).chamado.status, 'triagem');
  // Um dado já gravado em 1970 permanece intocado no portal real.
  if (real) {
    await real.pg.query("UPDATE chamados SET atendimento_iniciado_em='1970-01-21T12:00:00Z' WHERE id=$1", [c1.id]);
    await b.navegar(origem + '/app/os.html?chamado=' + c1.id);
  } else {
    await b.avaliar(() => {
      const obter = GI.chamadosObter;
      GI.chamadosObter = async n => { const d = await obter(n); d.chamado.atendimento.iniciado_em = '1970-01-21T12:00:00Z'; return d; };
    });
    await b.clicar('[data-cancelar]');
    await b.esperar(() => !!document.querySelector('[data-os]'));
    await b.clicar('[data-os="' + c1.id + '"]');
  }
  await b.esperar(() => !!document.querySelector('#c-vinculo') && !document.querySelector('#c-status').disabled);
  assert.doesNotMatch(await texto('#c-vinculo'), /1970/);
  if (real) assert.equal(new Date((await real.pg.query('SELECT atendimento_iniciado_em FROM chamados WHERE id=$1', [c1.id])).rows[0].atendimento_iniciado_em).getUTCFullYear(), 1970);
  prova('vínculo normaliza segundos; cockpit e diálogo concluem/reabrem somente para Triagem e atualizam selo/prazo');

  // O portal de mentira e o real recebem o mesmo orçamento com alçada excedida.
  await abrir('escrita=1'); await pronto();
  await api('/config/manutencao', { alcada_centavos: 100 });
  const orc = await api('/chamados/' + c2.id + '/orcamentos', { prestador_nome: 'Prestador Sintético F14', valor_centavos: 200 });
  await api('/chamados/' + c2.id, { quem_paga: 'proprietario' });
  await api('/chamados/' + c2.id + '/orcamentos/' + orc.orcamento.id + '/escolher', {});
  await abrir('escrita=1'); await pronto(); await b.preencher('#cp-busca', 'Reparo Beta Sintético F14');
  const pendente = '[data-os-id="' + c2.id + '"]';
  await b.avaliar(s => { document.querySelector(s).open = true; }, pendente);
  await b.preencher(pendente + ' [data-rapida="status"]', 'execucao');
  await b.esperar(s => document.querySelector(s + ' [data-salvo="status"]').textContent.includes('Gestão → Aprovação'), pendente);
  assert.ok(await b.avaliar(s => !!document.querySelector(s + ' [data-salvo="status"] button'), pendente));
  assert.equal(await b.avaliar(s => document.querySelector(s + ' [data-rapida="status"]').value, pendente), (await api('/chamados/' + c2.id)).chamado.status);
  await capturarEstado('aprovacao');
  prova('aprovação pendente explica o próximo passo e oferece Gestão na própria linha');

  // Conflito de catálogo: preservar cada contato e o contrato, inclusive escrita desligada.
  let alvo;
  if (real) alvo = (await real.api('/locacoes', { imovel_codigo: 'DEMO-002', imovel: { titulo: 'Casa Sintética F14' }, contrato_numero: 'F14-CONFLITO', contatos: [{ contato_id: 9901, nome: 'Locatário Sintético', papel: 'locatario' }, { contato_id: 9903, nome: 'Proprietário Sintético', papel: 'proprietario' }, { contato_id: 9904, nome: 'Fiador Sintético', papel: 'fiador' }] })).locacao;
  else alvo = (await api('/locacoes/1')).locacao;
  await abrir('chat=8806&escrita=0');
  await b.esperar(() => !document.querySelector('#cp-vincular-residencia').hidden);
  await b.clicar('#cp-vincular-residencia'); await b.preencher('#cp-r-busca', 'DEMO-002');
  await b.esperar(() => !!document.querySelector('[data-residencia]'));
  await b.clicar('[data-residencia]'); await b.clicar('#cp-r-confirmar');
  await b.esperar(() => document.querySelector('#cp-r-confirmar')?.textContent.includes('Adicionar este contato'));
  assert.match(await texto('#cp-conteudo'), /PROPRIETÁRIO.*FIADOR/);
  assert.match(await texto('#cp-conteudo'), new RegExp(alvo.contrato_numero));
  await capturarEstado('conflito');
  const antesContatos = (await api('/locacoes/' + alvo.id)).locacao.contatos;
  await b.clicar('#cp-r-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Residência vinculada.'));
  const salvo = (await api('/locacoes/' + alvo.id)).locacao;
  assert.equal(salvo.contrato_numero, alvo.contrato_numero);
  for (const c of antesContatos) assert.ok(salvo.contatos.some(p => p.contato_id === c.contato_id && p.nome === c.nome && p.papel === c.papel));
  assert.ok(salvo.contatos.some(c => c.contato_id === 9905 && c.papel === 'locatario'));
  assert.equal(salvo.contatos.length, antesContatos.length + 1);
  if (real) assert.equal((await real.pg.query('SELECT count(*)::int AS n FROM locacao_contatos WHERE locacao_id=$1', [alvo.id])).rows[0].n, salvo.contatos.length);
  prova('409 oferece adicionar locatário com confirmação; GET+POST reais preservam proprietário, fiador e contrato com escrita desligada');

  for (const tema of ['claro', 'escuro']) for (const largura of [260, 300, 334]) {
    await b.viewport(largura, 1300);
    for (const [nome, q] of [['sem-contato', 'chat=8804'], ['portal-fora', 'modo=fora'], ['consulta', 'escrita=0'], ['escolha', 'escrita=1'], ['demo', 'demonstracao=1&escrita=1']]) {
      await abrir(q + '&tema=' + tema);
      await b.esperar(() => document.querySelector('#cp-conteudo').getAttribute('aria-busy') === 'false');
      if (nome === 'escolha') await b.clicar('#cp-tab-novo');
      if (nome === 'demo') {
        assert.match(await texto('#gi-demo-global'), /DEMONSTRAÇÃO · dados fictícios/);
        assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
      }
      assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
      await b.captura((real ? 'real-' : '') + 'f14-' + nome + '-' + largura + '-' + tema);
    }
  }
  for (const tela of ['imoveis', 'locados', 'chamados', 'prestadores', 'campos', 'historico', 'config', 'os']) {
    await b.navegar(origem + '/app/' + tela + '.html?demonstracao=1');
    await b.esperar(() => !!document.querySelector('#gi-demo-global'));
    assert.equal(await b.avaliar(() => getComputedStyle(document.querySelector('#gi-demo-global')).position), 'sticky');
  }
  assert.deepEqual(b.erros, []);
  prova('48 capturas 260/300/334 claro/escuro dos novos estados; faixa vermelha persistente em todas as telas; zero exceções');
}
