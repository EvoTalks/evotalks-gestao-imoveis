import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
try {
  b = await abrirChromium();
  const abrir = async q => { await b.navegar(origem + '/app/os.html?perfil=agente&' + q); };
  const pronto = () => b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-status').disabled);
  const falhasAlvo = [];
  for (const fonte of ['alvo=1', 'chamado=1']) for (const [chat, esperado] of [[8802, 'Avulso'], [8804, 'Vincule um contato'], [0, 'Abra um atendimento']]) {
    try {
      await abrir(fonte + '&chat=' + chat);
      await b.esperar(() => !!document.querySelector('#c-status') || !!document.querySelector('[data-os]') || /Vincule um contato|Abra um atendimento/.test(document.querySelector('#os-recado').textContent));
      assert.equal(await b.avaliar(() => !!document.querySelector('#c-status')), false, fonte + ': alvo de outro contato nunca abre edição (chat ' + chat + ')');
      assert.match(await b.avaliar(() => document.querySelector('#os-lista').textContent + document.querySelector('#os-recado').textContent), new RegExp(esperado));
      assert.equal(await b.avaliar(() => bancada.chamadas.some(c => c.caminho === '/api/ext/chamados/1')), false, 'não consulta a O.S. do contato A');
      assert.equal(await b.avaliar(async () => await omni.storage.get('gi-os-alvo') ?? null), null);
    } catch (err) { falhasAlvo.push(err); process.stdout.write('FALHA F18 ' + err.message + '\n'); }
  }
  if (falhasAlvo.length) throw new AggregateError(falhasAlvo, 'F18 isolamento de alvo: ' + falhasAlvo.length);
  for (const fonte of ['alvo=1', 'chamado=1']) {
    await abrir(fonte); await pronto();
    assert.match(await b.avaliar(() => document.querySelector('.gi-modal-topo').textContent), /Editar chamado 1001/);
    assert.equal(await b.avaliar(async () => await omni.storage.get('gi-os-alvo') ?? null), null);
  }
  const antesFecharDireto = await b.avaliar(() => ({
    fechamentos: bancada.fechamentos,
    consultasLista: bancada.chamadas.filter(c => /chamados/.test(c.caminho) && !/\/1(?:\/|$)/.test(c.caminho)).length
  }));
  await b.clicar('.gi-modal [data-cancelar]');
  await b.esperar(() => window.bancada.fechamentos > 0);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => /chamados/.test(c.caminho) && !/\/1(?:\/|$)/.test(c.caminho)).length), antesFecharDireto.consultasLista, 'Fechar o formulário direto não carrega a listagem');
  await abrir('chamado=1'); await pronto();
  await b.avaliar(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'rascunho.png', { type: 'image/png' }));
    const input = document.querySelector('#c-pasta'); input.files = dt.files; input.dispatchEvent(new Event('change'));
  });
  await b.esperar(() => document.querySelectorAll('#c-pendentes img').length === 1);
  const fechamentosAntesConfirmacao = await b.avaliar(() => bancada.fechamentos);
  await b.clicar('.gi-modal [data-cancelar]');
  await b.esperar(() => !document.querySelector('#c-descarte').hidden);
  assert.equal(await b.avaliar(() => bancada.fechamentos), fechamentosAntesConfirmacao, 'rascunho pendente exige confirmação antes de fechar');
  await b.clicar('#c-descartar');
  await b.esperar(() => window.bancada.fechamentos > 0);
  await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.clicar('[data-os="1"]'); await pronto();
  assert.equal(await b.avaliar(() => document.querySelector('.gi-modal [data-cancelar]').textContent.trim()), 'Voltar à lista');
  await b.clicar('.gi-modal [data-cancelar]');
  await b.esperar(() => !!document.querySelector('[data-os]') && !document.querySelector('.gi-modal'));
  process.stdout.write('OK F18 alvo por storage/params exige contato selecionado; divergente, sem contato e sem atendimento descartados; mesmo contato edita\n');
  // RC3: o carregamento não pode roubar foco nem emitir erro antes da resposta.
  await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
  const infoSemFoco = async (foco, toasts) => {
    assert.equal(await b.avaliar(() => document.querySelector('.gi-recado:not([hidden])')?.getAttribute('role')), 'status');
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-recado--erro:not([hidden])')), false);
    assert.equal(await b.avaliar(() => document.activeElement.id), foco);
    assert.equal(await b.avaliar(() => bancada.toasts.filter(t => t.tipo === 'error').length), toasts);
  };
  for (const [metodo, botao] of [['chamadosPorContato', '#b-atualizar'], ['chamadosObter', '[data-os="1"]']]) {
    const toasts = await b.avaliar(metodo => {
      const original = GI[metodo];
      GI[metodo] = n => new Promise(r => { bancada.liberarCarga = () => { GI[metodo] = original; original(n).then(r); }; });
      document.querySelector('#b-atualizar').focus();
      return bancada.toasts.filter(t => t.tipo === 'error').length;
    }, metodo);
    await b.clicar(botao); await b.esperar(() => !!bancada.liberarCarga);
    await infoSemFoco('b-atualizar', toasts);
    await b.avaliar(() => { bancada.liberarCarga(); delete bancada.liberarCarga; });
    if (metodo === 'chamadosPorContato') await b.esperar(() => !!document.querySelector('[data-os]'));
    else { await pronto(); await b.clicar('#b-voltar'); await b.esperar(() => !!document.querySelector('[data-os]')); }
  }
  for (const orientacao of ['vazio', 'semchat', 'semcontato']) {
    const toasts = await b.avaliar(orientacao => {
      bancada.obterSelecionado = omni.chats.getSelected; bancada.obterChamados = GI.chamadosPorContato;
      if (orientacao === 'vazio') GI.chamadosPorContato = async () => ({ rows: [] });
      else omni.chats.getSelected = async () => orientacao === 'semchat' ? null : { id: 8804, contactId: null };
      document.querySelector('#b-atualizar').focus();
      return bancada.toasts.filter(t => t.tipo === 'error').length;
    }, orientacao);
    await b.clicar('#b-atualizar');
    await b.esperar(() => /Nenhum chamado|Abra um atendimento|Vincule um contato/.test(document.querySelector('#os-recado').textContent));
    await infoSemFoco('b-atualizar', toasts);
    await b.avaliar(() => { omni.chats.getSelected = bancada.obterSelecionado; GI.chamadosPorContato = bancada.obterChamados; });
  }
  for (const metodo of ['chamadosPorContato', 'chamadosObter']) {
    await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
    await b.avaliar(metodo => { GI[metodo] = async () => { throw new Error('Falha de rede sintética RC3'); }; }, metodo);
    await b.clicar(metodo === 'chamadosPorContato' ? '#b-atualizar' : '[data-os="1"]');
    await b.esperar(() => !!document.querySelector('.gi-recado--erro:not([hidden])'));
    assert.equal(await b.avaliar(() => document.querySelector('.gi-recado--erro').getAttribute('role')), 'alert');
    assert.equal(await b.avaliar(() => document.activeElement === document.querySelector('.gi-recado--erro')), true);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(await b.avaliar(() => document.querySelector('.gi-recado--erro').hidden), false);
    assert.ok(await b.avaliar(() => bancada.toasts.some(t => t.tipo === 'error')));
  }
  process.stdout.write('OK RC3 diálogo: carregamentos atrasados e orientações sem erro/foco/toast; falhas de lista e detalhe com alert e foco\n');
  await abrir('chamado=1'); await pronto();
  assert.equal(await b.avaliar(() => document.querySelectorAll('[role="dialog"]').length), 0, 'edição inline, sem modal dentro do diálogo');
  for (const id of ['c-status', 'c-fotos', 'c-pasta', 'c-orcamentos', 'c-aprovacao', 'c-nota', 'c-historico']) assert.ok(await b.avaliar(id => !!document.getElementById(id), id));
  await b.preencher('#c-status', 'triagem');
  await b.esperar(() => !document.querySelector('#c-status').disabled && document.querySelector('#c-status').value === 'triagem');
  assert.equal(await b.avaliar(async () => (await GI.chamadosObter(1)).chamado.status), 'triagem');
  await b.preencher('#c-prioridade', 'normal'); await b.clicar('[data-ok]');
  await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.clicar('[data-os="1"]'); await pronto();
  assert.equal(await b.avaliar(() => document.querySelector('#c-prioridade').value), 'normal');
  await b.preencher('#c-nota', 'Nota sintética F11 <img src=x onerror="window.__xss=1">'); await b.clicar('#c-salvar-nota');
  await b.esperar(() => document.querySelector('#c-nota').value === '' && !document.querySelector('#c-salvar-nota').disabled);
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  await b.avaliar(() => { document.querySelector('#c-mais').open = true; });
  await b.preencher('#c-orc-nome', 'Prestador Sintético F11'); await b.preencher('#c-orc-valor', '123'); await b.clicar('#c-salvar-orcamento');
  await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('Prestador Sintético F11') && !document.querySelector('#c-salvar-orcamento').disabled);
  const d = await b.avaliar(async () => GI.chamadosObter(1));
  assert.ok(d.eventos.some(e => e.texto?.startsWith('Nota sintética F11')));
  assert.ok(d.orcamentos.some(o => o.prestador_nome === 'Prestador Sintético F11' && o.valor_centavos === 12300));
  for (const tema of ['claro', 'escuro']) for (const largura of [1280, 390]) {
    await b.viewport(largura, 1100); await abrir('chamado=1&tema=' + tema); await pronto();
    assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
    await b.captura('os-' + largura + '-' + tema);
  }
  process.stdout.write('OK F11 params: edição completa inline, status, prioridade, nota, orçamento; capturas 1280/390 claro/escuro\n');
  await abrir('alvo=1'); await pronto();
  assert.equal(await b.avaliar(async () => await omni.storage.get('gi-os-alvo') ?? null), null);
  assert.equal(await b.avaliar(() => bancada.remocoesStorage), 1);
  await abrir('chamado=1&semstorage=1'); await pronto();
  await abrir('semstorage=1'); await b.esperar(() => !!document.querySelector('[data-os]'));
  await abrir('alvo=1&idade=61000'); await b.esperar(() => !!document.querySelector('[data-os]'));
  assert.equal(await b.avaliar(() => !!document.querySelector('#c-status')), false);
  await abrir('alvo=1&chamado=2'); await pronto();
  assert.match(await b.avaliar(() => document.querySelector('.gi-modal-topo').textContent), /Editar chamado 1002/);
  await abrir('alvo=-1'); await b.esperar(() => !!document.querySelector('[data-os]'));
  await abrir('alvo=1&idade=-10000'); await b.esperar(() => !!document.querySelector('[data-os]'));
  await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.avaliar(() => { const obter = GI.chamadosObter; GI.chamadosObter = n => new Promise(r => { bancada.liberarDetalhe = () => obter(n).then(r); }); });
  await b.clicar('[data-os="1"]'); await b.esperar(() => !!bancada.liberarDetalhe);
  await b.avaliar(async () => { await omni.chats.select(8802); });
  await b.esperar(() => document.querySelector('#os-lista').textContent.includes('Avulso'));
  await b.avaliar(() => bancada.liberarDetalhe());
  assert.equal(await b.avaliar(() => !!document.querySelector('#c-status')), false);
  await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.avaliar(() => {
    const obter = GI.chamadosPorContato;
    GI.chamadosPorContato = async n => {
      const r = await obter(n);
      return { rows: r.rows.map(c => ({ ...c, titulo: '<img src=x onerror="window.__xss=1">', imovel: { titulo: '<svg onload="window.__xss=1">' }, status: 'constructor', prioridade: '__proto__' })) };
    };
  });
  await b.clicar('#b-atualizar'); await b.esperar(() => document.querySelector('#os-lista').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#os-lista img, #os-lista svg').length), 0);
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  assert.match(await b.avaliar(() => document.querySelector('#os-lista').textContent), /Não informado/);
  await abrir('chat=8804'); await b.esperar(() => document.querySelector('#os-recado').textContent.includes('contato'));
  const toastsErroAntesDaOrientacao = await b.avaliar(() => bancada.toasts.filter(t => t.tipo === 'error').length);
  assert.equal(await b.avaliar(() => document.querySelector('#os-recado').getAttribute('role')), 'status', 'orientação de contato é informativa');
  assert.equal(await b.avaliar(() => document.querySelector('#os-recado').classList.contains('gi-recado--erro')), false);
  assert.equal(await b.avaliar(() => bancada.toasts.filter(t => t.tipo === 'error').length), toastsErroAntesDaOrientacao, 'orientação não gera toast de erro');
  await abrir('chat=0'); await b.esperar(() => document.querySelector('#os-recado').textContent.includes('atendimento'));
  await abrir('chat=8806'); await b.esperar(() => !document.querySelector('#b-novo').disabled);
  await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#c-cliente'));
  assert.match(await b.avaliar(() => document.querySelector('#c-cliente').value), /Sem Residência/);
  await abrir('chat=8802'); await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.clicar('#b-novo'); await b.esperar(() => document.querySelector('#c-locacao')?.value === '0');
  assert.match(await b.avaliar(() => document.querySelector('#c-cliente').value), /Dois/);
  process.stdout.write('OK F11 storage consumido, vencido/inválido ignorado, params prioritários; lista e novo do contato\n');
  await abrir(''); await b.esperar(() => !!document.querySelector('[data-os]'));
  await b.avaliar(() => { const obter = GI.chamadosPorContato; GI.chamadosPorContato = n => n === 9901 ? new Promise(r => { bancada.liberar = () => obter(n).then(r); }) : obter(n); });
  await b.clicar('#b-atualizar'); await b.esperar(() => !!bancada.liberar);
  await b.avaliar(async () => { await omni.chats.select(8802); });
  await b.esperar(() => document.querySelector('#os-lista').textContent.includes('Avulso'));
  await b.avaliar(() => bancada.liberar());
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#os-lista').textContent), /Vazamento/);
  for (const modo of ['local', 'fora']) {
    await abrir('modo=' + modo); await b.esperar(() => !document.querySelector('#gi-sem-portal').hidden);
    assert.equal(await b.avaliar(() => bancada.chamadas.some(c => c.method === 'POST')), false);
  }
  await abrir('chamado=99999'); await b.esperar(() => document.querySelector('#os-recado').textContent.includes('Não foi possível'));
  await abrir('demonstracao=1'); await b.esperar(() => !!document.querySelector('[data-os]')); await b.clicar('[data-os]');
  assert.equal(await b.avaliar(() => bancada.rede.length), 0);
  process.stdout.write('OK F11 isolamento na troca de atendimento; erro, sem portal e demonstração sem rede\n');
  for (const perfil of ['agente', 'supervisor', 'admin']) {
    await b.navegar(origem + '/app/painel.html?perfil=' + perfil);
    await b.esperar(() => !!document.querySelector('[data-gestao]'));
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-lista-completa]')), perfil === 'admin');
    await b.avaliar(() => { bancada.navegarContribuicao = false; });
    await b.avaliar(() => document.querySelector('[data-detalhes="1"]').closest('[data-os-id]').querySelector('[data-gestao]').click());
    await b.esperar(() => bancada.aberturas.length === 1);
    const a = await b.avaliar(async () => ({ abertura: bancada.aberturas[0], alvo: await omni.storage.get('gi-os-alvo') }));
    assert.equal(a.abertura.id, 'gi-os'); assert.equal(a.abertura.params.chamadoId, 1); assert.equal(a.abertura.params.contatoId, 9901); assert.equal(a.abertura.params.locacaoId, 1);
    assert.equal(a.alvo.chamadoId, 1); assert.equal(a.alvo.contatoId, 9901); assert.ok(Date.now() - a.alvo.em < 60000);
    await b.avaliar(() => { bancada.falharContribuicao = 'not_found'; }); await b.avaliar(() => document.querySelector('[data-detalhes="1"]').closest('[data-os-id]').querySelector('[data-gestao]').click());
    await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Não foi possível abrir a gestão deste chamado. Atualize a extensão e tente de novo.'));
  }
  await b.navegar(origem + '/app/painel.html?perfil=agente');
  await b.esperar(() => !!document.querySelector('[data-gestao]'));
  await b.avaliar(() => {
    const original = omni.contacts.get;
    omni.contacts.get = async id => { const pessoa = await original(id); delete pessoa.id; return pessoa; };
    bancada.navegarContribuicao = false;
    bancada.aberturas.length = 0;
  });
  await b.avaliar(() => document.querySelector('[data-detalhes="1"]').closest('[data-os-id]').querySelector('[data-gestao]').click()); await b.esperar(() => bancada.aberturas.length > 0);
  assert.equal(await b.avaliar(() => bancada.aberturas.at(-1).params.contatoId), 9901, 'usa chat.contactId quando o SDK omite contato.id');
  process.stdout.write('OK gestão usa chat.contactId quando contacts.get não traz id\n');
  // Simula o host que perde params entre cockpit e diálogo: só o storage encontra a O.S.
  await b.navegar(origem + '/app/painel.html?perfil=agente&semparams=1');
  await b.esperar(() => !!document.querySelector('[data-gestao]'));
  await b.avaliar(() => document.querySelector('[data-detalhes="1"]').closest('[data-os-id]').querySelector('[data-gestao]').click());
  await pronto();
  assert.match(await b.avaliar(() => location.pathname), /os.html$/);
  assert.match(await b.avaliar(() => document.querySelector('.gi-modal-topo').textContent), /Editar chamado 1001/);
  assert.equal(await b.avaliar(async () => await omni.storage.get('gi-os-alvo') ?? null), null);
  await b.clicar('#b-fechar'); await b.esperar(() => bancada.fechamentos === 1);
  await b.navegar(origem + '/app/painel.html?perfil=admin');
  await b.esperar(() => !!document.querySelector('[data-lista-completa]'));
  await b.avaliar(() => { bancada.navegarContribuicao = false; });
  await b.clicar('[data-lista-completa]');
  assert.equal(await b.avaliar(() => bancada.aberturas[0].id), 'gi-chamados');
  await b.clicar('#cp-atualizar'); await b.esperar(() => !!document.querySelector('[data-gestao]'));
  assert.deepEqual(b.erros, []);
  process.stdout.write('OK F11 cockpit: três perfis abrem gi-os com params e storage; Lista completa só administrador; not_found legível; params vazios via navegação e Fechar; zero exceções\n');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
