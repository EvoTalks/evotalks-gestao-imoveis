import assert from 'node:assert/strict';
export async function testarLoteY(b, origem, rodar = async (nome, fn) => { await fn(); process.stdout.write('OK F7: ' + nome + '\n'); }) {
  const api = async (rota, d) => {
    const r = await fetch(origem + '/api/ext' + rota, { method: d === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: d === undefined ? undefined : JSON.stringify(d) });
    assert.equal(r.ok, true); return r.json();
  };
  const criar = async () => (await api('/chamados', { locacao_id: 1, titulo: 'Lote Y sintético', categoria: 'outros', solicitante: { nome: 'Pessoa sintética', contato_id: 9901 } })).chamado.id;
  async function abrir(id) {
    await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
    // Relógio real para todos os cenários F7; a montagem também entra na contagem de rede.
    await b.avaliar(() => { GI.cotaPortal = GI.criarCotaPortal(); });
    await b.clicar('[data-editar="' + id + '"]'); await b.esperar(() => !!document.querySelector('#c-orc-nome'));
  }
  const esperarLivre = () => b.esperar(() => !document.querySelector('#c-salvar-orcamento').disabled);
  const dados = id => api('/chamados/' + id);
  async function escolherFoto() {
    await b.avaliar(() => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 100;
      c.getContext('2d').fillRect(0, 0, 200, 100);
      c.toBlob(blob => {
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'sintetica.png', { type: 'image/png' }));
        const input = document.querySelector('#c-pasta'); input.files = dt.files; input.dispatchEvent(new Event('change'));
      });
    });
    await b.esperar(() => document.querySelectorAll('#c-pendentes .gi-foto').length === 1 && !document.querySelector('.gi-modal [data-ok]').disabled);
  }
  await rodar('20 fotos: zero arquivos ao abrir, miniaturas e clique duplo com uma requisição', async () => {
    const id = await criar();
    const imagens = await b.avaliar(() => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 80;
      return Array.from({ length: 20 }, (_, i) => { const x = c.getContext('2d'); x.fillStyle = 'rgb(' + i * 10 + ',20,30)'; x.fillRect(0,0,160,80); return c.toDataURL('image/jpeg', 0.7).split(',')[1]; });
    });
    for (const [i, imagem] of imagens.entries()) await api('/chamados/' + id + '/anexos/upload', { nome: 'Sintética ' + i, mimetype: 'image/jpeg', dados_base64: imagem, ...(i ? { miniatura_base64: imagem } : {}) });
    await abrir(id);
    const chamadas = await b.avaliar(() => bancada.chamadas);
    assert.equal(chamadas.filter(c => /\/anexos\/\d+\/arquivo$/.test(c.caminho)).length, 0);
    assert.ok(chamadas.length <= 8, 'Montagem consumiu ' + chamadas.length + ' requisições');
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-fotos img').length), 19);
    assert.match(await b.avaliar(() => document.querySelector('#c-fotos').textContent), /Sintética 0/);
    await b.avaliar(() => { const corpo = document.querySelector('.gi-modal-corpo'); corpo.scrollTop += document.querySelector('#c-fotos').getBoundingClientRect().top - corpo.getBoundingClientRect().top; });
    await b.captura('lote-y-miniaturas');
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = async op => { if (/\/arquivo$/.test(op.url)) await new Promise(r => { bancada.liberarArquivo = r; }); return http(op); };
      const alvo = document.querySelector('#c-fotos [data-ampliar="1"]'); alvo.click(); alvo.click();
    });
    await b.esperar(() => !!bancada.liberarArquivo);
    await b.avaliar(() => bancada.liberarArquivo());
    await b.esperar(() => !!document.querySelector('#c-foto-ampliada img'));
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => /\/arquivo$/.test(c.caminho)).length), 1);
    await b.clicar('#c-fechar-foto'); assert.equal(await b.avaliar(() => document.querySelector('#c-foto-ampliada').hidden), true);
    process.stdout.write('OK F7 cota real: ' + chamadas.length + ' requisições ao abrir; 0 arquivos; clique duplo = 1 arquivo\n');
    // A cota real bloqueia a 31ª sem avançar o relógio.
    assert.equal(await b.avaliar(() => { try { for (let i = 0; i < 31; i++) GI.cotaPortal.reservar(); } catch (e) { return e.status; } }), 429);
  });
  await rodar('cancelar pelo campo opcional sem prompt e alternar a visibilidade', async () => {
    const id = await criar(); await abrir(id);
    assert.equal(await b.avaliar(() => !!document.querySelector('#c-motivo-cancelamento')), true);
    assert.equal(await b.avaliar(() => document.querySelector('#c-cancelamento-campo').hidden), true);
    await b.preencher('#c-status', 'cancelado'); assert.equal(await b.avaliar(() => document.querySelector('#c-cancelamento-campo').hidden), false);
    await b.preencher('#c-motivo-cancelamento', 'Motivo <img src=x onerror="window.hostilY=1">');
    await b.preencher('#c-status', 'triagem'); assert.equal(await b.avaliar(() => document.querySelector('#c-cancelamento-campo').hidden), true);
    await b.preencher('#c-status', 'cancelado'); await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    assert.equal(await b.avaliar(() => window.hostilY), undefined);
    assert.equal((await dados(id)).chamado.status, 'cancelado'); assert.match((await dados(id)).chamado.motivo_cancelamento, /Motivo <img/);
  });
  await rodar('orçamentos aplicam prioridade, nota e status; dados inválidos preservam os textos', async () => {
    const id = await criar(); await abrir(id);
    await b.preencher('#c-prioridade', 'alta'); await b.preencher('#c-status', 'triagem'); await b.preencher('#c-nota', 'Nota pendente sintética');
    await b.preencher('#c-orc-nome', 'Prestador Y sintético'); await b.preencher('#c-orc-observacao', 'Descrição preservada'); await b.clicar('#c-salvar-orcamento');
    await b.esperar(() => document.querySelectorAll('[data-escolher-orcamento]').length === 1); await esperarLivre();
    let d = await dados(id); assert.equal(d.chamado.prioridade, 'alta'); assert.equal(d.chamado.status, 'triagem');
    assert.ok(d.eventos.some(ev => ev.texto === 'Nota pendente sintética'));
    assert.equal(await b.avaliar(() => document.querySelector('#c-status').value), 'triagem');
    await b.preencher('#c-titulo', ''); await b.preencher('#c-nota', 'Não perder nota'); await b.preencher('#c-orc-nome', 'Não perder prestador'); await b.preencher('#c-orc-observacao', 'Não perder descrição');
    await b.clicar('#c-salvar-orcamento'); await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('título'));
    d = await dados(id); assert.equal(d.orcamentos.length, 1);
    assert.deepEqual(await b.avaliar(() => ['nota', 'orc-nome', 'orc-observacao'].map(id => document.querySelector('#c-' + id).value)), ['Não perder nota', 'Não perder prestador', 'Não perder descrição']);
    await b.preencher('#c-titulo', 'Título válido'); await b.preencher('#c-prioridade', 'emergencia'); await b.clicar('[data-escolher-orcamento]');
    await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('Escolhido')); await esperarLivre();
    assert.equal((await dados(id)).chamado.prioridade, 'emergencia');
    await b.preencher('#c-prioridade', 'normal'); await b.clicar('[data-apagar-orcamento]'); await b.clicar('[data-apagar-orcamento]');
    await b.esperar(() => !document.querySelector('[data-apagar-orcamento]')); assert.equal((await dados(id)).chamado.prioridade, 'normal');
  });
  await rodar('Salvar reúne nota e dados; 422 antes do orçamento preserva nota e descrição', async () => {
    const id = await criar(); await abrir(id);
    await b.preencher('#c-prioridade', 'alta'); await b.preencher('#c-nota', 'Nota junto do Salvar'); await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => !document.querySelector('.gi-modal'));
    let d = await dados(id); assert.equal(d.chamado.prioridade, 'alta'); assert.ok(d.eventos.some(ev => ev.texto === 'Nota junto do Salvar'));
    await abrir(id); await b.preencher('#c-orc-nome', 'Prestador preservado'); await b.preencher('#c-orc-observacao', 'Descrição preservada no 422'); await b.preencher('#c-nota', 'Nota preservada no 422');
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = op => {
        if (op.method === 'POST' && /\/chamados\/\d+$/.test(op.url)) { omni.http.request = http; return Promise.resolve({ status: 422, body: '{"erro":"dados_invalidos","campos":{"titulo":"Título recusado sintético"}}' }); }
        return http(op);
      };
    });
    await b.clicar('#c-salvar-orcamento'); await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Título recusado sintético')); await esperarLivre();
    assert.equal((await dados(id)).orcamentos.length, 0);
    assert.deepEqual(await b.avaliar(() => ['nota', 'orc-nome', 'orc-observacao'].map(id => document.querySelector('#c-' + id).value)), ['Nota preservada no 422', 'Prestador preservado', 'Descrição preservada no 422']);
    await escolherFoto(); await b.clicar('#c-salvar-orcamento');
    await b.esperar(() => document.querySelectorAll('[data-escolher-orcamento]').length === 1); await esperarLivre();
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes .gi-foto').length), 0);
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-fotos img').length), 1);
  });
  await rodar('aprovação e envio aplicam dados e nota; texto do proprietário usa o título salvo', async () => {
    const id = await criar();
    await api('/chamados/' + id, { quem_paga: 'proprietario' });
    const o = (await api('/chamados/' + id + '/orcamentos', { prestador_nome: 'Prestador aprovação sintético', valor_centavos: 50000 })).orcamento;
    await api('/chamados/' + id + '/orcamentos/' + o.id + '/escolher', {});
    await abrir(id);
    await b.preencher('#c-titulo', 'Título novo para o proprietário'); await b.preencher('#c-prioridade', 'alta');
    await b.preencher('#c-nota', 'Nota antes do proprietário');
    await b.clicar('#c-enviar-proprietario'); await b.esperar(() => !document.querySelector('#c-confirmacao').hidden);
    assert.match(await b.avaliar(() => document.querySelector('#c-confirmacao-texto').textContent), /Título novo para o proprietário/);
    await b.clicar('#c-confirmar-acao'); await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('registrada internamente')); await esperarLivre();
    let d = await dados(id); assert.equal(d.chamado.prioridade, 'alta'); assert.ok(d.eventos.some(ev => ev.texto === 'Nota antes do proprietário'));
    assert.ok(d.eventos.some(ev => (ev.texto || '').includes('Título novo para o proprietário')));
    await b.preencher('#c-prioridade', 'normal'); await b.preencher('#c-nota', 'Nota antes da decisão');
    await b.preencher('#c-aprovacao-por', 'Pessoa sintética'); await b.preencher('#c-aprovacao-canal', 'telefone'); await b.clicar('#c-aprovar');
    await b.esperar(() => document.querySelector('#c-aprovacao').textContent.includes('Aprovada')); await esperarLivre();
    d = await dados(id); assert.equal(d.chamado.prioridade, 'normal'); assert.ok(d.eventos.some(ev => ev.texto === 'Nota antes da decisão'));
    await b.preencher('#c-prioridade', 'alta'); await b.preencher('#c-aprovacao-por', 'Pessoa sintética'); await b.clicar('#c-recusar');
    await b.esperar(() => document.querySelector('#c-aprovacao').textContent.includes('Recusada')); await esperarLivre();
    assert.equal((await dados(id)).chamado.prioridade, 'alta');
    // Recusa provoca uma transição legítima do portal, que deve aparecer no select.
    assert.equal(await b.avaliar(() => document.querySelector('#c-status').value), 'aprovacao');
  });
  await rodar('falha da nota ao concluir preserva texto e fotos na retomada', async () => {
    const id = await criar(); await abrir(id); await escolherFoto();
    await b.preencher('#c-status', 'concluido'); await b.preencher('#c-nota', 'Nota que não pode sumir na retomada');
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = op => {
        if (op.method === 'POST' && op.url.endsWith('/notas')) { omni.http.request = http; return Promise.resolve({ status: 503, body: '{"erro":"nota_indisponivel_sintetica"}' }); }
        return http(op);
      };
    });
    await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => document.querySelector('#c-dados')?.disabled && document.querySelectorAll('#c-pendentes .gi-foto').length === 1);
    assert.equal(await b.avaliar(() => document.querySelector('#c-nota').value), 'Nota que não pode sumir na retomada');
    await b.clicar('#c-salvar-nota'); await b.esperar(() => document.querySelector('#c-nota').value === '' && !document.querySelector('.gi-modal [data-ok]').disabled);
    await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    const d = await dados(id); assert.equal(d.chamado.status, 'concluido'); assert.equal(d.anexos.length, 1);
    assert.equal(d.eventos.filter(ev => ev.texto === 'Nota que não pode sumir na retomada').length, 1);
  });
  await rodar('Fechar, X e Escape confirmam descarte; cancelar preserva e envia fotos', async () => {
    const id = await criar();
    for (const modo of ['fechar', 'x', 'escape']) {
      await abrir(id); await escolherFoto();
      if (modo === 'escape') await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      else await b.clicar(modo === 'x' ? '.gi-modal-x' : '.gi-modal [data-cancelar]');
      assert.equal(await b.avaliar(() => document.querySelector('#c-descarte')?.hidden), false);
      assert.match(await b.avaliar(() => document.querySelector('#c-descarte').textContent), /Descartar 1 foto/);
      await b.clicar('#c-voltar-descarte'); assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes .gi-foto').length), 1);
      await b.clicar('.gi-modal [data-cancelar]'); await b.captura('lote-y-descarte'); await b.clicar('#c-descartar'); await b.esperar(() => !document.querySelector('.gi-modal'));
    }
    await abrir(id); await escolherFoto(); await b.preencher('#c-status', 'cancelado'); await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    const d = await dados(id); assert.equal(d.chamado.status, 'cancelado'); assert.equal(d.anexos.length, 1); assert.ok(d.anexos[0].miniatura_base64);
    assert.deepEqual(await b.avaliar(async mini => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + mini; await img.decode(); return [img.naturalWidth, img.naturalHeight]; }, d.anexos[0].miniatura_base64), [160,80]);
  });
}
