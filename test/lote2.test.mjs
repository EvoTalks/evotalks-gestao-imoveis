import test from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './bancada/servidor.mjs';
import { abrirChromium } from './bancada/chromium.mjs';

// Instrumentação antes da inicialização, sem qualquer instância real.
function instrumentar() {
  const caso = new URLSearchParams(location.search).get('lote2');
  const ready = omni.ready;
  omni.ready = fn => ready(ctx => {
    if (caso === 'gestao') ctx.contribution = { params: { chamadoId: 2 } };
    fn(ctx);
  });
  const http = omni.http.request;
  omni.http.request = async op => {
    if (caso === 'preenchidos' && op.url.includes('/preenchidos')) return { status: 503, body: '{"erro":"Preenchidos indisponíveis"}' };
    const r = await http(op);
    if (caso === 'classes' && op.url.includes('/chamados') && op.method !== 'POST') {
      const d = JSON.parse(r.body);
      for (const c of d.rows || []) { c.status = 'constructor'; c.prioridade = '__proto__'; c.categoria = 'constructor'; }
      r.body = JSON.stringify(d);
    }
    return r;
  };
}

test('lote 2: regressões no navegador', async t => {
  const servidor = criarServidor();
  servidor.prependListener('request', (req, res) => {
    if (!req.url.startsWith('/app/')) return;
    const end = res.end;
    res.end = function (data, ...args) {
      if (data && req.url.includes('.html')) data = data.toString().replace(/<script src="comum.js(?:\?v=[^"]+)?">/, '<script>(' + instrumentar.toString() + ')();</script>$&');
      return end.call(this, data, ...args);
    };
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  let b;
  try {
    b = await abrirChromium();
    const abrir = (pagina, query = '') => b.navegar('http://127.0.0.1:' + servidor.address().port + '/app/' + pagina + '.html' + query);
    const cockpit = async query => { await abrir('painel', query); await b.esperar(() => !!document.querySelector('[data-chamado]')); };
    await t.test('16: falha de preenchidos aparece como erro', async () => {
      await abrir('imoveis', '?lote2=preenchidos');
      await b.esperar(() => document.querySelector('#gi-erro').textContent.includes('Preenchidos indisponíveis'));
      assert.doesNotMatch(await b.avaliar(() => document.querySelector('#gi-corpo').textContent), /nada ainda/i);
      await b.captura('lote2-preenchidos-erro');
    });
    await t.test('18a: acordeão omite valores neutros', async () => {
      await cockpit();
      const rotulos = await b.avaliar(() => [...document.querySelectorAll('details[open] .gi-cp-kv > span:first-child')].map(n => n.textContent));
      for (const n of ['Quem paga', 'Valor estimado', 'Prestador', 'Orçamentos', 'Visita', 'Aprovação do proprietário']) assert.ok(!rotulos.includes(n), n);
      assert.ok(rotulos.includes('Status'));
      await b.captura('lote2-cockpit-sem-neutros');
    });
    await t.test('18b: atualizar ignora cache e automático o utiliza', async () => {
      await cockpit();
      const n = await b.avaliar(() => bancada.chamadas.length);
      await b.avaliar(async () => { await GI.chamadosPorContato(9901); });
      assert.equal(await b.avaliar(() => bancada.chamadas.length), n);
      await b.clicar('#cp-atualizar');
      await b.esperar(n => bancada.chamadas.length >= n + 2, n);
    });
    await t.test('18b: tentar novamente também descarta cache parcial', async () => {
      await cockpit();
      await b.avaliar(() => {
        const consultar = GI.chamadosPorContato;
        GI.chamadosPorContato = async id => { GI.chamadosPorContato = consultar; throw new Error('Falha sintética após ler locações'); };
      });
      await b.clicar('#cp-atualizar'); await b.esperar(() => !!document.querySelector('#cp-tentar'));
      const n = await b.avaliar(() => bancada.chamadas.length);
      await b.clicar('#cp-tentar');
      await b.esperar(n => bancada.chamadas.length >= n + 2, n);
    });
    await t.test('18c: troca silenciosa antes do POST reabilita confirmação', async () => {
      await cockpit('?escrita=1');
      await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Reparo sintético');
      await b.clicar('#cp-revisar');
      await b.avaliar(() => { omni.session.getUser = async () => { omni.chats.getSelected = async () => ({ id: 8802, contactId: 9902 }); return { id: 9999 }; }; });
      await b.clicar('#cp-confirmar');
      await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('O atendimento mudou; revise de novo.'));
      assert.equal(await b.avaliar(() => document.querySelector('#cp-voltar').disabled || document.querySelector('#cp-confirmar').disabled), false);
      assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
      await b.captura('lote2-chat-mudou');
    });
    await t.test('19: chaves herdadas não entram em classes nem rótulos', async () => {
      for (const pagina of ['chamados', 'painel']) {
        await abrir(pagina, '?lote2=classes');
        await b.esperar(() => !!document.querySelector('[data-editar], [data-chamado]'));
        assert.equal(await b.avaliar(() => [...document.querySelectorAll('[class]')].some(n => /\[object|function|constructor|__proto__/.test(n.className))), false);
        assert.doesNotMatch(await b.avaliar(() => document.body.textContent), /function Object|\[object Object\]/);
        await b.captura('lote2-classes-' + pagina);
      }
    });
    await t.test('20: só sent true registra nota enviada; falha preserva o texto', async () => {
      for (const resposta of [null, {}, { sent: false }, { sent: 'true' }, { sent: true }]) {
        await abrir('chamados'); await b.esperar(() => !!document.querySelector('[data-editar="1"]'));
        await b.clicar('[data-editar="1"]'); await b.esperar(() => !!document.querySelector('#c-nota'));
        await b.avaliar(async r => {
          const d = await GI.chamadosObter(1), get = omni.chats.get;
          omni.chats.get = async id => ({ ...await get(id), contactId: d.chamado.solicitante.contato_id });
          omni.chats.sendMessage = async () => r;
        }, resposta);
        await b.clicar('#c-trocar'); await b.clicar('#c-informar'); await b.preencher('#c-chat-id', '8801');
        await b.clicar('#c-vincular-manual'); await b.esperar(() => !document.querySelector('#c-avisar').disabled && !document.querySelector('#c-tirar-vinculo').disabled);
        await b.preencher('#c-nota', 'Nota sintética sem confirmação de envio'); await b.clicar('#c-avisar');
        await b.clicar('#c-salvar-nota'); await b.clicar('#c-confirmar-acao');
        if (resposta?.sent === true) {
          await b.esperar(() => bancada.chamadas.some(c => c.caminho.endsWith('/notas')));
          assert.equal(await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.caminho.endsWith('/notas')).body).notificou_cliente), true);
          await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Nota salva.'));
        } else {
          await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Envio não confirmado'));
          assert.equal(await b.avaliar(() => bancada.chamadas.some(c => c.caminho.endsWith('/notas'))), false);
          assert.equal(await b.avaliar(() => document.querySelector('#c-nota').value), 'Nota sintética sem confirmação de envio');
        }
      }
      await b.captura('lote2-nota-sem-aviso');
    });
    await t.test('21: handshake abre o chamado recebido do cockpit administrador', async () => {
      await cockpit('?perfil=admin');
      await b.avaliar(() => { omni.ui.openContribution = async (id, params) => { bancada.ultimaContribuicao = { id, params }; return { opened: true }; }; });
      await b.clicar('[data-gestao="0"]');
      await b.esperar(() => bancada.ultimaContribuicao?.id === 'gi-chamados');
      assert.equal(await b.avaliar(() => bancada.ultimaContribuicao.params.chamadoId), 1);
      await abrir('chamados', '?lote2=gestao');
      await b.esperar(() => document.querySelector('.gi-modal h2')?.textContent.includes('OS-1002'));
      await b.captura('lote2-gestao-chamado');
    });
    assert.deepEqual(b.erros, []);
  } finally {
    if (b) await b.fechar();
    servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
  }
});
