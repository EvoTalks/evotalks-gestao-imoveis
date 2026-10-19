import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html?escrita=1';
const falhas = [];
let b;
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK F23 ' + nome + '\n'); }
  catch (erro) { falhas.push(erro); process.stderr.write('FALHA F23 ' + nome + ': ' + erro.message + '\n'); }
}
async function abrir() {
  await b.navegar(base);
  await b.esperar(() => !!document.querySelector('[data-chamado]'));
}
async function trocar(chatId, nome) {
  await b.avaliar(async chatId => { parent.__agora += 100; await omni.chats.select(chatId); }, chatId);
  await b.esperar(nome => document.querySelector('#cp-nome').textContent.includes(nome) && !!document.querySelector('[data-chamado]'), nome);
}
try {
  b = await abrirChromium({ antesDeCarregar: `
    const raiz = window.parent;
    if (raiz === window) { window.__agora = Date.now(); window.__storage = new Map(); }
    Date.now = () => raiz.__agora;
    const intervalo = window.setInterval;
    window.setInterval = (fn, ms) => ms === 4000 ? 999999 : intervalo(fn, ms);
    let sdk;
    Object.defineProperty(window, 'omni', { configurable: true, get: () => sdk, set: valor => {
      sdk = valor;
      sdk.storage = {
        get: async k => structuredClone(raiz.__storage.get(k)),
        set: async (k, v) => { raiz.__storage.set(k, structuredClone(v)); }
      };
      const http = sdk.http.request;
      sdk.http.request = async op => {
        const r = await http(op);
        raiz.__agora += 10;
        if (op.method === 'GET' && /\\/contatos\\/9901\\/(locacoes|chamados)$/.test(op.url)) {
          (bancada.obtencoes ||= []).push(Date.now());
        }
        return r;
      };
    } });
  ` });
  for (const externa of [false, true]) {
    await caso(externa ? 'marca externa vence cache em memória ao voltar ao contato em menos de 60 s' : 'sem marca nova volta sem GET e conserva o obtidoEm mais antigo', async () => {
      await abrir();
      const obtidoEm = await b.avaliar(() => Math.min(...bancada.obtencoes));
      const status = await b.avaliar(() => document.querySelector('[data-chamado] [data-rapida="status"]').value);
      await b.avaliar(async externa => {
        if (externa) {
          const card = document.querySelector('[data-os-id]');
          bancada.alvo = card.dataset.osId;
          bancada.final = card.querySelector('[data-rapida="status"]').value === 'triagem' ? 'orcamento' : 'triagem';
          await fetch('/api/ext/chamados/' + bancada.alvo + '/status', {
            method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: bancada.final })
          });
          parent.__agora += 100;
          await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now(), por: 'externa-f23' });
        }
        await omni.storage.set(GI.CHAVE_SNAPSHOTS, { rows: [] });
      }, externa);
      await trocar(8802, 'Dois');
      await b.avaliar(() => { bancada.chamadas = []; });
      await trocar(8801, 'Um');
      const consultas = await b.avaliar(() => bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/9901\/(chamados|locacoes)$/.test(r.caminho)).length);
      assert.equal(consultas, externa ? 2 : 0, 'cache deve respeitar a marca sem gastar cota sem alteração');
      if (externa) {
        assert.equal(await b.avaliar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"] [data-rapida="status"]').value), await b.avaliar(() => bancada.final));
      } else {
        assert.equal(await b.avaliar(() => document.querySelector('[data-chamado] [data-rapida="status"]').value), status);
        assert.equal(await b.avaliar(() => GI.cockpitCarregadoEm()), obtidoEm, 'reutilização não pode rejuvenescer o dado');
        assert.equal(await b.avaliar(async () => (await omni.storage.get(GI.CHAVE_SNAPSHOTS)).rows.find(r => r.contatoId === 9901).em), obtidoEm);
      }
    });
  }
  await caso('duas abas: B vê a escrita nova de A e A relê a pendência externa uma única vez', async () => {
    await abrir();
    await b.avaliar(async base => {
      bancada.alvo = document.querySelector('[data-os-id]').dataset.osId;
      bancada.final = document.querySelector('[data-chamado] [data-rapida="status"]').value === 'triagem' ? 'orcamento' : 'triagem';
      await fetch('/api/ext/chamados/' + bancada.alvo + '/status', {
        method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: bancada.final })
      });
      parent.__agora += 100;
      bancada.marcaAnterior = Date.now();
      await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now(), por: 'terceira-aba-f23' });
      await omni.storage.set(GI.CHAVE_SNAPSHOTS, { rows: [] });
      parent.__agora += 100;
      const iframe = document.createElement('iframe'); iframe.id = 'segunda'; iframe.src = base;
      document.body.appendChild(iframe);
    }, base);
    await b.esperar(() => !!document.querySelector('#segunda').contentDocument.querySelector('[data-chamado]'));
    assert.ok(await b.avaliar(() => document.querySelector('#segunda').contentWindow.GI.cockpitCarregadoEm() > bancada.marcaAnterior));
    await b.avaliar(() => { parent.__agora += 100; bancada.chamadas = []; document.querySelector('#segunda').contentWindow.bancada.chamadas = []; });
    await b.preencher('[data-chamado] [data-rapida="prioridade"]', 'alta');
    await b.esperar(() => document.querySelector('[data-salvo="prioridade"]').textContent === '✓ salvo');
    assert.equal(await b.avaliar(async () => (await omni.storage.get(GI.CHAVE_ESCRITA)).por === GI.instanciaId), true, 'A deve publicar a própria gravação');
    assert.equal(await b.avaliar(() => GI.pendenciaExterna), await b.avaliar(() => bancada.marcaAnterior));
    await b.avaliar(() => {
      document.activeElement.blur();
      document.querySelector('#segunda').contentWindow.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    await b.esperar(() => GI.pendenciaExterna === 0 && document.querySelector('[data-os-id="' + bancada.alvo + '"] [data-rapida="status"]').value === bancada.final);
    await b.esperar(() => document.querySelector('#segunda').contentDocument.querySelector('[data-os-id="' + bancada.alvo + '"] [data-rapida="prioridade"]').value === 'alta');
    for (let i = 0; i < 3; i++) {
      await b.avaliar(() => { window.dispatchEvent(new Event('focus')); document.querySelector('#segunda').contentWindow.dispatchEvent(new Event('focus')); });
      await new Promise(r => setTimeout(r, 50));
    }
    assert.deepEqual(await b.avaliar(() => [window, document.querySelector('#segunda').contentWindow].map(w => w.bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/9901\/(chamados|locacoes)$/.test(r.caminho)).length)), [2, 2]);
  });
  assert.deepEqual(b.erros, [], 'zero exceções no Chromium');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões F23: ' + falhas.length);
  process.stdout.write('Review 4: todas as provas passaram.\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
