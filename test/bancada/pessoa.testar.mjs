import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port;
const pausa = ms => new Promise(r => setTimeout(r, ms));
let b;
async function abrir(query = '') {
  await b.navegar(base + '/app/painel.html?escrita=1&' + query);
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Um') && !!document.querySelector('[data-chamado]'));
}
async function buscar(termo) { await b.clicar('#cp-outra-pessoa'); await b.preencher('#cp-pessoa-busca', termo); }
async function escolher() { await b.esperar(() => !!document.querySelector('[data-pessoa]')); await b.clicar('[data-pessoa="0"]'); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois')); }
try {
  b = await abrirChromium(); await abrir();
  assert.equal(await b.avaliar(() => document.querySelector('#cp-cabecalho').textContent.includes('Vincular outra residência')), false);
  await buscar('Do'); await pausa(500);
  assert.equal(await b.avaliar(() => bancada.buscaLimite), undefined);
  await b.preencher('#cp-pessoa-busca', 'Dois'); await pausa(150);
  assert.equal(await b.avaliar(() => bancada.buscaLimite), undefined);
  await escolher();
  assert.equal(await b.avaliar(() => bancada.buscaLimite), 8);
  assert.match(await b.avaliar(() => document.querySelector('#cp-vendo-como').textContent), /Vendo como.*Dois.*Voltar ao contato do atendimento/);
  assert.equal(await b.avaliar(async () => (await omni.chats.getSelected()).contactId), 9901);
  assert.ok((await b.avaliar(() => bancada.chamadas)).some(r => r.caminho === '/api/ext/contatos/9902/locacoes'));
  assert.ok((await b.avaliar(() => bancada.chamadas)).some(r => r.caminho === '/api/ext/contatos/9902/chamados'));
  await b.clicar('#cp-tab-imovel');
  assert.match(await b.avaliar(() => document.querySelector('#cp-conteudo').textContent), /Imóvel Avulso/);
  assert.equal(await b.avaliar(() => document.querySelector('#cp-vincular-residencia').hidden), false);
  await b.clicar('#cp-tab-novo');
  await b.preencher('#cp-titulo', 'Reparo para pessoa escolhida');
  await b.preencher('#cp-descricao', 'Reparo para pessoa escolhida');
  // A lista do host já contém o nome real, mas a sessão pode devolvê-lo vazio.
  await b.avaliar(() => { omni.session.getUser = async () => ({ id: 9999, name: '' }); });
  const carregadoAntes = await b.avaliar(() => GI.cockpitCarregadoEm());
  await b.avaliar(() => { bancada.perderResposta = true; });
  await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  const post = await b.avaliar(() => JSON.parse(bancada.chamadas.find(r => r.method === 'POST' && r.caminho === '/api/ext/chamados').body));
  assert.equal(post.solicitante.contato_id, 9902); assert.match(post.solicitante.nome, /Dois/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(r => r.method === 'POST' && r.caminho === '/api/ext/chamados').length), 1, 'resposta perdida é reconciliada sem duplicar o POST');
  assert.equal(post.atendimento.chat_id, 8801); assert.equal(post.atendente.nome, 'Agente Demonstração');
  await b.esperar(antes => GI.cockpitCarregadoEm() > antes, carregadoAntes);
  await b.clicar('#cp-lista-sucesso');
  await b.avaliar(() => { bancada.navegarContribuicao = false; });
  await b.esperar(() => !!document.querySelector('[data-gestao]'));
  await b.clicar('[data-gestao]'); await b.esperar(() => bancada.aberturas.length > 0);
  assert.equal(await b.avaliar(() => bancada.aberturas[0].params.contatoId), 9902);
  assert.equal(await b.avaliar(async () => (await omni.storage.get('gi-os-alvo')).contatoId), 9902);
  const href = await b.avaliar(() => location.href);
  await b.navegar(href); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  assert.equal(await b.avaliar(async () => (await omni.storage.get('gi-pessoa-v1'))[8801].contactId), 9902);
  await b.avaliar(() => omni.chats.select(8803)); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Proprietário'));
  assert.equal(await b.avaliar(() => document.querySelector('#cp-vendo-como').hidden), true);
  await b.avaliar(() => omni.chats.select(8801)); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  await b.avaliar(async () => {
    bancada.chamadas = [];
    await omni.storage.set('gi-ultima-escrita', { em: Date.now() + 10, por: 'outra-instancia-sintetica' });
    window.dispatchEvent(new Event('focus'));
  });
  await b.esperar(() => bancada.chamadas.some(r => r.caminho === '/api/ext/contatos/9902/chamados'));
  assert.ok((await b.avaliar(() => bancada.chamadas)).every(r => !/\/contatos\/9901\//.test(r.caminho)));
  const snap = await b.avaliar(async () => omni.storage.get('gi-cockpit-snapshots-v1'));
  assert.ok(snap.rows.some(r => r.contatoId === 9902));
  await b.clicar('#cp-pessoa-voltar'); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Um'));
  process.stdout.write('OK pessoa: debounce/mínimo/limite, pessoa efetiva, imóveis/chamados, O.S., atendente real, gestão, isolamento e voltar\n');

  await abrir();
  await b.avaliar(() => { window.resolverAntiga = null; omni.contacts.search = termo => termo === 'antiga' ? new Promise(r => { window.resolverAntiga = r; }) : Promise.resolve([{ id:9902, name:'<img src=x onerror="window.xss=1">', phone:'<script>11987654321', document:'<img>12345678901' }]); });
  await buscar('antiga'); await b.esperar(() => !!window.resolverAntiga);
  await b.preencher('#cp-pessoa-busca', 'nova'); await b.esperar(() => !!document.querySelector('[data-pessoa]'));
  await b.avaliar(() => resolverAntiga([{ id:9901, name:'Resultado velho' }])); await pausa(100);
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#cp-pessoa-resultados').textContent), /Resultado velho/);
  assert.match(await b.avaliar(() => document.querySelector('#cp-pessoa-resultados').textContent), /\(11\) 9 ••••-4321 · \*\*\*\.456\.789-\*\*/);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#cp-pessoa-resultados img,#cp-pessoa-resultados script').length), 0);
  assert.equal(await b.avaliar(() => window.xss), undefined);
  await b.avaliar(() => { omni.contacts.search = () => Promise.resolve([{ id:9902, name:'', phone:'11987654321', document:'12345678901' }]); });
  await b.preencher('#cp-pessoa-busca','sem nome'); await b.esperar(() => document.querySelector('#cp-pessoa-resultados').textContent.startsWith('Contato 9902'));
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#cp-pessoa-resultados').textContent), /11987654321|12345678901/);
  await b.avaliar(() => { omni.contacts.search = () => Promise.resolve(Array.from({ length:12 }, (_, i) => ({ id:9901+i, name:'Pessoa sintética ' + i }))); });
  await b.preencher('#cp-pessoa-busca','oito'); await b.esperar(() => document.querySelectorAll('[data-pessoa]').length === 8);
  for (const erro of [{ status:429 }, { code:'rate_limited' }, { code:'rate_limit' }]) {
    await b.avaliar(erro => { omni.contacts.search = () => Promise.reject(erro); }, erro);
    await b.preencher('#cp-pessoa-busca','limite ' + JSON.stringify(erro)); await b.esperar(() => /Aguarde um minuto/.test(document.querySelector('#cp-pessoa-resultados').textContent));
  }
  await b.avaliar(() => { omni.contacts.search = () => Promise.reject(Error('falha')); });
  await b.preencher('#cp-pessoa-busca','falha'); await b.esperar(() => /Não foi possível buscar/.test(document.querySelector('#cp-pessoa-resultados').textContent));
  await b.avaliar(() => { omni.contacts.search = () => Promise.resolve([]); });
  await b.preencher('#cp-pessoa-busca','ausente'); await b.esperar(() => /Nenhuma pessoa encontrada/.test(document.querySelector('#cp-pessoa-resultados').textContent));
  await b.clicar('#cp-pessoa-cancelar'); assert.equal(await b.avaliar(() => document.querySelector('#cp-pessoa-escolha').hidden), true);
  process.stdout.write('OK pessoa: geração, máscaras hostis, erro, limite de taxa, vazio e cancelar\n');

  await abrir('semstorage=1'); await buscar('Dois'); await escolher();
  await b.avaliar(() => omni.chats.select(8802)); await b.esperar(() => document.querySelector('#cp-vendo-como').hidden);
  await b.avaliar(() => omni.chats.select(8801)); await b.esperar(() => !document.querySelector('#cp-vendo-como').hidden);
  process.stdout.write('OK pessoa: falha do storage conserva a seleção por chat na sessão\n');
  await b.clicar('[data-gestao]');
  await b.esperar(() => location.pathname === '/app/os.html' && !!document.querySelector('#c-status'));
  await b.avaliar(() => omni.chats.select(8801));
  await b.esperar(() => !!document.querySelector('[data-os]'));
  assert.ok((await b.avaliar(() => bancada.chamadas)).some(r => r.caminho === '/api/ext/contatos/9902/chamados'));
  assert.ok((await b.avaliar(() => bancada.chamadas)).every(r => !/\/contatos\/9901\//.test(r.caminho)));
  process.stdout.write('OK pessoa: diálogo gi-os abre/volta para a pessoa efetiva mesmo sem storage\n');
  await b.navegar(base + '/app/painel.html?escrita=1&demonstracao=1');
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Cliente Demonstração'));
  await buscar('Outra'); await b.esperar(() => !!document.querySelector('[data-pessoa]')); await b.clicar('[data-pessoa]');
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Outra Pessoa'));
  assert.equal(await b.avaliar(() => bancada.chamadas.length + bancada.rede.length + bancada.gravacoesStorage), 0);
  await b.clicar('#cp-pessoa-voltar'); await b.esperar(() => document.querySelector('#cp-nome').textContent === 'Cliente Demonstração');
  for (const modo of ['local','fora']) {
    await b.navegar(base + '/app/painel.html?modo=' + modo);
    await b.esperar(() => document.querySelector('#cp-estado')?.textContent.includes('portal não respondeu'));
    assert.equal(await b.avaliar(() => document.querySelector('#cp-outra-pessoa').hidden), true);
  }
  process.stdout.write('OK pessoa: demonstração só com sintéticos, sem rede/storage; link oculto sem portal\n');
  for (const [query, esperado] of [['semnome=1','Agente Demonstração'], ['semnome=1&semusuarios=1','Usuário 9999'], ['', 'Agente Demonstração']]) {
    await b.navegar(base + '/app/painel.html?escrita=1&chat=8802&' + query);
    await b.esperar(() => !!document.querySelector('[data-chamado]'));
    await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Nome do atendente sintético ' + query); await b.preencher('#cp-descricao', 'Nome do atendente sintético ' + query);
    await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    assert.equal(await b.avaliar(() => JSON.parse(bancada.chamadas.find(r => r.method === 'POST' && r.caminho === '/api/ext/chamados').body).atendente.nome), esperado);
  }
  process.stdout.write('OK atendente: POST com nome da lista, reserva Usuário 9999 sem lista, nome da sessão preenchido\n');
  assert.deepEqual(b.erros, []);
} catch (err) { if (b) process.stderr.write(await b.avaliar(() => document.body.textContent) + '\n'); throw err; } finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
