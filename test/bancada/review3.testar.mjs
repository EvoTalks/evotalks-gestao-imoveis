import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html?escrita=1';
const falhas = [];
let b;
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK F22 ' + nome + '\n'); }
  catch (erro) { falhas.push(erro); process.stderr.write('FALHA F22 ' + nome + ': ' + erro.message + '\n'); }
}
async function abrir(query = '') {
  await b.navegar(base + query);
  await b.esperar(() => !!document.querySelector('[data-chamado]'));
}
async function acionar() {
  await b.avaliar(() => { document.activeElement.blur(); window.dispatchEvent(new Event('focus')); });
}
async function marcar() {
  await b.avaliar(async () => { await omni.storage.set('gi-ultima-escrita', { em: Date.now(), por: 'outra-tela-f22' }); bancada.antesSnapshot = bancada.gravacoesStorage; });
}
// Retém uma resposta já capturada pelo portal, sem atrasar a leitura seguinte.
function atrasar(http) {
  const original = http || omni.http.request;
  let retida = false;
  const requisitar = async op => {
    const r = await original(op);
    if (!retida && op.method === 'GET' && /\/contatos\/\d+\/chamados$/.test(op.url)) {
      retida = true;
      return new Promise(resolve => {
        bancada.captura = JSON.parse(r.body).rows[0];
        bancada.liberar = () => resolve(r);
      });
    }
    return r;
  };
  if (!http) omni.http.request = requisitar;
  return requisitar;
}
try {
  b = await abrirChromium({ antesDeCarregar: `
    // Os gatilhos são acionados explicitamente para contar as releituras sem corridas do timer.
    const intervalo = window.setInterval;
    window.setInterval = (fn, ms) => ms === 4000 ? 999999 : intervalo(fn, ms);
    let sdk;
    Object.defineProperty(window, 'omni', { configurable: true, get: () => sdk, set: valor => {
      sdk = valor;
      if (location.search.includes('atrasar=inicial')) sdk.http.request = (${atrasar.toString()})(sdk.http.request);
    } });
  ` });
  for (const modo of ['inicial', 'manual', 'externa']) {
    await caso('marca durante leitura ' + modo + ' provoca só uma releitura adicional e mostra status final', async () => {
      if (modo === 'inicial') await b.navegar(base + '&atrasar=inicial');
      else {
        await abrir();
        await b.avaliar(() => { bancada.chamadas = []; });
        await b.avaliar(atrasar);
        if (modo === 'manual') await b.clicar('#cp-atualizar');
        else { await marcar(); await acionar(); }
      }
      await b.esperar(() => !!bancada.liberar);
      await b.avaliar(async () => {
        const status = bancada.captura.status === 'triagem' ? 'orcamento' : 'triagem';
        bancada.final = status;
        await fetch('/api/ext/chamados/' + bancada.captura.id + '/status', {
          method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
        });
        await omni.storage.set('gi-ultima-escrita', { em: Date.now(), por: 'escrita-durante-get-f22' });
        bancada.antesSnapshot = bancada.gravacoesStorage;
        bancada.liberar();
      });
      await b.esperar(async () => {
        const s = await omni.storage.get(GI.CHAVE_SNAPSHOTS);
        return bancada.gravacoesStorage > bancada.antesSnapshot && s?.rows?.length && !!document.querySelector('[data-chamado]');
      });
      const tempos = await b.avaliar(async () => ({
        carregado: GI.cockpitCarregadoEm(), marca: (await omni.storage.get('gi-ultima-escrita')).em,
        snapshot: (await omni.storage.get(GI.CHAVE_SNAPSHOTS)).rows[0].em
      }));
      assert.ok(tempos.carregado < tempos.marca, 'carregadoEm deve anteceder a escrita ocorrida com o GET em voo');
      assert.equal(tempos.snapshot, tempos.carregado, 'snapshot usa o início da leitura');
      await acionar();
      await b.esperar(() => document.querySelector('[data-os-id="' + bancada.captura.id + '"] [data-rapida="status"]').value === bancada.final);
      for (let i = 0; i < 3; i++) {
        await acionar();
        await new Promise(r => setTimeout(r, 50));
      }
      assert.equal(await b.avaliar(() => bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/\d+\/(chamados|locacoes)$/.test(r.caminho)).length), 4, 'dois pares de GET, sem laço');
    });
  }
  for (const remover of [false, true, 'todas', 'confirmacao']) {
    await caso(remover ? 'locação removida (' + remover + ') preserva rascunho e exige nova escolha explícita' : 'reordenar locações conserva seleção por ID no Novo e no cabeçalho', async () => {
      await abrir(); await b.clicar('#cp-tab-novo');
      await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
      await b.preencher('#cp-titulo', '<Título F22>'); await b.preencher('#cp-descricao', 'Texto do contrato C1');
      await b.avaliar(() => { document.querySelector('#cp-mais-detalhes').open = true; });
      await b.preencher('#cp-chaves', 'Portaria');
      if (remover === 'confirmacao') await b.clicar('#cp-revisar');
      await b.avaliar(remover => {
        bancada.chamadas = [];
        const http = omni.http.request;
        omni.http.request = async op => {
          const r = await http(op);
          if (/\/contatos\/\d+\/locacoes$/.test(op.url)) {
            const dados = JSON.parse(r.body);
            dados.rows = remover === 'todas' ? [] : remover ? dados.rows.filter(l => l.id !== 1) : dados.rows.reverse();
            dados.total = dados.rows.length; r.body = JSON.stringify(dados);
          }
          return r;
        };
      }, remover);
      await marcar(); await acionar();
      await b.esperar(async remover => {
        const s = await omni.storage.get(GI.CHAVE_SNAPSHOTS);
        return bancada.gravacoesStorage > bancada.antesSnapshot && s?.rows?.[0]?.dados.locacoes.length === (remover === 'todas' ? 0 : remover ? 1 : 2);
      }, remover);
      if (remover) {
        assert.equal(await b.avaliar(() => document.querySelector('#cp-novo-imovel')?.value), '', 'imóvel removido não pode virar a primeira locação restante');
        assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo')?.value), '<Título F22>');
        assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Texto do contrato C1');
        assert.equal(await b.avaliar(() => document.querySelector('#cp-chaves').value), 'Portaria');
        assert.ok(await b.avaliar(() => document.querySelector('#cp-novo-imovel').parentElement.innerText.includes('O imóvel escolhido não está mais disponível. Escolha o imóvel de novo.')));
        assert.equal(await b.avaliar(() => document.querySelector('#cp-revisar').disabled), true);
        await b.avaliar(() => document.querySelector('#cp-form').dispatchEvent(new Event('submit', { cancelable: true })));
        assert.equal(await b.avaliar(() => !!document.querySelector('#cp-confirmar')), false, 'Enter/submit também fica bloqueado');
        assert.equal(await b.avaliar(() => document.querySelector('#cp-imovel').value), '');
        if (remover !== 'todas') {
          await b.preencher('#cp-novo-imovel', '3');
          assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo').value), '<Título F22>');
          assert.equal(await b.avaliar(() => document.querySelector('#cp-revisar').disabled), false);
          await b.clicar('#cp-revisar');
          assert.match(await b.avaliar(() => document.querySelector('.gi-cp-imovel-novo').textContent), /Contrato DEMO-C3/);
        }
      } else {
        assert.equal(await b.avaliar(() => document.querySelector('#cp-novo-imovel').value), '1');
        assert.deepEqual(await b.avaliar(() => [...document.querySelector('#cp-novo-imovel').options].map(o => o.value)), ['', '3', '1']);
        assert.equal(await b.avaliar(() => document.querySelector('#cp-imovel').value), '1');
        assert.deepEqual(await b.avaliar(() => [...document.querySelector('#cp-imovel').options].map(o => o.value)), ['3', '1']);
        await b.clicar('#cp-revisar');
        assert.match(await b.avaliar(() => document.querySelector('.gi-cp-imovel-novo').textContent), /Contrato DEMO-C1/);
      }
    });
  }
  assert.deepEqual(b.erros, [], 'zero exceções no Chromium');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões F22: ' + falhas.length);
  process.stdout.write('Review 3: todas as provas passaram.\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
