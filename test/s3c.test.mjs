import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';
import { abrirExtensao } from './fidelidade/roteiros.mjs';

const visitas = [
  ['2026-10-19T18:30:00-03:00', '2026-10-19T19:45:00-03:00', 'seg 19/10 · 18h30 às 19h45'],
  ['2026-10-19T14:00:00-03:00', '2026-10-19T16:00:00-03:00', 'seg 19/10 · 14h às 16h'],
  ['2026-10-19T14:00:00-03:00', '2026-10-19T16:30:00-03:00', 'seg 19/10 · 14h às 16h30'],
  ['2026-10-19T23:30:00-03:00', '2026-10-20T00:45:00-03:00', 'seg 19/10 · 23h30 às ter 20/10 · 00h45'],
  ['2026-10-20T00:30:00Z', '2026-10-20T01:45:00Z', 'seg 19/10 · 21h30 às 22h45'],
  ['2026-10-19T18:30:00-03:00', null, 'seg 19/10 · 18h30']
];

function comum() {
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), { window, document: {}, URL, setTimeout });
  return window.GI;
}

test('S3c: janela da visita conserva minutos, data final diferente e fuso local', () => {
  const anterior = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    const GI = comum();
    for (const [inicio, fim, esperado] of visitas) assert.equal(GI.janelaVisita(inicio, fim), esperado);
    for (const inicio of [null, '', 'inválido']) assert.equal(GI.janelaVisita(inicio, null), '');
    assert.equal(GI.janelaVisita(visitas[0][0], 'inválido'), 'seg 19/10 · 18h30');
  } finally { if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior; }
});

test('S3c: duração de solução vem da prioridade configurada, sem prazo inventado', () => {
  const GI = comum();
  const cfg = { sla: { alta: { solucao_h:48 }, normal: { solucao_h:168 }, emergencia: { solucao_h:12 } } };
  assert.equal(GI.slaSolucaoTexto(cfg, 'alta'), '48h');
  assert.equal(GI.slaSolucaoTexto(cfg, 'normal'), '168h');
  assert.equal(GI.slaSolucaoTexto(cfg, 'emergencia'), '12h');
  for (const v of [undefined, null, 0, -1, 'inválido', Infinity]) {
    assert.equal(GI.slaSolucaoTexto({ sla:{ alta:{ solucao_h:v } } }, 'alta'), '');
  }
  assert.equal(GI.slaSolucaoTexto(null, 'alta'), '');
  assert.equal(GI.slaSolucaoTexto(cfg, 'inexistente'), '');
});

async function abrirGestao(fn) {
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  let b;
  try {
    b = await abrirChromium();
    await b.navegar('http://127.0.0.1:' + servidor.address().port + '/app/chamados.html');
    await b.esperar(() => !!document.querySelector('[data-editar]'));
    await b.clicar('#b-novo');
    await b.esperar(() => !!document.querySelector('#c-origem') && !document.querySelector('#c-atendente').disabled);
    await fn(b);
    assert.deepEqual(b.erros, []);
  } finally {
    if (b) await b.fechar();
    servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
  }
}
async function cliente(b, nome) {
  await b.preencher('#c-cliente', nome);
  await b.esperar(() => !!document.querySelector('[data-contato="0"]'));
  await b.clicar('[data-contato="0"]');
  await b.esperar(() => !document.querySelector('#c-locacao').disabled && !!document.querySelector('[data-atendimento="0"]'));
}
async function semVinculo(b, oculto) {
  assert.equal(await b.avaliar(() => document.querySelector('#c-vinculo').textContent), 'Nenhum atendimento vinculado');
  assert.equal(await b.avaliar(() => document.querySelector('#c-escolha-atendimento').hidden), oculto);
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-atendimento][aria-checked="true"]').length), 0);
}

test('S3c: origem sem atendimento antes do cliente persiste na troca e no POST', async () => {
  await abrirGestao(async b => {
    await b.preencher('#c-origem', 'gestao');
    await cliente(b, 'Locatário Demonstração Um');
    await semVinculo(b, true);
    await cliente(b, 'Locatário Demonstração Dois');
    await semVinculo(b, true);
    // Reselecionar o mesmo contato recarrega a consulta; a escolha deve persistir.
    await cliente(b, 'Locatário Demonstração Dois');
    await semVinculo(b, true);
    await b.clicar('#c-trocar');
    await semVinculo(b, true);
    await b.preencher('#c-descricao', 'Reparo sintético sem conversa.');
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => bancada.chamadas.some(r => r.method === 'POST' && r.caminho === '/api/ext/chamados'));
    const post = await b.avaliar(() => JSON.parse(bancada.chamadas.find(r => r.method === 'POST' && r.caminho === '/api/ext/chamados').body));
    assert.equal(post.origem, 'gestao');
    assert.equal(post.atendimento ?? null, null, 'não pode enviar vínculo recusado');
  });
});

