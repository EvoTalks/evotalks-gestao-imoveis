import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html?escrita=1';
const pausa = ms => new Promise(r => setTimeout(r, ms));
let b;
const falhas = [];
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK RC7 ' + nome + '\n'); }
  catch (erro) { falhas.push(erro); process.stderr.write('FALHA RC7 ' + nome + ': ' + erro.message + '\n'); }
}
async function abrir() {
  await b.navegar(base);
  await b.esperar(() => document.querySelector('[data-chamado]'));
  await b.avaliar(() => {
    const card = document.querySelector('[data-os-id]');
    card.open = true;
    bancada.alvo = card.dataset.osId;
  });
  await b.esperar(() => !document.querySelector('[data-chamado] [data-rapida="atendente"]').disabled);
}
async function marca() {
  await b.avaliar(async () => {
    await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now(), por: 'outra-instancia-sintetica' });
  });
}
async function acionar() {
  await b.avaliar(() => window.dispatchEvent(new Event('focus')));
  await pausa(180);
}
async function zerar() { await b.avaliar(() => { bancada.chamadas = []; }); }
const consultas = () => b.avaliar(() => bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/\d+\/(chamados|locacoes)$/.test(r.caminho)).length);
async function mudarStatusExterno() {
  await b.avaliar(async () => {
    const triagem = document.querySelector('[data-os-id="' + bancada.alvo + '"] summary').textContent.includes('Triagem');
    bancada.statusEsperado = triagem ? 'Orçamento' : 'Triagem';
    const r = await fetch('/api/ext/chamados/' + bancada.alvo + '/status', {
      method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: triagem ? 'orcamento' : 'triagem' })
    });
    if (!r.ok) throw new Error('Escrita sintética recusada: ' + r.status);
  });
}
const atualizado = () => b.avaliar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"] summary').textContent.includes(bancada.statusEsperado));
async function atrasarReleitura() {
  await b.avaliar(() => {
    const http = omni.http.request;
    bancada.pendentes = [];
    omni.http.request = async op => {
      const r = await http(op);
      if (op.method === 'GET' && /\/contatos\/\d+\/(chamados|locacoes)$/.test(op.url)) {
        await new Promise(resolve => bancada.pendentes.push(resolve));
      }
      return r;
    };
    bancada.restaurar = () => { omni.http.request = http; };
  });
}
async function liberarReleitura() {
  await b.avaliar(() => { bancada.restaurar(); bancada.pendentes.forEach(fn => fn()); });
  await pausa(180);
}
try {
  b = await abrirChromium();
  await caso('fotos carregadas não deixam botão zumbi e timer aplica a escrita externa em até 5 s', async () => {
    await abrir(); await b.clicar('[data-os-id] [data-detalhes]');
    await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]').hidden);
    // A prova funcional vem antes da asserção da causa, para detectar o dado velho.
    await mudarStatusExterno(); await zerar(); await marca();
    const inicio = Date.now();
    while (!await atualizado() && Date.now() - inicio < 5100) await pausa(80);
    assert.equal(await atualizado(), true, 'timer deve aplicar o novo status após abrir Fotos e observações');
    assert.equal(await consultas(), 2);
    await b.clicar('[data-os-id] [data-detalhes]');
    await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]').hidden);
    assert.equal(await b.avaliar(() => document.querySelector('[data-os-id] [data-detalhes]').disabled), false);
  });
  await caso('detalhes em voo bloqueiam releitura; ao terminar a mesma marca é aplicada', async () => {
    await abrir();
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = async op => {
        const r = await http(op);
        if (op.method === 'GET' && /\/chamados\/\d+$/.test(op.url)) await new Promise(resolve => { bancada.liberarDetalhes = resolve; });
        return r;
      };
    });
    await b.clicar('[data-os-id] [data-detalhes]');
    await b.esperar(() => !!bancada.liberarDetalhes);
    await mudarStatusExterno(); await zerar(); await marca(); await acionar();
    assert.equal(await consultas(), 0, 'não interrompe o carregamento visível');
    await b.avaliar(() => bancada.liberarDetalhes());
    await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]').hidden);
    await acionar();
    assert.equal(await consultas(), 2, 'libera releitura quando os detalhes terminam');
    assert.equal(await atualizado(), true);
  });
  await caso('controles ocultos e botão estático desabilitado não bloqueiam; operação visível fixa bloqueia', async () => {
    await abrir();
    await b.avaliar(() => {
      const alvo = document.createElement('div'); alvo.id = 'rc7-controles';
      alvo.innerHTML = '<button disabled hidden aria-busy="true">Oculto</button>' +
        '<div hidden><button disabled aria-busy="true">Ancestral oculto</button><div data-edicao><select disabled></select></div><div data-cancelar-caixa></div><div data-aviso-form></div><div data-complemento><textarea>Oculto</textarea></div></div>' +
        '<div id="rc7-sem-layout" style="display:none"><button disabled aria-busy="true">Sem renderização</button><div data-edicao><select disabled></select></div><div data-cancelar-caixa></div></div>' +
        '<button disabled>Permissão estática</button><button id="rc7-fixo" disabled aria-busy="true" style="position:fixed;top:0">Operação</button>';
      document.querySelector('#cp-conteudo').appendChild(alvo);
    });
    await mudarStatusExterno(); await zerar(); await marca(); await acionar();
    assert.equal(await consultas(), 0, 'operação em botão fixo é visível');
    await b.avaliar(() => { document.querySelector('#rc7-fixo').hidden = true; });
    await acionar();
    assert.equal(await consultas(), 0, 'ausência de layout sem hidden continua protegendo operações (RC8)');
    await b.avaliar(() => { document.querySelector('#rc7-sem-layout').hidden = true; });
    await acionar();
    assert.equal(await consultas(), 2, 'ocultos e botões sem operação não ocupam o painel');
    assert.equal(await atualizado(), true);
  });
  await caso('resultado descartado por foco em edição refaz os dois GET para a mesma marca', async () => {
    await abrir(); await mudarStatusExterno(); await zerar(); await atrasarReleitura(); await marca(); await acionar();
    await b.esperar(() => bancada.pendentes.length === 2);
    await b.avaliar(() => { document.querySelector('[data-os-id] .cp-extras').open = true; document.querySelector('[data-os-id] [data-rapida="prioridade"]').focus(); });
    await liberarReleitura();
    assert.equal(await atualizado(), false, 'resultado durante edição deve ser descartado');
    await b.avaliar(() => document.activeElement.blur());
    await acionar();
    assert.equal(await consultas(), 4, 'mesma marca precisa de nova tentativa após descarte');
    assert.equal(await atualizado(), true);
  });
  await caso('resultado descartado por versão após gravação local volta a tentar a marca preservada', async () => {
    await abrir(); await mudarStatusExterno(); await zerar(); await atrasarReleitura(); await marca(); await acionar();
    await b.esperar(() => bancada.pendentes.length === 2);
    await b.preencher('[data-os-id] [data-rapida="prioridade"]', 'alta');
    await b.esperar(() => document.querySelector('[data-os-id] [data-salvo="prioridade"]').textContent === '✓ salvo');
    await b.avaliar(() => document.activeElement.blur());
    await liberarReleitura(); await acionar();
    assert.equal(await consultas(), 4, 'versão alterada não consome marca pendente');
  });
  await caso('escrita externa seguida de edição própria mantém a marca e causa releitura', async () => {
    await abrir(); await mudarStatusExterno(); await marca(); await zerar();
    await b.preencher('[data-os-id] [data-rapida="prioridade"]', 'normal');
    await b.esperar(() => document.querySelector('[data-os-id] [data-salvo="prioridade"]').textContent === '✓ salvo');
    assert.equal(await b.avaliar(async () => (await omni.storage.get(GI.CHAVE_ESCRITA)).por), await b.avaliar(() => GI.instanciaId));
    assert.ok(await b.avaliar(() => GI.pendenciaExterna > GI.cockpitCarregadoEm()), 'pendência externa preservada em memória');
    await b.avaliar(() => document.activeElement.blur()); await acionar();
    assert.equal(await consultas(), 2, 'gravação própria não esconde escrita externa pendente');
    assert.equal(await atualizado(), true);
  });
  await caso('falha de rede consome a marca e não repete em laço', async () => {
    await abrir(); await zerar(); await marca();
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = async op => {
        const r = await http(op);
        return /\/contatos\/\d+\/(chamados|locacoes)$/.test(op.url) ? { status: 503, body: '{}' } : r;
      };
    });
    await acionar(); assert.equal(await consultas(), 2);
    await acionar(); await acionar(); assert.equal(await consultas(), 2);
  });
  assert.deepEqual(b.erros, [], 'zero exceções no Chromium');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões RC7: ' + falhas.length);
  process.stdout.write('RC7: todas as provas passaram.\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
