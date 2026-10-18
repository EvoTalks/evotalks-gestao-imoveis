import assert from 'node:assert/strict';
export async function testarAtendente(b, origem, chamadoId, verificarNota) {
  for (const perfil of ['agente', 'supervisor', 'admin']) {
    await b.navegar(origem + '/app/painel.html?escrita=1&perfil=' + perfil);
    await b.esperar(() => !!document.querySelector('[data-chamado]'));
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-gestao]')), perfil === 'admin');
    if (perfil !== 'agente') continue;
    await b.clicar('[data-detalhes="' + chamadoId + '"]');
    await b.esperar(() => !!document.querySelector('[data-nota]'));
    const nota = '<img src=x onerror="window.__xss=1"> Nota sintética cockpit';
    await b.preencher('[data-nota]', nota);
    await b.clicar('[data-avisar]'); await b.clicar('[data-salvar-nota]');
    assert.equal(await b.avaliar(() => bancada.mensagens.length), 0, 'aviso exige confirmação');
    await b.clicar('[data-confirmar-nota]');
    await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('Nota salva') && !document.querySelector('[data-salvar-nota]').disabled);
    assert.deepEqual(await b.avaliar(() => bancada.mensagens), [{ chatId: 8801, payload: { text: nota } }]);
    assert.equal(await b.avaliar(() => window.__xss), undefined);
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-observacoes] img').length), 0);
    await verificarNota(chamadoId, nota);
    await b.preencher('[data-nota]', 'Nota interna sintética cockpit'); await b.clicar('[data-salvar-nota]');
    await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('Nota salva') && !document.querySelector('[data-salvar-nota]').disabled);
    assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
    await verificarNota(chamadoId, 'Nota interna sintética cockpit');
  }
}

/* Recusas pertencem à bancada sintética; os cenários de ouro não as injetam. */
export async function testarRecusasAtendente(b, origem) {
  const iniciar = async (detalhes = true) => {
    await b.navegar(origem + '/app/painel.html?perfil=agente&escrita=1');
    await b.esperar(() => !!document.querySelector('[data-chamado]'));
    if (detalhes) { await b.clicar('[data-detalhes="1"]'); await b.esperar(() => !!document.querySelector('[data-nota]')); }
  };
  await iniciar();
  await b.avaliar(() => { bancada.recusarEnvio = true; });
  await b.preencher('[data-nota]', 'Nota preservada sem janela'); await b.clicar('[data-avisar]');
  await b.clicar('[data-salvar-nota]'); await b.clicar('[data-confirmar-nota]');
  await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('24 horas'));
  let d = await b.avaliar(async () => GI.chamadosObter(1));
  assert.equal(d.eventos.at(-1).texto, 'Nota preservada sem janela'); assert.equal(d.eventos.at(-1).notificou_cliente, false);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  await iniciar();
  await b.avaliar(() => {
    const http = omni.http.request;
    omni.http.request = op => {
      if (op.method === 'POST' && op.url.endsWith('/notas')) {
        omni.http.request = http; return Promise.resolve({ status: 503, body: '{"erro":"registro_indisponivel_sintetico"}' });
      }
      return http(op);
    };
  });
  await b.preencher('[data-nota]', 'Aviso sem duplicação'); await b.clicar('[data-avisar]');
  await b.clicar('[data-salvar-nota]'); await b.clicar('[data-confirmar-nota]');
  await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('Aviso enviado;'));
  assert.equal(await b.avaliar(() => document.querySelector('[data-nota]').value), 'Aviso sem duplicação');
  await b.clicar('[data-confirmar-nota]'); await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('Nota salva') && !document.querySelector('[data-salvar-nota]').disabled);
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
  d = await b.avaliar(async () => GI.chamadosObter(1)); assert.equal(d.eventos.at(-1).notificou_cliente, true);
  await iniciar();
  await b.preencher('[data-nota]', 'Primeiro texto'); await b.clicar('[data-avisar]'); await b.clicar('[data-salvar-nota]');
  await b.preencher('[data-nota]', 'Texto alterado'); await b.clicar('[data-confirmar-nota]');
  assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
  assert.match(await b.avaliar(() => document.querySelector('[data-recado-nota]').textContent), /Revise/);
  await iniciar();
  await b.avaliar(() => {
    const http = omni.http.request; let falhar = false;
    omni.http.request = async op => {
      if (op.method === 'POST' && op.url.endsWith('/notas')) { const r = await http(op); falhar = true; return r; }
      if (falhar && op.method === 'GET' && /\/chamados\/1$/.test(op.url)) {
        omni.http.request = http; return { status: 503, body: '{"erro":"releitura_indisponivel_sintetica"}' };
      }
      return http(op);
    };
  });
  await b.preencher('[data-nota]', 'Nota gravada com releitura indisponível'); await b.clicar('[data-salvar-nota]');
  await b.esperar(() => document.querySelector('[data-recado-nota]').textContent.includes('Nota salva. Não foi possível atualizar'));
  assert.equal(await b.avaliar(() => document.querySelector('[data-nota]').value), '');
  d = await b.avaliar(async () => GI.chamadosObter(1));
  assert.equal(d.eventos.filter(e => e.texto === 'Nota gravada com releitura indisponível').length, 1);
  await iniciar(false);
  await b.avaliar(() => {
    const obter = GI.chamadosObter; GI.chamadosObter = async id => { await new Promise(r => { bancada.liberarDetalhe = r; }); return obter(id); };
  });
  await b.clicar('[data-detalhes="1"]');
  await b.esperar(() => !!bancada.liberarDetalhe);
  await b.avaliar(async () => { await omni.chats.select(8802); });
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  await b.avaliar(() => bancada.liberarDetalhe());
  await new Promise(r => setTimeout(r, 100));
  assert.equal(await b.avaliar(() => !!document.querySelector('[data-nota]')), false);
  assert.match(await b.avaliar(() => document.querySelector('#cp-nome').textContent), /Dois/);
}