test('S3c: escolha explícita na lista persiste; outro modo libera seleção automática', async () => {
  await abrirGestao(async b => {
    await cliente(b, 'Locatário Demonstração Um');
    await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('#8801'));
    await b.clicar('#c-sem-atendimento');
    await semVinculo(b, false);
    await cliente(b, 'Locatário Demonstração Dois');
    await semVinculo(b, false);
    await b.preencher('#c-origem', 'gestao');
    await b.preencher('#c-origem', 'atendimento');
    await cliente(b, 'Locatário Demonstração Um');
    await b.esperar(() => document.querySelector('#c-vinculo').textContent.includes('#8801'));
    assert.equal(await b.avaliar(() => document.querySelector('#c-escolha-atendimento').hidden), false);
  });
});

test('S3c: cockpit e lista exibem janela sem truncar os minutos', async () => {
  for (const quadro of ['cockpit-chamados', 'lista']) {
    const s = await abrirExtensao(quadro, { largura:1360, altura:1100 });
    try {
      const url = await s.b.avaliar(() => location.href), c = s.portal.dados.chamados.find(c => c.id === 1042);
      c.status = 'agendado'; c.aprovacao = {status:'nao_necessaria'};
      c.sla = { primeira_resposta_em:'2026-10-17T20:00:00-03:00', prazo_solucao_em:'2026-10-30T12:00:00-03:00' };
      for (const [inicio, fim, esperado] of visitas) {
        c.visita = { inicio, fim };
        await s.b.navegar(url);
        const sel = quadro === 'lista' ? '[data-editar="1042"]' : '[data-os-id="1042"]';
        await s.b.esperar(sel => !!document.querySelector(sel), sel);
        const texto = await s.b.avaliar((sel, lista) => {
          const el = document.querySelector(sel);
          return lista ? el.closest('tr').cells[5].textContent : el.querySelector('summary').textContent;
        }, sel, quadro === 'lista');
        const exibido = quadro === 'lista' ? esperado.split(' às ')[0] : esperado;
        assert.ok(texto.includes(exibido), quadro + ': ' + texto + ' deve conter ' + exibido);
      }
      assert.deepEqual(s.b.erros, []);
    } finally { await s.fechar(); }
  }
});

test('S3c: legenda de alta segue SLA de 48h, 96h e 72h, inclusive após reler config', async () => {
  const s = await abrirExtensao('lista', { largura:1360, altura:1100 });
  try {
    const original = s.portal.responder;
    let horas = 48, indisponivel = false;
    s.portal.responder = (method, url, body) => {
      const r = original(method, url, body);
      if (url.pathname === '/api/ext/config/manutencao') {
        if (indisponivel) return {status:503, corpo:{erro:'config_indisponivel'}};
        r.corpo.sla.alta.solucao_h = horas;
      }
      return r;
    };
    const c = s.portal.dados.chamados.find(c => c.id === 1042);
    c.status = 'triagem'; c.prioridade = 'alta';
    c.criado_em = '2026-10-17T19:41:00-03:00';
    c.sla = { primeira_resposta_em:c.criado_em };
    for (const h of [48, 96, 72]) {
      horas = h; c.sla.prazo_solucao_em = new Date(Date.parse(c.criado_em) + h * 3600000).toISOString();
      await s.b.clicar('#b-buscar');
      await s.b.esperar(() => !!document.querySelector('[data-editar="1042"]'));
      assert.equal(await s.b.avaliar(() => document.querySelector('[data-editar="1042"]').closest('tr').cells[5].querySelector('.gi-ajuda')?.textContent), 'solução em ' + h + 'h');
    }
    indisponivel = true;
    await s.b.clicar('#b-buscar');
    await s.b.esperar(() => !!document.querySelector('[data-editar="1042"]'));
    assert.equal(await s.b.avaliar(() => document.querySelector('[data-editar="1042"]').closest('tr').cells[5].querySelector('.gi-ajuda')?.textContent || ''), '');
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
});
