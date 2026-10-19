import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html?escrita=1';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const falhas = [];
let b;
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK RC8 ' + nome + '\n'); }
  catch (erro) { falhas.push(erro); process.stderr.write('FALHA RC8 ' + nome + ': ' + erro.message + '\n'); }
}
async function abrir() {
  await b.navegar(base);
  await b.esperar(() => document.querySelector('[data-os-id] [data-rapida="atendente"]:not(:disabled)'));
  await b.avaliar(() => {
    // Chrome 154 mantém offsetParent no <details> fechado. Reproduz o layout
    // sem caixas dos hosts anteriores, sem ocultar o rascunho por atributo.
    const estilo = document.createElement('style');
    estilo.textContent = 'details[data-os-id]:not([open]) > .gi-cp-detalhe { display: none; }';
    document.head.appendChild(estilo);
    const card = document.querySelector('[data-os-id]');
    card.open = true;
    bancada.alvo = card.dataset.osId;
  });
}
async function conferirRecolhido() {
  assert.deepEqual(await b.avaliar(() => {
    const card = document.querySelector('[data-os-id]');
    const campo = card.querySelector('[data-rapida="status"]');
    return { aberto: card.open, semLayout: campo.offsetParent === null, ocultoPorAtributo: !!campo.closest('[hidden]') };
  }), { aberto: false, semLayout: true, ocultoPorAtributo: false });
}
async function recolher() {
  await b.clicar('[data-os-id] > summary');
  await conferirRecolhido();
}
async function marcar() {
  await b.avaliar(async () => {
    const r = await fetch('/api/ext/chamados/' + bancada.alvo + '/status', {
      method: 'POST', headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'orcamento' })
    });
    if (!r.ok) throw new Error('Escrita sintética recusada: ' + r.status);
    bancada.chamadas = [];
    await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now(), por: 'outra-instancia-rc8' });
  });
}
async function acionar() {
  await b.avaliar(() => window.dispatchEvent(new Event('focus')));
  await pausa(180);
}
const consultas = () => b.avaliar(() => bancada.chamadas.filter(r => r.method === 'GET' && /\/contatos\/\d+\/(chamados|locacoes)$/.test(r.caminho)).length);
async function reler() {
  await acionar();
  await b.esperar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"] > summary').textContent.includes('Orçamento'));
  assert.equal(await consultas(), 2, 'mesma marca pendente deve gerar apenas os dois GET');
  assert.equal(await b.avaliar(() => document.querySelector('[data-os-id="' + bancada.alvo + '"]').open), false, 'releitura preserva cartão recolhido');
  await acionar();
  assert.equal(await consultas(), 2, 'marca aplicada não deve gerar novos GET');
}
async function detalhes() {
  await b.clicar('[data-os-id] [data-detalhes]');
  await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]').hidden);
}

try {
  b = await abrirChromium();
  await caso('nota sobrevive à marca externa com cartão recolhido por Escape; limpar libera a releitura', async () => {
    await abrir(); await detalhes();
    await b.preencher('[data-os-id] [data-nota]', 'Rascunho da equipe <preservar>');
    await b.avaliar(() => {
      bancada.nota = document.querySelector('[data-os-id] [data-nota]');
      bancada.nota.focus();
      bancada.nota.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await conferirRecolhido();
    await marcar(); await acionar();
    assert.equal(await consultas(), 0, 'marca externa não deve reler enquanto houver nota em cartão recolhido');
    assert.equal(await b.avaliar(() => bancada.nota.isConnected && bancada.nota === document.querySelector('[data-os-id] [data-nota]') && bancada.nota.value), 'Rascunho da equipe <preservar>');
    await b.preencher('[data-os-id] [data-nota]', '');
    await reler();
  });
  for (const tipo of ['aviso', 'cancelar']) {
    await caso(tipo + ' aberto em cartão recolhido bloqueia releitura até voltar', async () => {
      await abrir();
      if (tipo === 'aviso') {
        await b.clicar('[data-os-id] [data-aviso]');
        await b.preencher('[data-os-id] [data-aviso-texto]', 'Mensagem em revisão');
      } else {
        await b.preencher('[data-os-id] [data-rapida="status"]', 'cancelado');
        await b.preencher('[data-os-id] [data-cancelar-motivo]', 'Motivo em revisão');
      }
      await recolher(); await marcar(); await acionar();
      assert.equal(await consultas(), 0, tipo + ' não deve ser descartado pela marca externa');
      const campo = tipo === 'aviso' ? '[data-aviso-texto]' : '[data-cancelar-motivo]';
      assert.equal(await b.avaliar(s => document.querySelector('[data-os-id] ' + s).value, campo), tipo === 'aviso' ? 'Mensagem em revisão' : 'Motivo em revisão');
      await b.clicar('[data-os-id] [data-' + tipo + '-voltar]');
      await b.avaliar(() => document.activeElement.blur());
      await reler();
    });
  }
  await caso('select desabilitado em cartão recolhido bloqueia até terminar a operação', async () => {
    await abrir();
    await b.avaliar(() => { document.querySelector('[data-os-id] [data-rapida="status"]').disabled = true; });
    await recolher(); await marcar(); await acionar();
    assert.equal(await consultas(), 0, 'edição em andamento no cartão recolhido bloqueia');
    await b.avaliar(() => { document.querySelector('[data-os-id] [data-rapida="status"]').disabled = false; });
    await reler();
  });
  await caso('detalhes em voo no cartão recolhido bloqueiam; botão oculto após sucesso libera', async () => {
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
    await recolher(); await marcar(); await acionar();
    assert.equal(await consultas(), 0, 'aria-busy bloqueia mesmo sem layout no cartão recolhido');
    await b.avaliar(() => bancada.liberarDetalhes());
    await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]').hidden);
    assert.equal(await b.avaliar(() => document.querySelector('[data-os-id] [data-detalhes]').disabled), false);
    await reler();
  });
  await caso('atualização manual continua descartando a nota após a proteção da marca externa', async () => {
    await abrir(); await detalhes();
    await b.preencher('[data-os-id] [data-nota]', 'Nota antes do atualizar');
    await recolher(); await marcar(); await acionar();
    assert.equal(await consultas(), 0, 'marca externa preserva a nota');
    await b.clicar('#cp-atualizar');
    await b.esperar(() => document.querySelector('[data-os-id] [data-detalhes]:not([hidden])'));
    await b.avaliar(() => { document.querySelector('[data-os-id]').open = true; });
    await detalhes();
    assert.equal(await b.avaliar(() => document.querySelector('[data-os-id] [data-nota]').value), '', 'atualização manual mantém o descarte explícito do rascunho');
  });
  assert.deepEqual(b.erros, [], 'zero exceções no Chromium');
  if (falhas.length) throw new AggregateError(falhas, 'Regressões RC8: ' + falhas.length);
  process.stdout.write('RC8: todas as provas passaram.\n');
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
