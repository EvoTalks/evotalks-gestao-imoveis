import assert from 'node:assert/strict';
const hostil = '<img src=x onerror="window.__xss=1">';
const texto = (b, s) => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
const prova = t => process.stdout.write('OK F10 ' + t + '\n');

export async function testarHistorico(b, origem) {
  let chamadoId;
  const navegar = async (perfil = 'admin') => {
    await b.navegar(origem + '/app/chamados.html?perfil=' + perfil); await b.esperar(() => !!document.querySelector('[data-editar="1"]'));
    if (!chamadoId) {
      chamadoId = await b.avaliar(async () => (await GI.chamadosCriar({ locacao_id: 1, titulo: 'Vínculo F10 Sintético', categoria: 'outros', solicitante: { contato_id: 9901, nome: 'Locatário Demonstração Um', telefone: '00000000001' } })).chamado.id);
      await b.clicar('#b-buscar');
    }
    await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), chamadoId);
  };
  const abrir = async () => { await b.clicar('[data-editar="' + chamadoId + '"]'); await b.esperar(() => !!document.querySelector('#c-trocar')); await b.clicar('#c-trocar'); await b.esperar(() => !document.querySelector('#c-atendimentos').textContent.includes('Buscando')); };
  const fechar = async () => { await b.clicar('.gi-modal [data-cancelar]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  await navegar();
  await b.avaliar(h => { bancada.historico = [
    { id: 8899, status: 0, begintime: '2026-10-20T12:34:00.000Z', origin: 999, protocol: 'DEMO-INVALIDO-ENCERRADO', qname: h, endreason: h },
    { id: 8801, status: 1, begintime: '2026-10-17T12:00:00.000Z', origin: 0, protocol: '', qname: 'Fila Histórica Sintética' }
  ]; }, hostil);
  await abrir();
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-atendimento]').length), 3);
  assert.match(await texto(b, '[data-atendimento="0"]'), /20\/10\/2026.*Atendimento.*Encerrado/);
  assert.match(await texto(b, '[data-atendimento="2"]'), /Fila Histórica Sintética.*Aberto.*foto-demonstracao/);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#c-atendimentos img, #c-atendimentos script').length), 0);
  await b.clicar('#c-trocar'); assert.equal(await b.avaliar(() => bancada.consultasHistorico), 1, 'cache enquanto o contato é o mesmo');
  await b.viewport(390, 1100); await b.captura('vinculos-historico-390');
  await b.clicar('[data-atendimento="0"]'); await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('#8899') && !document.querySelector('#c-tirar-vinculo').disabled);
  let d = await b.avaliar(async id => GI.chamadosObter(id), chamadoId);
  assert.deepEqual(d.chamado.atendimento, { chat_id: 8899, protocolo: 'DEMO-INVALIDO-ENCERRADO', canal: 'Atendimento', fila: hostil, iniciado_em: '2026-10-20T12:34:00.000Z' });
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
  await abrir(); assert.match(await texto(b, '#c-vinculo'), /#8899/); await fechar();
  prova('histórico ordenado e deduplicado, cache, encerrado gravado com metadados, texto hostil escapado');

  await navegar('agente');
  await b.avaliar(() => { bancada.historico = []; omni.chats.listMine = async () => []; });
  await abrir(); assert.match(await texto(b, '#c-atendimentos'), /Nenhum atendimento deste cliente nas suas filas/);
  assert.equal(await b.avaliar(() => !!document.querySelector('#c-manual')), false); await fechar();
  await navegar(); await b.avaliar(() => { bancada.historico = []; omni.chats.listMine = async () => []; omni.queues.list = async () => []; });
  await abrir(); assert.match(await texto(b, '#c-atendimentos'), /Este cliente ainda não tem atendimento/); await fechar();
  await navegar(); await b.avaliar(() => { bancada.falharHistorico = true; omni.queues.list = async () => { throw new Error('Filas indisponíveis'); }; }); await abrir();
  assert.match(await texto(b, '#c-atendimento-aviso'), /Não foi possível carregar o histórico completo deste cliente\./);
  assert.ok(await b.avaliar(() => document.querySelectorAll('[data-atendimento]').length > 0)); await fechar();
  await navegar(); await b.avaliar(() => { bancada.falharHistorico = bancada.falharLista = true; }); await abrir();
  assert.match(await texto(b, '#c-atendimentos'), /Não foi possível listar os atendimentos deste cliente. Tente de novo./);
  await b.avaliar(() => { bancada.falharHistorico = bancada.falharLista = false; });
  await b.clicar('#c-tentar-atendimentos'); await b.esperar(() => !!document.querySelector('[data-atendimento]'));
  assert.equal(await b.avaliar(() => bancada.consultasHistorico), 2); await fechar();
  prova('listas vazias por perfil, fallback do SDK, falha total e Tentar de novo recuperam a consulta');

  await navegar(); await b.avaliar(() => {
    bancada.historico = Array.from({ length: 25 }, (_, i) => ({ id: 8900 + i, status: 0, origin: 999, protocol: '', qname: 'Fila de Teste', begintime: new Date(Date.UTC(2026, 9, i + 1)).toISOString() }));
    omni.chats.listMine = async () => []; omni.queues.list = async () => [];
    bancada.mensagensLidas = 0; omni.chats.getMessages = async () => { bancada.mensagensLidas++; throw new Error('Histórico não pode buscar mensagens'); };
  });
  await abrir(); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-atendimento]').length), 10);
  await b.clicar('#c-mais-atendimentos'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-atendimento]').length), 20);
  await b.clicar('#c-mais-atendimentos'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-atendimento]').length), 25);
  assert.equal(await b.avaliar(() => !!document.querySelector('#c-mais-atendimentos')), false);
  assert.equal(await b.avaliar(() => bancada.consultasHistorico), 1); assert.equal(await b.avaliar(() => bancada.mensagensLidas), 0); await fechar();
  prova('25 atendimentos em páginas locais 10/20/25, uma consulta e nenhuma busca de mensagens no histórico');

  await navegar('agente'); await b.avaliar(() => {
    bancada.historico = id => id === 9901 ? new Promise(resolve => { bancada.liberarHistorico = () => resolve([{ id: 8999, status: 0, qname: 'CONTATO ANTERIOR', origin: 999 }]); }) : Promise.resolve([]);
  });
  await b.clicar('#b-novo'); await b.preencher('#c-cliente', 'Demonstração Um');
  await b.esperar(() => !!document.querySelector('[data-contato]')); await b.clicar('[data-contato]');
  await b.esperar(() => !!bancada.liberarHistorico);
  await b.preencher('#c-cliente', 'Demonstração Dois'); await b.esperar(() => !!document.querySelector('[data-contato]')); await b.clicar('[data-contato]');
  await b.esperar(() => !document.querySelector('#c-atendimentos').textContent.includes('Buscando'));
  await b.avaliar(() => bancada.liberarHistorico());
  await b.esperar(() => document.querySelector('#c-atendimentos').textContent.includes('Aberto'));
  assert.doesNotMatch(await texto(b, '#c-atendimentos'), /CONTATO ANTERIOR/); await fechar();
  prova('contato trocado durante histórico pendente não mistura listas');
}

