import assert from 'node:assert/strict';

export async function testarReview1(b, base) {
  const pronto = () => b.esperar(() => !!document.querySelector('[data-chamado]'));
  const abrirIncerta = async titulo => {
    await b.navegar(base + '?escrita=1'); await pronto();
    await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.preencher('#cp-titulo', titulo); await b.clicar('#cp-revisar');
    await b.avaliar(() => {
      bancada.salvarOriginal = document.querySelector('#cp-confirmar').onclick;
      bancada.postsReview = 0;
      const http = omni.http.request;
      bancada.httpReview = http;
      omni.http.request = async op => {
        if (op.method === 'POST' && op.url.endsWith('/chamados')) {
          bancada.postsReview++;
          throw Object.assign(new Error('Resposta perdida sintética'), { code: 'timeout' });
        }
        if (op.url.includes('/contatos/') && op.url.endsWith('/chamados')) throw new Error('Releitura indisponível sintética');
        return http(op);
      };
    });
    await b.clicar('#cp-confirmar');
    await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Conferir se abriu');
  };
  const falhas = [];
  async function caso(nome, fn) {
    try { await fn(); process.stdout.write('OK F17 ' + nome + '\n'); }
    catch (erro) { falhas.push(erro); process.stderr.write('FALHA F17 ' + nome + ': ' + erro.message + '\n'); }
  }
  await caso('trava de criação incerta inclusive edição, revisão e Enter', async () => {
    await abrirIncerta('Criação incerta sintética F17');
    // Mesmo uma referência antiga ao handler de salvar não pode contornar a trava.
    await b.avaliar(async () => { await bancada.salvarOriginal(); });
    assert.equal(await b.avaliar(() => bancada.postsReview), 1, 'salvar incerto só pode conferir por GET');
    await b.clicar('#cp-voltar');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-revisar').textContent), 'Conferir se abriu');
    await b.avaliar(async () => { await document.querySelector('#cp-form').onsubmit(new Event('submit', { cancelable: true })); });
    assert.equal(await b.avaliar(() => bancada.postsReview), 1, 'Enter no formulário não repete POST');
    await b.clicar('#cp-tab-chamados'); await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    assert.equal(await b.avaliar(() => document.querySelector('#cp-revisar').textContent), 'Conferir se abriu');
    await b.avaliar(() => {
      GI.chamadosPorContato = async () => ({ rows: [] });
      omni.http.request = async op => {
        if (op.method === 'POST' && op.url.endsWith('/chamados')) bancada.postsReview++;
        return bancada.httpReview(op);
      };
    });
    await b.clicar('#cp-revisar');
    await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Não consegui falar com o servidor. O chamado não foi aberto. Confira sua conexão e tente de novo.'));
    assert.equal(await b.avaliar(() => bancada.postsReview), 1);
    await b.preencher('#cp-titulo', 'Criação liberada sintética F17');
    await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
    await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    assert.equal(await b.avaliar(() => bancada.postsReview), 2, 'só depois da ausência confirmada permite uma criação');
  });
  await caso('cache compartilhado: diálogo reabre O.S. e cockpit remonta em Triagem', async () => {
    await b.navegar(base + '?escrita=1&persistir=1'); await pronto();
    await b.esperar(() => !!sessionStorage.getItem('gi-cockpit-snapshots-v1'));
    const alvo = await b.avaliar(async () => {
      const s = await omni.storage.get('gi-cockpit-snapshots-v1');
      const c = s.rows.flatMap(r => r.dados.chamados).find(c => c.status === 'concluido');
      return { id: c.id, numero: c.numero };
    });
    await b.navegar(base.replace('/painel.html', '/os.html') + '?persistir=1&chamado=' + alvo.id);
    await b.esperar(() => !!document.querySelector('#c-status') && !document.querySelector('#c-status').disabled);
    await b.preencher('#c-status', 'triagem');
    await b.esperar(() => document.querySelector('#c-status').value === 'triagem' && !document.querySelector('#c-status').disabled);
    const snapshot = await b.avaliar(async () => omni.storage.get('gi-cockpit-snapshots-v1'));
    assert.ok(!snapshot || !snapshot.rows?.length, 'gravação no diálogo invalida snapshot do cockpit');
    await b.navegar(base + '?escrita=1&persistir=1'); await pronto();
    assert.equal(await b.avaliar(n => [...document.querySelectorAll('details[data-chamado]')].find(el => el.textContent.includes('OS-' + n))?.querySelector('[data-rapida="status"]').value, alvo.numero), 'triagem');
    await b.navegar(base.replace('/painel.html', '/os.html') + '?persistir=1&chamado=' + alvo.id);
    await b.esperar(() => !!document.querySelector('#c-status') && !document.querySelector('#c-status').disabled);
    // Restaura o estado da fixture e prova falhas síncrona e assíncrona do storage.
    for (const sincrona of [true, false]) {
      const status = sincrona ? 'novo' : 'concluido';
      await b.avaliar(sincrona => {
        omni.storage.set = () => { if (sincrona) throw new Error('Storage sintético fora'); return Promise.reject(new Error('Storage sintético fora')); };
      }, sincrona);
      await b.preencher('#c-status', status);
      await b.esperar(status => document.querySelector('#c-status').value === status && !document.querySelector('#c-status').disabled, status);
      assert.equal(await b.avaliar(async id => (await GI.chamadosObter(id)).chamado.status, alvo.id), status);
    }
  });
  await caso('conferência cruza título, residência, atendimento e criado_em', async () => {
    for (const tipo of ['residencia', 'atendimento', 'antigo', 'data-ausente', 'data-numerica', 'janela-fora', 'correspondente', 'janela-dentro', 'normalizado', 'mais-recente', 'sem-atendimento']) {
      await abrirIncerta('Vazamento Sintético F17');
      await b.avaliar(tipo => {
        const agora = Date.now();
        const c = { id: 99990, numero: 99990, titulo: 'Vazamento Sintético F17', status: 'novo', locacao_id: 1, atendimento: { chat_id: 8801 }, criado_em: new Date(agora).toISOString() };
        if (tipo === 'residencia') c.locacao_id = 3;
        if (tipo === 'atendimento') c.atendimento.chat_id = 8802;
        if (tipo === 'antigo') c.criado_em = new Date(agora - 86400000).toISOString();
        if (tipo === 'data-ausente') delete c.criado_em;
        if (tipo === 'data-numerica') c.criado_em = agora;
        if (tipo === 'janela-fora') c.criado_em = new Date(agora - 121000).toISOString();
        if (tipo === 'janela-dentro') c.criado_em = new Date(agora - 119000).toISOString();
        if (tipo === 'normalizado') c.titulo = '  VAZAMENTO   sintético F17  ';
        if (tipo === 'sem-atendimento') c.atendimento = null;
        GI.chamadosPorContato = async () => ({ rows: tipo === 'mais-recente' ? [{ ...c, numero: 99989, criado_em: new Date(agora - 60000).toISOString() }, c] : [c] });
      }, tipo);
      await b.clicar('#cp-confirmar');
      const encontra = ['correspondente', 'janela-dentro', 'normalizado', 'mais-recente', 'sem-atendimento'].includes(tipo);
      await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent !== 'Conferindo…');
      assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').textContent), encontra ? 'OS-99990 aberta ✓' : 'Tentar de novo', tipo);
      assert.equal(await b.avaliar(() => bancada.postsReview), 1, tipo + ': nunca reconcilia por POST');
    }
  });
  assert.deepEqual(b.erros, [], 'nenhuma exceção no navegador');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões F17: ' + falhas.length);
}
