import assert from 'node:assert/strict';

export async function testarStatus(b, origem) {
  const prova = s => process.stdout.write('OK F8: ' + s + '\n');
  const seletor = id => '[data-status-id="' + id + '"]';
  const linha = id => '[data-editar="' + id + '"]';
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const fechar = async () => { await b.clicar('.gi-modal [data-cancelar]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  const abrir = async id => { await b.esperar(s => !!document.querySelector(s), linha(id)); await b.clicar(linha(id)); await b.esperar(() => !!document.querySelector('#c-orc-nome')); };
  const terminou = async (id, valor) => b.esperar((id, valor) => {
    const s = document.querySelector('[data-status-id="' + id + '"]'); return s && !s.disabled && s.value === valor;
  }, id, valor);
  const contar = () => b.avaliar(() => bancada.chamadas.length);
  const obter = id => b.avaliar(async id => GI.chamadosObter(id), id);
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-status-id]').length), 8);
  await b.avaliar(() => {
    bancada.primeiraLinha = document.querySelector('[data-editar="1"]').closest('tr');
    bancada.outraLinha = document.querySelector('[data-editar="2"]').closest('tr');
  });
  let antes = await contar();
  await b.preencher(seletor(1), 'triagem'); await terminou(1, 'triagem');
  assert.equal(await contar(), antes + 1);
  assert.equal(await b.avaliar(() => bancada.primeiraLinha === document.querySelector('[data-editar="1"]').closest('tr') && bancada.outraLinha === document.querySelector('[data-editar="2"]').closest('tr')), true);
  assert.match(await texto('#gi-resumo'), /0 emergências sem triagem/);
  assert.match(await texto('[data-status-controle="1"]'), /OS-1001: Novo → Triagem/);
  assert.notEqual(await b.avaliar(() => document.querySelector('[data-editar="1"]').closest('tr').cells[5].textContent), 'Responder já');
  prova('lista grava com uma requisição, atualiza prazo/resumo e preserva os nós das linhas');

  for (const [id, destino, anterior, frase] of [[4, 'execucao', 'aprovacao', 'Gestão → Aprovação'], [2, 'agendado', 'triagem', 'visita'], [7, 'execucao', 'concluido', 'encerrado']]) {
    if (id === 7) {
      assert.deepEqual(await b.avaliar(s => Array.from(document.querySelector(s).options, o => o.value), seletor(id)), ['concluido', 'triagem']);
      await b.avaliar(s => { const o = document.createElement('option'); o.value = 'execucao'; o.textContent = 'Opção obsoleta sintética'; document.querySelector(s).appendChild(o); }, seletor(id));
    }
    antes = await contar(); await b.preencher(seletor(id), destino); await terminou(id, anterior);
    assert.match(await texto('[data-status-controle="' + id + '"]'), new RegExp(frase));
    assert.equal(await contar(), antes + 1);
  }
  await b.preencher(seletor(7), 'triagem'); await terminou(7, 'triagem');
  assert.match(await texto('#gi-resumo'), /7 chamados abertos/);
  prova('409 pendente/encerrado e 422 visita restauram select; concluído reabre em Triagem');

  await abrir(4);
  await b.preencher('#c-titulo', 'Rascunho sintético preservado'); await b.preencher('#c-descricao', 'Descrição ainda não salva');
  await b.preencher('#c-orc-nome', 'Prestador rascunho'); await b.preencher('#c-nota', 'Nota ainda não salva');
  antes = await contar(); await b.preencher('#c-status', 'execucao');
  await b.esperar(() => document.querySelector('#c-status').value === 'aprovacao' && !document.querySelector('#c-status').disabled);
  assert.match(await texto('#c-status-controle'), /Gestão → Aprovação/);
  await b.clicar('#c-status-controle [data-status-decisao]'); assert.equal(await b.avaliar(() => document.querySelector('#c-mais').open), true);
  assert.equal(await contar(), antes + 1);
  await b.preencher('#c-status', 'orcamento'); await b.esperar(() => document.querySelector('#c-selo').textContent.includes('Orçamento'));
  assert.equal(await b.avaliar(() => document.querySelector('#c-status').disabled), false);
  assert.equal(await b.avaliar(() => document.querySelector('#c-titulo').value), 'Rascunho sintético preservado');
  assert.equal(await b.avaliar(() => document.querySelector('#c-descricao').value), 'Descrição ainda não salva');
  assert.equal(await b.avaliar(() => document.querySelector('#c-orc-nome').value), 'Prestador rascunho');
  assert.equal(await b.avaliar(() => document.querySelector('#c-nota').value), 'Nota ainda não salva');
  assert.match(await texto('#c-prazo'), /Vence|Atrasado/);
  assert.equal((await obter(4)).chamado.titulo, 'Manutenção Demonstração 4');
  assert.equal(await b.avaliar(() => document.querySelector('[data-status-id="4"]').value), 'orcamento');
  assert.match(await texto('[data-status-controle="4"]'), /Aprovação → Orçamento/);
  antes = await contar(); await fechar(); assert.equal(await contar(), antes);
  // Recusa não deixa status pendente capaz de bloquear um orçamento.
  await abrir(2); await b.preencher('#c-status', 'aprovacao');
  await b.esperar(() => document.querySelector('#c-status').value === 'triagem' && !document.querySelector('#c-status').disabled);
  await b.preencher('#c-orc-nome', 'Prestador sintético status recusado'); await b.clicar('#c-salvar-orcamento');
  await b.esperar(() => document.querySelector('#c-orcamentos').textContent.includes('Prestador sintético status recusado'));
  assert.equal((await obter(2)).chamado.status, 'triagem'); await fechar();
  await abrir(2); antes = await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/status')).length);
  await b.preencher('#c-titulo', 'Título salvo sem status'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/status')).length), antes);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST' && /\/chamados\/2$/.test(c.caminho)).some(c => Object.hasOwn(JSON.parse(c.body), 'status'))), false);
  prova('modal grava independente dos rascunhos, atualiza selo/prazo/linha, oferece decisão e orçamento funciona após recusa');

  for (const modal of [false, true]) {
    if (modal) await abrir(3);
    const s = modal ? '#c-status' : seletor(3), controle = modal ? '#c-status-controle' : '[data-status-controle="3"]';
    antes = await contar(); await b.preencher(s, 'cancelado');
    assert.match(await texto(controle), /Cancelar este chamado\?/); assert.equal(await contar(), antes);
    if (modal) {
      await b.clicar('.gi-modal [data-ok]');
      await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('Confirme o cancelamento'));
      assert.equal(await contar(), antes);
    }
    await b.clicar(controle + ' [data-status-voltar]'); assert.equal(await contar(), antes);
    assert.equal(await b.avaliar(s => document.querySelector(s).value, s), 'orcamento');
    await b.preencher(s, 'cancelado'); await b.preencher(controle + ' [data-status-motivo]', 'Motivo sintético <img src=x>');
    await b.clicar(controle + ' [data-status-confirmar]'); await terminou(3, 'cancelado');
    assert.equal(await contar(), antes + 1); assert.equal((await obter(3)).chamado.motivo_cancelamento, 'Motivo sintético <img src=x>');
    if (modal) await fechar();
    await b.preencher(seletor(3), 'triagem'); await terminou(3, 'triagem');
    await b.preencher(seletor(3), 'orcamento'); await terminou(3, 'orcamento');
  }
  prova('cancelamento inline na lista e modal: Voltar não grava, confirmar envia motivo escapado');

  await b.avaliar(() => {
    const original = omni.http.request; bancada.statusAtivos = 0; bancada.statusMax = 0;
    omni.http.request = async op => {
      if (!op.url.endsWith('/status')) return original(op);
      bancada.statusAtivos++; bancada.statusMax = Math.max(bancada.statusMax, bancada.statusAtivos);
      try { await new Promise(r => setTimeout(r, 180)); return await original(op); } finally { bancada.statusAtivos--; }
    };
  });
  antes = await contar(); await b.preencher(seletor(1), 'orcamento');
  assert.equal(await b.avaliar(() => document.querySelector('[data-status-id="1"]').disabled), true);
  assert.match(await texto('[data-status-controle="1"]'), /Gravando/);
  await b.preencher(seletor(1), 'execucao'); // Evento programático durante o bloqueio também não duplica.
  await b.preencher(seletor(2), 'orcamento'); await terminou(1, 'orcamento'); await terminou(2, 'orcamento');
  assert.equal(await contar(), antes + 2); assert.equal(await b.avaliar(() => bancada.statusMax), 1);
  prova('clique repetido não duplica e várias linhas gravam em fila, máximo de uma requisição ativa');

  await b.avaliar(async () => GI.chamadosAprovacao(4, { acao: 'recusada', por: 'Pessoa sintética', canal: 'telefone' }));
  await b.clicar('#b-buscar'); await b.esperar(() => !!document.querySelector('[data-editar="4"]'));
  await b.preencher(seletor(4), 'execucao'); await terminou(4, 'aprovacao');
  assert.match(await texto('[data-status-controle="4"]'), /recusou/);
  await abrir(4); await b.preencher('#c-status', 'execucao');
  await b.esperar(() => !document.querySelector('#c-status').disabled);
  assert.match(await texto('#c-status-controle'), /recusou/);
  assert.equal(await b.avaliar(() => document.querySelector('#c-status-controle [data-status-decisao]').hidden), false);
  await fechar(); prova('aprovação recusada restaura select e oferece Registrar decisão no modal');

  // A foto inteira é sintética e só é lida no clique, inclusive nos terminais.
  const foto = await b.avaliar(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 10;
    canvas.getContext('2d').fillRect(0, 0, 12, 10);
    return (await GI.chamadosAnexoUpload(1, { nome: 'Foto sintética', mimetype: 'image/png', dados_base64: canvas.toDataURL('image/png').split(',')[1] })).anexo;
  });
  for (const terminal of ['concluido', 'cancelado']) {
    await b.avaliar(async status => GI.chamadosStatus(1, status), terminal);
    await b.clicar('#b-buscar'); await b.esperar(() => !!document.querySelector('[data-editar="1"]'));
    await abrir(1); antes = await contar();
    assert.equal(await b.avaliar(() => ['#c-buscar-pasta', '#c-carregar-fotos', '#c-pasta'].every(s => document.querySelector(s).matches(':disabled'))), true);
    assert.equal(await b.avaliar(() => document.querySelector('[data-ampliar]').matches(':disabled')), false);
    await b.clicar('[data-ampliar]'); await b.esperar(() => !document.querySelector('#c-foto-ampliada').hidden);
    assert.equal(await contar(), antes + 1); await b.clicar('#c-fechar-foto'); await b.clicar('[data-ampliar]');
    assert.equal(await contar(), antes + 1); await b.clicar('#c-fechar-foto'); await fechar();
    if (terminal === 'concluido') await b.avaliar(async () => GI.chamadosStatus(1, 'triagem'));
  }
  assert.ok(foto.id); prova('concluído/cancelado abrem e fecham foto inteira com um clique/uma requisição; adicionar permanece bloqueado');

  // Resposta sem objeto provoca releitura; falha nessa leitura recarrega a lista.
  await b.avaliar(() => {
    const original = omni.http.request; let falharLeitura = false;
    omni.http.request = async op => {
      if (op.url.endsWith('/2/status')) { const r = await original(op); if (r.status === 200) { falharLeitura = true; return { status: 200, body: '{"ok":true}' }; } return r; }
      if (falharLeitura && op.method === 'GET' && op.url.endsWith('/chamados/2')) { falharLeitura = false; return { status: 503, body: '{}' }; }
      return original(op);
    };
  });
  await b.preencher(seletor(2), 'triagem'); await terminou(2, 'triagem');
  prova('falha na releitura após gravação recarrega a lista e recupera o estado real');

  for (const tema of ['', '?tema=escuro']) {
    await b.navegar(origem + '/app/chamados.html' + tema); await b.viewport(390, 844); await b.esperar(() => !!document.querySelector('[data-status-id]'));
    await b.avaliar(() => {
      const tabela = document.querySelector('.gi-tabela-rolagem'); tabela.scrollLeft = tabela.scrollWidth;
      document.querySelector('[data-status-id]').scrollIntoView({ block: 'center' });
    });
    await b.captura('status-lista-390-' + (tema ? 'escuro' : 'claro'));
    await abrir(4); await b.captura('status-modal-390-' + (tema ? 'escuro' : 'claro')); await fechar();
  }
  await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !!document.querySelector('[data-editar]'));
  await b.avaliar(() => {
    const original = omni.http.request;
    omni.http.request = async op => {
      const r = await original(op);
      if (op.method === 'GET' && op.url.includes('/chamados')) {
        const d = JSON.parse(r.body); (d.rows || [d.chamado]).filter(Boolean).forEach((c, i) => { c.status = i % 2 ? '__proto__' : 'constructor'; }); return { ...r, body: JSON.stringify(d) };
      }
      return r;
    };
  });
  await b.clicar('#b-buscar'); await b.esperar(() => !!document.querySelector('option[value="constructor"]'));
  assert.match(await texto('#gi-corpo'), /Não informado/); await abrir(4);
  assert.match(await texto('#c-selo'), /Não informado/); await fechar();
  for (const modo of ['local', 'fora', 'demonstracao']) {
    await b.navegar(origem + '/app/chamados.html?' + (modo === 'demonstracao' ? 'demonstracao=1' : 'modo=' + modo));
    await b.esperar(() => document.querySelector('#b-novo').disabled);
    assert.equal(await b.avaliar(() => Array.from(document.querySelectorAll('select')).every(s => s.disabled)), true);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/status')).length), 0);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.includes('/chamados')).length), 0);
    if (modo !== 'fora') assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
  }
  assert.deepEqual(b.erros, []); prova('390 px claro/escuro, status hostil seguro, sem portal/demonstração desabilitados com zero requisições de manutenção');
}