export async function testarResidencias(b, origem) {
  const navegar = async q => {
    await b.navegar(origem + '/app/painel.html?chat=8806&' + ((q || '').includes('perfil=') ? '' : 'perfil=agente&') + (q || ''));
    await b.esperar(() => !!document.querySelector('#cp-vincular-residencia') && !document.querySelector('#cp-vincular-residencia').hidden);
  };
  const buscar = async (termo = 'DEMO-001') => {
    await b.clicar('#cp-vincular-residencia'); await b.preencher('#cp-r-busca', termo);
    await b.esperar(() => !!document.querySelector('[data-residencia]'));
  };
  const confirmar = async () => { await b.clicar('#cp-r-confirmar'); await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Residência vinculada.')); };
  const capturar = async nome => {
    assert.ok(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#gi-cockpit *')].every(el => el.scrollWidth <= el.clientWidth + 1 || ['INPUT','TEXTAREA','SELECT'].includes(el.tagName))), nome + ': sem overflow');
    await b.captura('residencia-' + nome);
  };
  let inicioVinculo;
  for (const tema of ['claro', 'escuro']) for (const largura of [260, 300, 334]) {
    await b.viewport(largura, 1100); await navegar('tema=' + tema);
    assert.match(await texto(b, '#cp-conteudo'), /Este contato ainda não tem residência vinculada\./);
    await capturar(largura + '-' + tema + '-vazio');
    inicioVinculo = await b.avaliar(() => bancada.chamadas.length);
    await buscar(); await capturar(largura + '-' + tema + '-busca');
    await b.preencher('#cp-r-contrato', 'DEMO-INVALIDO-CONTRATO'); await b.clicar('[data-residencia]');
    assert.match(await texto(b, '#cp-conteudo'), /Vincular.*Apartamento Demonstração Alfa.*Contato Sem Residência Demonstração/);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
    await capturar(largura + '-' + tema + '-confirmacao');
  }
  await confirmar();
  await b.esperar(() => bancada.chamadas.some(c => c.caminho.endsWith('/9905/chamados') && bancada.chamadas.filter(c => c.caminho.endsWith('/9905/chamados')).length === 2));
  const rs = await b.avaliar(n => bancada.chamadas.slice(n), inicioVinculo);
  assert.equal(rs.filter(c => c.method === 'POST').length, 1); assert.ok(rs.length <= 4, 'fluxo completo desde a busca respeita quatro requisições ao portal');
  const payload = JSON.parse(rs.find(c => c.method === 'POST').body);
  assert.deepEqual(payload, { imovel_codigo: 'DEMO-001', contrato_numero: 'DEMO-INVALIDO-CONTRATO', contatos: [{ contato_id: 9905, nome: 'Contato Sem Residência Demonstração', telefone: '00000000005', papel: 'locatario' }] });
  assert.match(await texto(b, '#cp-conteudo'), /Apartamento Demonstração Alfa/);
  assert.match(await texto(b, '#cp-vincular-residencia'), /Vincular outra residência/);
  await navegar('escrita=1'); await b.clicar('#cp-tab-novo'); assert.ok(await b.avaliar(() => !!document.querySelector('#cp-revisar')));
  prova('atendente vincula catálogo com confirmação, uma releitura por recurso e até 4 consultas; Novo disponível; 18 capturas sem overflow');

  await navegar('perfil=supervisor'); await b.clicar('#cp-vincular-residencia'); await b.clicar('#cp-r-fora');
  await b.clicar('#cp-r-form button[type=submit]'); assert.match(await texto(b, '#cp-recado'), /Informe o título/);
  await b.preencher('#cp-r-titulo', 'Avulso Sintético F10'); await b.preencher('#cp-r-endereco', 'Rua Inexistente, zero');
  await b.preencher('#cp-r-bairro', 'Bairro Fictício'); await b.preencher('#cp-r-cidade', 'Cidade Fictícia');
  await b.clicar('#cp-r-form button[type=submit]'); await b.clicar('#cp-r-voltar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-r-titulo').value), 'Avulso Sintético F10');
  await b.clicar('#cp-r-form button[type=submit]'); await confirmar();
  const livre = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST').body));
  assert.deepEqual(livre.imovel, { titulo: 'Avulso Sintético F10', endereco: 'Rua Inexistente, zero', bairro: 'Bairro Fictício', cidade: 'Cidade Fictícia' });
  assert.equal(livre.contatos[0].papel, 'locatario');
  prova('supervisor vincula fora do catálogo; título obrigatório, endereço e contrato opcionais, Voltar preserva dados');

  await navegar('perfil=admin'); await buscar('DEMO-002'); await b.clicar('[data-residencia]'); await b.clicar('#cp-r-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('já está locado'));
  assert.equal(await texto(b, '#cp-recado'), 'Este imóvel já está locado para outro cliente. Peça ao administrador para incluir este contato na locação.');
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 1);
  await navegar(); await buscar('DEMO-003'); await b.preencher('#cp-r-contrato', 'FORCAR-422'); await b.clicar('[data-residencia]'); await b.clicar('#cp-r-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Contrato recusado'));
  assert.equal(await b.avaliar(() => document.querySelector('#cp-r-confirmar').disabled), false);
  assert.equal(await b.avaliar(async () => (await GI.locacoes({ busca: 'DEMO-003' })).total), 0);
  prova('administrador recebe orientação de conflito; 422 mostra frase do campo e mantém formulário sem criar');

  await navegar(); await b.clicar('#cp-vincular-residencia');
  await b.avaliar(() => {
    bancada.buscasF10 = []; GI.buscarImoveis = async f => {
      bancada.buscasF10.push({ ...f, em: Date.now() });
      return { itens: Array.from({ length: 12 }, (_, i) => ({ internalcode: 'DEMO-INVALIDO-' + i, name: 'Imóvel Sintético ' + i })) };
    };
    const input = document.querySelector('#cp-r-busca');
    input.value = 'D'; input.dispatchEvent(new Event('input')); input.value = 'DE'; input.dispatchEvent(new Event('input'));
    input.value = 'DEMO'; bancada.inicioBuscaF10 = Date.now(); input.dispatchEvent(new Event('input'));
  });
  assert.equal(await b.avaliar(() => bancada.buscasF10.length), 0);
  await b.esperar(() => document.querySelectorAll('[data-residencia]').length === 8);
  assert.deepEqual(await b.avaliar(() => bancada.buscasF10.map(b => [b.termo, b.porPagina])), [['DEMO', 8]]);
  assert.ok(await b.avaliar(() => bancada.buscasF10[0].em - bancada.inicioBuscaF10 >= 290));
  await b.avaliar(() => document.querySelector('#cp-r-busca').dispatchEvent(new Event('input')));
  await new Promise(r => setTimeout(r, 350)); assert.equal(await b.avaliar(() => bancada.buscasF10.length), 1);
  prova('busca espera 300 ms, agrupa digitação, ignora texto inalterado e limita a oito resultados');

  await navegar(); await buscar('DEMO-003'); await b.clicar('[data-residencia]');
  await b.avaliar(() => {
    const http = omni.http.request; let gravou = false;
    omni.http.request = async op => {
      if (gravou && op.url.endsWith('/9905/locacoes')) return { status: 503, body: '{}' };
      const r = await http(op); if (op.method === 'POST') gravou = true; return r;
    };
  });
  await confirmar(); assert.match(await texto(b, '#cp-recado'), /Não foi possível atualizar/);
  assert.equal(await b.avaliar(() => !!document.querySelector('#cp-r-confirmar')), false);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 1);
  prova('releitura recusada após sucesso remove confirmação e não repete POST');

  await navegar(); await b.clicar('#cp-vincular-residencia');
  await b.avaliar(() => { GI.buscarImoveis = () => new Promise(resolve => { bancada.liberarBusca = () => resolve({ itens: [{ internalcode: 'DEMO-INVALIDO', name: 'CONTATO ANTERIOR' }] }); }); });
  await b.preencher('#cp-r-busca', 'SINTETICO'); await b.esperar(() => !!bancada.liberarBusca);
  await b.avaliar(async () => { await omni.chats.select(8802); }); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  await b.avaliar(() => bancada.liberarBusca()); assert.doesNotMatch(await texto(b, '#gi-cockpit'), /CONTATO ANTERIOR/);
  await navegar(); await b.clicar('#cp-vincular-residencia'); await b.clicar('#cp-r-fora'); await b.preencher('#cp-r-titulo', 'POST ANTIGO Sintético'); await b.clicar('#cp-r-form button[type=submit]');
  await b.avaliar(() => {
    const http = omni.http.request;
    omni.http.request = async op => { const r = await http(op); if (op.method === 'POST') await new Promise(resolve => { bancada.liberarPost = resolve; }); return r; };
  });
  await b.clicar('#cp-r-confirmar'); await b.esperar(() => !!bancada.liberarPost);
  await b.avaliar(async () => { await omni.chats.select(8802); }); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  await b.avaliar(() => bancada.liberarPost()); assert.doesNotMatch(await texto(b, '#cp-conteudo'), /POST ANTIGO/);
  assert.equal(await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST').body).contatos[0].contato_id), 9905);
  prova('troca rápida de chat durante busca e POST preserva o contato da operação e descarta a resposta antiga');

  await navegar(); await b.clicar('#cp-vincular-residencia');
  await b.avaliar(h => { GI.buscarImoveis = async () => ({ itens: [{ internalcode: h, name: h }] }); }, hostil);
  await b.preencher('#cp-r-busca', 'sintético'); await b.esperar(() => !!document.querySelector('[data-residencia]')); await b.clicar('[data-residencia]');
  assert.match(await texto(b, '#cp-conteudo'), /<img/); assert.equal(await b.avaliar(() => document.querySelectorAll('#cp-conteudo img, #cp-conteudo script').length), 0);
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  for (const q of ['demonstracao=1', 'modo=local', 'modo=fora']) {
    await navegar(q);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-vincular-residencia').disabled), true);
    const n = await b.avaliar(() => bancada.chamadas.length + bancada.rede.length);
    await b.avaliar(() => document.querySelector('#cp-vincular-residencia').click()); assert.equal(await b.avaliar(() => bancada.chamadas.length + bancada.rede.length), n);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length + bancada.gravacoesStorage), 0);
    if (q === 'demonstracao=1') assert.equal(n, 0);
  }
  prova('texto hostil escapado; demonstração, portal ausente e indisponível bloqueiam vínculo sem requisição ou storage');
}
