import test from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';

test('F9: ajustes após o teste real, sem instância', async t => {
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const origem = 'http://127.0.0.1:' + servidor.address().port;
  let b;
  try {
    b = await abrirChromium();
    const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
    const navegar = async (pagina = 'chamados', query = '') => {
      await b.navegar(origem + '/app/' + pagina + '.html' + query);
      await b.esperar(() => !!document.querySelector('#gi-corpo [data-editar], #gi-corpo [data-abrir], [data-chamado]'));
    };
    const livre = () => b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-salvar-orcamento').disabled);
    const abrir = async id => {
      await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), id);
      await b.clicar('[data-editar="' + id + '"]'); await livre();
    };
    const salvar = async () => { await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
    const marcar = () => b.avaliar(() => bancada.chamadas.length);
    const desde = n => b.avaliar(n => bancada.chamadas.slice(n), n);
    await navegar();
    const id = await b.avaliar(async () => {
      const { chamado: c } = await GI.chamadosCriar({ locacao_id: 1, titulo: 'Regressão F9 Sintética', categoria: 'outros', solicitante: { contato_id: 9901, nome: 'Cliente Sintético' } });
      const { orcamento: o } = await GI.chamadosOrcamentoCriar(c.id, { prestador_nome: 'Prestador Sintético F9', valor_centavos: 35000 });
      await GI.chamadosOrcamentoEscolher(c.id, o.id);
      return c.id;
    });
    await t.test('1: valor escolhido somente leitura, delta ao salvar e status independente', async () => {
      await navegar(); await abrir(id);
      assert.equal(await b.avaliar(() => document.querySelector('#c-valor')?.tagName), 'INPUT');
      assert.equal(await b.avaliar(() => document.querySelector('#c-valor').value), '350,00');
      assert.equal(await b.avaliar(() => document.querySelector('#c-valor').readOnly), true);
      assert.match(await b.avaliar(() => document.querySelector('#c-valor').title), /Definido pelo orçamento escolhido/);
      await b.preencher('#c-quem-paga', 'proprietario'); let inicio = await marcar(); await salvar();
      assert.deepEqual((await desde(inicio)).filter(r => r.method === 'POST').map(r => JSON.parse(r.body)), [{ quem_paga: 'proprietario' }]);
      await abrir(id); await b.preencher('#c-prioridade', 'alta'); inicio = await marcar(); await salvar();
      assert.deepEqual((await desde(inicio)).filter(r => r.method === 'POST').map(r => JSON.parse(r.body)), [{ prioridade: 'alta' }]);
      await abrir(id); inicio = await marcar(); await salvar();
      assert.equal((await desde(inicio)).length, 0, 'Salvar inalterado não consulta nem grava');
      await abrir(id); await b.preencher('#c-titulo', 'Rascunho F9'); await b.preencher('#c-status', 'triagem'); await livre();
      assert.equal((await b.avaliar(async id => GI.chamadosObter(id), id)).chamado.status, 'triagem');
      assert.equal(await b.avaliar(() => document.querySelector('#c-titulo').value), 'Rascunho F9');
    });
    await t.test('2: adicionar, escolher e remover usam até três requests e uma releitura', async () => {
      await navegar(); await abrir(id);
      async function conferir(fn) {
        const inicio = await marcar(); await fn(); await livre();
        const rs = await desde(inicio);
        assert.ok(rs.length <= 3, JSON.stringify(rs.map(r => [r.method, r.caminho])));
        assert.equal(rs.filter(r => r.method === 'GET' && r.caminho === '/api/ext/chamados/' + id).length, 1);
        assert.equal(rs.filter(r => r.caminho === '/api/ext/chamados/' + id && r.method === 'POST').length, 0);
        assert.equal(rs.filter(r => /^\/api\/ext\/chamados(?:\?|$)/.test(r.caminho)).length, 0);
      }
      await b.preencher('#c-orc-nome', 'Segundo Sintético F9'); await b.preencher('#c-orc-valor', '450');
      await conferir(() => b.clicar('#c-salvar-orcamento'));
      await conferir(() => b.clicar('[data-escolher-orcamento="1"]'));
      await b.clicar('[data-apagar-orcamento="0"]'); await conferir(() => b.clicar('[data-apagar-orcamento="0"]'));
      const inicio = await marcar(); await b.clicar('.gi-modal [data-cancelar]');
      await b.esperar(() => !document.querySelector('.gi-modal'));
      await b.esperar(n => bancada.chamadas.length > n, inicio);
      assert.equal((await desde(inicio)).filter(r => /^\/api\/ext\/chamados\?/.test(r.caminho)).length, 1);
    });
    await t.test('2b: busca espera 300 ms, não repete termo; orçamento com um campo ou nota pendente usa três requests', async () => {
      await navegar(); await abrir(id);
      await b.preencher('#c-orc-nome', 'Busca Sintética F9');
      await b.esperar(() => bancada.chamadas.some(r => r.caminho.includes('/prestadores?busca=Busca')));
      const inicioBusca = await marcar();
      await b.preencher('#c-orc-nome', 'Busca Sintética F9');
      await new Promise(r => setTimeout(r, 400));
      assert.equal((await desde(inicioBusca)).length, 0, 'termo idêntico não repete busca');
      await b.preencher('#c-descricao', 'Campo pendente sintético F9');
      let inicio = await marcar(); await b.clicar('#c-salvar-orcamento'); await livre();
      assert.equal((await desde(inicio)).length, 3);
      assert.equal((await b.avaliar(async id => GI.chamadosObter(id), id)).chamado.descricao, 'Campo pendente sintético F9');
      await b.preencher('#c-orc-nome', 'Orçamento e nota F9'); await b.preencher('#c-nota', 'Nota única pendente F9');
      inicio = await marcar(); await b.clicar('#c-salvar-orcamento'); await livre();
      assert.equal((await desde(inicio)).length, 3);
      assert.ok((await b.avaliar(async id => GI.chamadosObter(id), id)).eventos.some(ev => ev.texto === 'Nota única pendente F9'));
    });
    await t.test('2c: confirmar uma nota não ignora o limite de requests nem perde a cotação', async () => {
      await navegar();
      await b.avaliar(async id => GI.chamadosAtualizar(id, { atendimento: { chat_id: 8801 } }), id);
      await navegar(); await abrir(id); await b.esperar(() => !document.querySelector('#c-avisar').disabled);
      await b.preencher('#c-prioridade', 'normal'); await b.preencher('#c-nota', 'Aviso pendente sintético F9');
      await b.clicar('#c-avisar'); await b.preencher('#c-orc-nome', 'Cotação preservada F9');
      let inicio = await marcar(); await b.clicar('#c-salvar-orcamento'); await b.clicar('#c-confirmar-acao'); await livre();
      assert.equal((await desde(inicio)).length, 0, 'vários blocos aguardam gravação separada');
      assert.equal(await b.avaliar(() => document.querySelector('#c-salvar-pendentes').hidden), false);
      assert.equal(await b.avaliar(() => bancada.mensagens.length), 0);
      await b.clicar('#c-salvar-pendentes'); await livre();
      assert.equal(await b.avaliar(() => document.querySelector('#c-orc-nome').value), 'Cotação preservada F9');
      assert.equal(await b.avaliar(() => bancada.mensagens.length), 1);
      inicio = await marcar(); await b.clicar('#c-salvar-orcamento'); await livre();
      assert.equal((await desde(inicio)).length, 2);
      // O teste de vínculo seguinte começa sem conversa, como no cadastro original.
      await b.clicar('#c-tirar-vinculo'); await livre();
    });
    await t.test('3: vínculo legado por protocolo, botões condicionais e erro 422 orientado', async () => {
      await navegar();
      await b.avaliar(async id => GI.chamadosAtualizar(id, { atendimento: { protocolo: 'TESTE-F9-0001' } }), id);
      await abrir(id);
      assert.equal(await b.avaliar(() => document.querySelector('#c-tirar-vinculo').hidden), false);
      assert.equal(await b.avaliar(() => document.querySelector('#c-abrir-atendimento').hidden), true);
      assert.equal(await texto('#c-vinculo'), 'Protocolo TESTE-F9-0001 · sem conversa vinculada');
      assert.equal(await b.avaliar(() => document.querySelector('#c-tirar-vinculo').hidden), false);
      assert.equal(await b.avaliar(() => document.querySelector('#c-abrir-atendimento').hidden), true);
      await b.avaliar(() => {
        const request = omni.http.request;
        omni.http.request = op => {
          if (op.method === 'POST' && /\/chamados\/\d+$/.test(op.url)) {
            omni.http.request = request;
            return Promise.resolve({ status: 422, body: JSON.stringify({ erro: 'dados_invalidos', campos: { valor_estimado_centavos: 'Definido pelo orçamento escolhido.' } }) });
          }
          return request(op);
        };
      });
      await b.preencher('#c-descricao', 'Novo relato sintético'); await b.clicar('.gi-modal [data-ok]');
      await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('Para mudar, escolha outro orçamento.'));
      assert.doesNotMatch(await texto('.gi-modal-recado'), /^\d/);
    });
    await t.test('4: situação editável para quem vê Imóveis', async () => {
      for (const perfil of ['agente', 'supervisor', 'admin']) {
        await navegar('imoveis', '?perfil=' + perfil);
        assert.equal(await b.avaliar(() => !!document.querySelector('[data-locacao]')), false);
        assert.equal(await b.avaliar(() => !!document.querySelector('#f-situacao')), true);
        assert.match(await texto('#gi-corpo'), /Disponível/);
        assert.equal(await b.avaliar(() => document.querySelectorAll('[data-situacao]').length), 3);
      }
    });
    await t.test('5: decisão em dois botões e observação opcional, padrões no portal', async () => {
      await navegar(); await abrir(id);
      assert.equal(await b.avaliar(() => !!document.querySelector('#c-aprovacao-por, #c-aprovacao-canal')), false);
      assert.equal(await texto('#c-aprovar'), 'Aprovado'); assert.equal(await texto('#c-recusar'), 'Recusado');
      await b.preencher('#c-aprovacao-observacao', '<img src=x onerror="window.__f9=1">');
      await b.clicar('#c-aprovar'); await livre();
      const d = await b.avaliar(async id => GI.chamadosObter(id), id);
      assert.equal(d.chamado.aprovacao.por, 'Proprietário Demonstração');
      assert.equal(d.chamado.aprovacao.canal, 'WhatsApp');
      assert.equal(await b.avaliar(() => !!document.querySelector('#c-aprovacao img') || !!window.__f9), false);
    });
    await t.test('6a: locação única selecionada e atendimento desabilitado até escolher cliente', async () => {
      await navegar(); await b.clicar('#b-novo');
      assert.equal(await b.avaliar(() => document.querySelector('#c-trocar').disabled), true);
      assert.equal(await b.avaliar(() => document.querySelector('#c-trocar').title), 'Escolha o cliente primeiro');
      await b.preencher('#c-cliente', 'Demonstração Dois');
      await b.esperar(() => !!document.querySelector('[data-contato="0"]')); await b.clicar('[data-contato="0"]');
      await b.esperar(() => !document.querySelector('#c-locacao').disabled);
      assert.equal(await b.avaliar(() => document.querySelector('#c-locacao').value), '0');
      assert.equal(await b.avaliar(() => document.querySelector('#c-trocar').disabled), false);
    });
    await t.test('6b: cockpit exige revisão e ação explícita mesmo com conferência pré-marcada', async () => {
      await navegar('painel', '?escrita=1'); await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
      await b.preencher('#cp-titulo', 'Cockpit Sintético F9'); await b.preencher('#cp-descricao', 'Relato sintético F9');
      const escritas = () => b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST' && c.caminho.endsWith('/chamados')).length);
      const antes = await escritas();
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-confirmar')), false);
      await b.clicar('#cp-revisar');
      assert.match(await texto('#cp-conteudo'), /Confirme antes de abrir/);
      assert.equal(await b.avaliar(() => document.querySelector('#cp-conferencia').checked), true);
      assert.equal(await escritas(), antes, 'revisar e pré-marcar não criam o chamado');
      assert.match(await texto('#cp-conteudo'), /Cockpit Sintético F9/);
      assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').disabled), false);
      assert.equal(await texto('#cp-confirmar'), 'Abrir chamado');
      await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
      assert.equal(await escritas(), antes + 1);
    });
    await t.test('6c: editar oferece o único atendimento aberto sem abrir lista', async () => {
      await navegar();
      const n = await b.avaliar(async () => (await GI.chamadosCriar({ locacao_id: 2, titulo: 'Único Sintético F9', categoria: 'outros', solicitante: { contato_id: 9902, nome: 'Cliente Dois Sintético' } })).chamado.id);
      await navegar(); await abrir(n);
      await b.esperar(() => !!document.querySelector('#c-vincular-unico'));
      assert.equal(await texto('#c-vincular-unico'), 'Vincular este'); await b.clicar('#c-vincular-unico'); await livre();
      assert.equal((await b.avaliar(async id => GI.chamadosObter(id), n)).chamado.atendimento.chat_id, 8802);
      assert.equal(await b.avaliar(() => document.querySelector('#c-abrir-atendimento').hidden || document.querySelector('#c-abrir-atendimento').disabled), false);
      await b.clicar('#c-abrir-atendimento');
      assert.equal(await b.avaliar(async () => (await omni.chats.getSelected()).id), 8802);
    });
    assert.deepEqual(b.erros, []);
  } finally {
    if (b) await b.fechar();
    servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
  }
});
