import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html';
let b;
const falhas = [];
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK F19 ' + nome + '\n'); }
  catch (erro) { falhas.push(erro); process.stderr.write('FALHA F19 ' + nome + ': ' + erro.message + '\n'); }
}
async function abrir(query = '') {
  await b.navegar(base + '?escrita=1&' + query);
  await b.esperar(() => document.querySelector('[data-chamado]') || document.querySelector('#cp-estado')?.textContent.includes('portal não respondeu'));
}
async function marca() {
  await b.avaliar(async () => { await omni.storage.set('gi-ultima-escrita', { em: Date.now(), por: 'outra-instancia-sintetica' }); });
}
async function acionar(tipo = 'focus') {
  await b.avaliar(tipo => {
    if (tipo === 'timer') { for (const t of __intervalos.values()) if (t.ms === 4000) t.fn(); }
    else if (tipo === 'pointerdown') document.querySelector('#gi-cockpit').dispatchEvent(new Event(tipo, { bubbles: true }));
    else if (tipo === 'visibilitychange') document.dispatchEvent(new Event(tipo));
    else window.dispatchEvent(new Event(tipo));
  }, tipo);
  await pausa(160);
}
const consultas = () => b.avaliar(() => bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/\d+\/(chamados|locacoes)$/.test(r.caminho)).map(r => r.caminho));
async function zerar() { await b.avaliar(() => { bancada.chamadas = []; bancada.toasts = []; }); }
try {
  b = await abrirChromium({ antesDeCarregar: `
    window.__intervalos = new Map();
    const criar = window.setInterval, limpar = window.clearInterval;
    window.setInterval = function(fn, ms) { const id = criar(fn, ms); __intervalos.set(id, { fn, ms }); return id; };
    window.clearInterval = function(id) { __intervalos.delete(id); return limpar(id); };
  ` });
  await caso('painel montado relê em até 5 s, mostra Triagem e mantém cartão, filtro e busca; 2 GET por escrita', async () => {
    await abrir();
    await b.clicar('[data-filtro="todos"]'); await b.preencher('#cp-busca', '');
    await b.avaliar(async () => {
      const card = document.querySelector('[data-os-id]'); card.open = true;
      bancada.alvo = card.dataset.osId;
      await fetch('/api/ext/chamados/' + bancada.alvo + '/status', { method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'triagem' }) });
    });
    await zerar(); await marca();
    await b.esperar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"] summary').textContent.includes('Triagem'));
    assert.equal((await consultas()).length, 2);
    assert.equal(await b.avaliar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"]').open), true);
    assert.equal(await b.avaliar(() => document.querySelector('[data-filtro="todos"]').getAttribute('aria-pressed')), 'true');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-idade').textContent), 'atualizado há 0 min');
    for (const tipo of ['focus', 'visibilitychange', 'pointerdown', 'timer']) await acionar(tipo);
    assert.equal((await consultas()).length, 2, 'a mesma marca não repete GET');
    assert.equal(await b.avaliar(() => bancada.toasts.length), 0, 'releitura é silenciosa');
  });
  await caso('rascunho Novo, aba, imóvel e filtros sobrevivem à releitura', async () => {
    await abrir(); await b.clicar('[data-filtro="abertos"]'); await b.preencher('#cp-busca', 'reparo');
    await b.preencher('#cp-imovel', '3'); await b.clicar('#cp-tab-novo'); await b.preencher('#cp-novo-imovel', '3');
    await b.preencher('#cp-titulo', '<Título sintético>'); await b.preencher('#cp-descricao', 'Rascunho não pode sumir');
    await zerar(); await marca(); await acionar('focus');
    assert.equal((await consultas()).length, 2);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-tab-novo').getAttribute('aria-selected')), 'true');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo').value), '<Título sintético>');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Rascunho não pode sumir');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-imovel').value), '3');
    await b.clicar('#cp-tab-chamados');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-busca').value), 'reparo');
    assert.equal(await b.avaliar(() => document.querySelector('[data-filtro="abertos"]').getAttribute('aria-pressed')), 'true');
  });
  await caso('sem escrita e escrita própria: 0 GET extra; marca correta após edição rápida', async () => {
    await abrir(); await zerar();
    for (const tipo of ['focus', 'visibilitychange', 'pointerdown', 'timer']) await acionar(tipo);
    assert.equal((await consultas()).length, 0);
    await b.preencher('[data-chamado] [data-rapida="prioridade"]', 'alta');
    await b.esperar(() => document.querySelector('[data-salvo="prioridade"]').textContent === '✓ salvo');
    assert.equal(await b.avaliar(() => typeof GI.instanciaId), 'string');
    assert.equal(await b.avaliar(async () => (await omni.storage.get('gi-ultima-escrita'))?.por), await b.avaliar(() => GI.instanciaId));
    await b.avaliar(() => document.activeElement.blur());
    for (const tipo of ['focus', 'visibilitychange', 'timer']) await acionar(tipo);
    assert.equal((await consultas()).length, 0);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(r => r.method !== 'GET').length), 1);
  });
  await caso('edição rápida em voo aguarda; eventos concorrentes não duplicam GET', async () => {
    await abrir();
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = op => op.method !== 'GET' ? new Promise(resolve => { bancada.liberar = async () => resolve(await http(op)); }) : http(op);
    });
    await b.preencher('[data-chamado] [data-rapida="prioridade"]', 'normal');
    await b.esperar(() => !!bancada.liberar); await zerar(); await marca();
    await b.avaliar(() => document.activeElement.blur()); await acionar(); await acionar('timer');
    assert.equal((await consultas()).length, 0);
    await b.avaliar(async () => { await bancada.liberar(); });
    await b.esperar(() => !document.querySelector('[data-rapida="prioridade"]').disabled);
    await marca();
    await b.avaliar(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await pausa(200); assert.equal((await consultas()).length, 2);
  });
  await caso('gravação de Novo e criação incerta impedem releitura', async () => {
    await abrir(); await b.clicar('#cp-tab-novo'); await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.preencher('#cp-titulo', 'Incerta F19'); await b.clicar('#cp-revisar');
    await b.avaliar(() => {
      const http = omni.http.request;
      omni.http.request = op => {
        if (op.method === 'POST') return new Promise((resolve, reject) => { bancada.recusar = () => reject(Object.assign(new Error('Resposta perdida'), { code: 'timeout' })); });
        if (op.url.endsWith('/chamados')) return Promise.reject(new Error('Conferência fora'));
        return http(op);
      };
    });
    await b.clicar('#cp-confirmar'); await b.esperar(() => !!bancada.recusar);
    await zerar(); await marca(); await acionar(); assert.equal((await consultas()).length, 0);
    await b.avaliar(() => bancada.recusar());
    await b.esperar(() => document.querySelector('#cp-confirmar').textContent === 'Conferir se abriu');
    await zerar(); await marca(); await acionar('timer'); await acionar();
    assert.equal((await consultas()).length, 0);
  });
  await caso('cada gatilho relê; pointerdown tem throttle de 1 s; teto de 30/min', async () => {
    await abrir(); await zerar();
    for (const tipo of ['focus', 'visibilitychange', 'pointerdown']) {
      await marca(); await acionar(tipo);
      assert.equal((await consultas()).length, ['focus', 'visibilitychange', 'pointerdown'].indexOf(tipo) * 2 + 2);
    }
    await marca(); await acionar('pointerdown'); assert.equal((await consultas()).length, 6);
    await pausa(1000); await acionar('pointerdown'); assert.equal((await consultas()).length, 8);
    for (let i = 0; i < 18; i++) { await marca(); await acionar('focus'); }
    assert.ok(await b.avaliar(() => bancada.chamadas.length <= 30), 'cota preservada mesmo com marcas frequentes');
  });
  await caso('timer só visível; troca limpa timer e descarta leitura do contato antigo; destruir limpa timer', async () => {
    await abrir();
    assert.equal(await b.avaliar(() => [...__intervalos.values()].filter(t => t.ms === 4000).length), 1);
    await zerar(); await marca();
    await b.avaliar(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
    await acionar('timer'); assert.equal((await consultas()).length, 0);
    await b.avaliar(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      const http = omni.http.request;
      omni.http.request = op => op.url.includes('/contatos/9901/') ? new Promise(resolve => { (bancada.pendentes ||= []).push(async () => resolve(await http(op))); }) : http(op);
    });
    await acionar('timer');
    await b.avaliar(async () => { bancada.timerAntigo = [...__intervalos.values()].find(t => t.ms === 4000); await omni.chats.select(8802); });
    assert.equal(await b.avaliar(() => [...__intervalos.values()].filter(t => t.ms === 4000).length), 0);
    await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
    await b.avaliar(async () => { await Promise.all(bancada.pendentes.map(fn => fn())); }); await pausa(150);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-nome').textContent.includes('Dois')), true);
    await zerar(); await marca(); await acionar('timer');
    assert.deepEqual(await consultas(), ['/api/ext/contatos/9902/chamados', '/api/ext/contatos/9902/locacoes']);
    await b.avaliar(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await b.avaliar(() => [...__intervalos.values()].filter(t => t.ms === 4000).length), 0);
  });
  await caso('storage get/set falham sem quebrar; falha HTTP só repete na próxima escrita ou atualizar', async () => {
    await abrir(); await zerar();
    await b.avaliar(() => {
      bancada.getOriginal = omni.storage.get;
      omni.storage.get = () => { throw new Error('Storage fora'); };
    }); await acionar();
    await b.avaliar(() => { omni.storage.get = () => Promise.reject(new Error('Storage fora')); }); await acionar('timer');
    assert.equal((await consultas()).length, 0);
    await b.avaliar(() => {
      omni.storage.get = bancada.getOriginal;
      const http = omni.http.request;
      omni.http.request = async op => { const r = await http(op); return op.url.includes('/contatos/') ? { status: 503, body: '{}' } : r; };
      bancada.restaurar = () => { omni.http.request = http; };
    });
    await marca(); await acionar(); assert.equal((await consultas()).length, 2);
    await acionar(); await acionar('timer'); assert.equal((await consultas()).length, 2);
    assert.equal(await b.avaliar(() => bancada.toasts.length), 0);
    await b.avaliar(() => { bancada.restaurar(); omni.storage.set = () => Promise.reject(new Error('Storage fora')); });
    // A próxima marca é injetada pela leitura, já que set está indisponível.
    await b.avaliar(() => { omni.storage.get = async k => k === 'gi-ultima-escrita' ? { em: Date.now(), por: 'nova-outra-instancia' } : null; });
    await acionar(); assert.equal((await consultas()).length, 4);
    assert.equal(await b.avaliar(() => document.querySelector('#gi-erro').hidden), true);
  });
  await caso('demonstração e sem portal: zero requisição e zero timer', async () => {
    for (const query of ['demonstracao=1', 'modo=local']) {
      await abrir(query); await zerar(); await marca();
      for (const tipo of ['focus', 'visibilitychange', 'pointerdown', 'timer']) await acionar(tipo);
      assert.equal((await consultas()).length, 0);
      assert.equal(await b.avaliar(() => [...__intervalos.values()].filter(t => t.ms === 4000).length), 0);
    }
  });
  assert.deepEqual(b.erros, [], 'zero exceções no Chromium');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões F19: ' + falhas.length);
  process.stdout.write('Patch 0.23.1: todas as provas passaram.\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
