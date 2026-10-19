/* Bancada do cockpit: SDK simulado, portal real da bancada e Chromium sem dependências. */
import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { testarAtendente, testarRecusasAtendente } from './atendente.cenarios.mjs';
import { abrirChromium } from './chromium.mjs';

// Sem cockpit implementado, a primeira prova falha: não há contato nem chamados na tela.
function instrumentar() {
  const params = new URLSearchParams(location.search);
  window.cenario = { tipo: params.get('cenario'), alturas: [], tentativasRede: 0, posts: 0 };
  const assinar = omni.on, assinantes = {};
  omni.on = function (nome, fn) { (assinantes[nome] ||= []).push(fn); return assinar(nome, fn); };
  cenario.emitir = (nome, d) => (assinantes[nome] || []).forEach(fn => fn(d));
  const http = omni.http.request, fetchOriginal = window.fetch;
  const semRede = params.get('demonstracao') === '1';
  window.fetch = function (...a) { if (semRede) cenario.tentativasRede++; return fetchOriginal(...a); };
  omni.http.request = async function (op) {
    if (semRede) cenario.tentativasRede++;
    if (op.method === 'POST') {
      cenario.posts++;
      if (cenario.tipo === 'recusar') return { status: 422, body: '{"erro":"dados_invalidos","campos":{"titulo":"Título recusado na bancada"}}' };
      if (cenario.tipo === 'semreleitura') cenario.tipo = 'erro';
    }
    if (op.url.includes('/contatos/')) {
      if (cenario.tipo === 'carregando') await new Promise(r => { cenario.liberar = r; });
      if (cenario.tipo === 'erro') return { status: 503, body: '{"erro":"Portal indisponível de teste"}' };
      if (cenario.tipo === 'rate') return { status: 429, body: '{"erro":"rate_limit"}' };
      if (cenario.tipo === 'semchamados' && op.url.endsWith('/chamados')) return { status: 200, body: '{"rows":[],"total":0}' };
      if (cenario.tipo === 'vazio') return { status: 200, body: '{"rows":[],"total":0}' };
      if (cenario.tipo === 'lento' && op.url.includes('/9901/')) await new Promise(r => { cenario.liberar = r; });
    }
    const r = await http(op);
    if (cenario.tipo === 'hostil' && op.url.includes('/contatos/')) {
      const d = JSON.parse(r.body), x = '<img src=x onerror="window.__xss=1">';
      for (const l of d.rows || []) {
        for (const k of ['titulo', 'imovel_titulo', 'imovel_endereco', 'imovel_codigo', 'contrato_numero', 'inicio', 'fim', 'criado_em', 'numero', 'prioridade', 'status']) l[k] = x;
        l.sla = { prazo_solucao_em: x }; l.atendimento = { chat_id: x, protocolo: x, canal: x };
        l.prestador = { nome: x }; l.solicitante = { nome: x, telefone: x }; l.aprovacao = { status: x };
        for (const c of l.contatos || []) c.nome = c.telefone = c.papel = x;
      }
      r.body = JSON.stringify(d);
    }
    return r;
  };
  const contato = omni.contacts.get;
  omni.contacts.get = async n => {
    const c = await contato(n);
    if (cenario.tipo === 'hostil') c.name = c.phone = c.document = '<img src=x onerror="window.__xss=1">';
    return c;
  };
  omni.ui.resize = async h => {
    cenario.alturas.push(h);
    // Reproduz um host que devolve ao iframe a altura solicitada; medir body causaria loop.
    document.body.style.minHeight = h + 'px';
    return { applied: cenario.tipo !== 'fixo' };
  };
}
const servidor = criarServidor();
servidor.prependListener('request', (req, res) => {
  if (!req.url.startsWith('/app/painel.html')) return;
  const end = res.end;
  res.end = function (data, ...args) {
    if (typeof data === 'string' || Buffer.isBuffer(data)) data = data.toString().replace(/<script src="comum.js(?:\?v=[^"]+)?">/, '<script>(' + instrumentar.toString() + ')();</script>$&');
    return end.call(this, data, ...args);
  };
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html';
let b;
const prova = t => process.stdout.write('OK ' + t + '\n');
try {
  b = await abrirChromium();
  const pronto = () => b.esperar(() => document.querySelector('#cp-nome')?.textContent.includes('Demonstração') && !!document.querySelector('[data-chamado]'));
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const semOverflow = async () => assert.ok(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#gi-cockpit *')].every(el => el.scrollWidth <= el.clientWidth + 1 || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')), 'sem rolagem horizontal, inclusive dentro dos cartões');
  const capturar = async nome => {
    await semOverflow();
    const tamanho = await b.avaliar(() => { scrollTo(0, 0); return [innerWidth, Math.max(500, Math.ceil(document.querySelector('#gi-cockpit').getBoundingClientRect().bottom) + 20)]; });
    await b.viewport(...tamanho);
    await b.captura('cockpit-' + nome);
  };
  await testarAtendente(b, base.replace('/app/painel.html', ''), 1, async (id, texto) => {
    const d = await b.avaliar(async id => GI.chamadosObter(id), id);
    assert.equal(d.eventos.at(-1).texto, texto);
    assert.equal(d.eventos.at(-1).notificou_cliente, texto.indexOf('<img') === 0);
  });
  await testarRecusasAtendente(b, base.replace('/app/painel.html', ''));
  prova('recusas: janela encerrada preserva nota; retry não duplica aviso; texto alterado exige revisão; detalhe atrasado descartado');
  prova('perfis agente/supervisor/admin; detalhes e notas com aviso confirmado no chat aberto');
  for (const tema of ['claro', 'escuro']) {
    for (const largura of [260, 300, 334]) {
      await b.viewport(largura, 1100);
      const q = '?tema=' + tema + '&perfil=agente';
      await b.navegar(base + q); await pronto();
      assert.match(await texto('#cp-conteudo'), /Proprietário Demonstração/);
      assert.match(await texto('#cp-conteudo'), /Atendimento/);
      assert.doesNotMatch(await texto('#cp-conteudo'), /\bSLA\b/, 'prazo em linguagem simples');
      assert.equal(await b.avaliar(() => document.querySelector('[data-gestao]')), null, 'atendente não recebe atalho para gestão');
      assert.equal(await b.avaliar(() => document.querySelector('details').open), true);
      assert.equal(await b.avaliar(() => document.querySelector('details summary strong').textContent), 'OS-1001', 'emergência com SLA vencido vem antes da aprovação pausada');
      assert.ok(await b.avaliar(() => [...document.querySelectorAll('.gi-cp-trilha')].every(el => el.children.length === 7)));
      assert.equal(await b.avaliar(() => { const r = document.createRange(); const n = document.querySelector('#cp-tab-chamados').firstChild; r.setStart(n, 0); r.setEnd(n, 8); return r.getClientRects().length; }), 1, 'rótulo Chamados não quebra no meio da palavra');
      await capturar(largura + '-' + tema + '-chamados');
      await b.clicar('#cp-tab-imovel');
      assert.match(await texto('#cp-conteudo'), /Fiador/);
      await capturar(largura + '-' + tema + '-imovel');
      await b.clicar('#cp-tab-novo');
      assert.match(await texto('#cp-conteudo'), /desligada/);
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-revisar')), false);
      await b.avaliar(async () => { try { await GI.chamarPortal('/chamados', { corpo: {} }); } catch {} });
      assert.equal(await b.avaliar(() => cenario.posts), 0);
      await capturar(largura + '-' + tema + '-escrita-desligada');

      await b.navegar(base + q + '&escrita=1'); await pronto();
      await b.clicar('#cp-tab-novo'); await b.esperar(() => !!document.querySelector('[data-foto]'));
      assert.match(await texto('#cp-vinculo'), /8801.*DEMO-P8801.*WhatsApp/);
      await b.preencher('#cp-titulo', 'Reparo Demonstração');
      await b.preencher('#cp-descricao', 'Relato de teste sintético.');
      await b.clicar('[data-categoria="eletrica"]'); await b.clicar('[data-prioridade="alta"]');
      await b.clicar('[data-foto]'); await b.preencher('#cp-disponibilidade', 'Após 18h');
      await capturar(largura + '-' + tema + '-novo-vinculado');
      await b.clicar('#cp-revisar');
      assert.match(await texto('#cp-conteudo'), /Confirme antes de abrir/);
      assert.equal(await b.avaliar(() => cenario.posts), 0);
      await capturar(largura + '-' + tema + '-confirmacao');
      await b.clicar('#cp-voltar');
      assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Relato de teste sintético.');
      await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
      await b.esperar(() => document.querySelector('#cp-sucesso')?.textContent.includes('aberta'));
      assert.equal(await b.avaliar(() => document.querySelector('#cp-ver-gestao')), null);
      const criacao = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST').body));
      assert.equal(criacao.atendimento.chat_id, 8801); assert.equal(criacao.atendimento.protocolo, 'DEMO-P8801');
      assert.equal(criacao.solicitante.contato_id, 9901); assert.equal(criacao.atendente.user_id, 9999);
      assert.equal(criacao.origem, 'atendimento'); assert.equal(criacao.categoria, 'eletrica'); assert.equal(criacao.prioridade, 'alta');
      assert.equal(criacao.anexos.length, 1); assert.equal(criacao.acesso.disponibilidade, 'Após 18h');
      assert.equal(await b.avaliar(() => cenario.posts), 1);
      await b.esperar(() => bancada.chamadas.filter(c => c.caminho.includes('/contatos/9901/chamados')).length >= 2);
      await capturar(largura + '-' + tema + '-sucesso');

      for (const [cenario, esperado] of [['carregando', 'Carregando'], ['vazio', 'Nenhum imóvel'], ['semchamados', 'Nenhum chamado'], ['erro', 'Portal indisponível'], ['rate', 'Limite de consultas']]) {
        await b.navegar(base + q + '&cenario=' + cenario);
        await b.esperar(t => document.querySelector('#cp-conteudo')?.textContent.includes(t), esperado);
        await capturar(largura + '-' + tema + '-' + cenario);
        if (cenario === 'erro') {
          await b.avaliar(() => { window.cenario.tipo = ''; }); await b.clicar('#cp-tentar'); await pronto();
        }
        if (cenario === 'rate') {
          const n = await b.avaliar(() => bancada.chamadas.length);
          await b.clicar('#cp-atualizar');
          assert.equal(await b.avaliar(() => bancada.chamadas.length), n);
        }
      }
      await b.navegar(base + q + '&chat=8804');
      await b.esperar(() => document.querySelector('#cp-conteudo')?.textContent.includes('Sem contato'));
      await capturar(largura + '-' + tema + '-sem-contato');
      prova(largura + ' px ' + tema + ': estados, imóvel, Novo, confirmação, sucesso e escrita desligada');
    }
  }
  await b.navegar(base + '?cenario=lento');
  await b.esperar(() => !!cenario.liberar);
  await b.avaliar(async () => { await omni.chats.select(8802); });
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  await b.avaliar(() => { cenario.tipo = ''; cenario.liberar(); });
  await new Promise(r => setTimeout(r, 500));
  assert.match(await texto('#cp-nome'), /Dois/);
  assert.doesNotMatch(await texto('#cp-conteudo'), /Proprietário Demonstração/);
  prova('token de geração: resposta atrasada do chat anterior não mistura dados');

  await b.navegar(base); await pronto();
  await b.preencher('#cp-imovel', '1');
  assert.doesNotMatch(await texto('#cp-conteudo'), /Proprietário Demonstração/);
  await b.preencher('#cp-imovel', '0');
  assert.match(await texto('#cp-conteudo'), /Proprietário Demonstração/);
  const n = await b.avaliar(() => bancada.chamadas.length);
  await b.clicar('#cp-atualizar'); await pronto();
  await b.esperar(n => bancada.chamadas.length === n + 2, n);
  await b.clicar('#cp-tab-imovel'); await new Promise(r => setTimeout(r, 200));
  await b.clicar('#cp-tab-novo'); await new Promise(r => setTimeout(r, 200));
  const alturas = await b.avaliar(() => cenario.alturas.slice());
  assert.ok(alturas.some((h, i) => i && h < alturas[i - 1] - 2));
  assert.ok(alturas.some((h, i) => i && h > alturas[i - 1] + 2));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await b.avaliar(() => cenario.alturas.length), alturas.length);
  prova('atualização ignora cache 60s; wrapper cresce e encolhe sem realimentação de altura');

  await b.navegar(base + '?cenario=fixo'); await pronto();
  await b.clicar('#cp-tab-novo'); await new Promise(r => setTimeout(r, 200));
  assert.equal(await b.avaliar(() => cenario.alturas.length), 1);
  prova('resize applied:false encerra pedidos para slot fixo');

  await b.navegar(base); await pronto();
  const cota = await b.avaliar(async () => {
    let recusadas = 0;
    for (let i = 0; i < 31; i++) {
      try { await GI.chamarPortal('/locacoes?prova=' + i); } catch (err) { if (err.status === 429) recusadas++; else throw err; }
    }
    return { recusadas, enviadas: bancada.chamadas.length };
  });
  assert.equal(cota.enviadas, 30); assert.equal(cota.recusadas, 4);
  prova('cota local impede ultrapassar 30 requisições por minuto');

  await b.navegar(base + '?escrita=1&cenario=recusar'); await pronto();
  await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Preservar no erro');
  await b.clicar('#cp-revisar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').disabled), false);
  await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Título recusado'));
  await b.clicar('#cp-voltar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-titulo').value), 'Preservar no erro');
  await b.avaliar(() => { cenario.tipo = 'semreleitura'; });
  await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Chamado aberto'));
  assert.equal(await b.avaliar(() => !!document.querySelector('#cp-confirmar')), false);
  prova('422 preserva formulário; releitura recusada após POST mantém sucesso e evita nova gravação');

  await b.navegar(base + '?escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Não abrir no chat errado');
  await b.clicar('#cp-revisar');
  await b.avaliar(async () => {
    const user = omni.session.getUser;
    omni.session.getUser = async () => { await omni.chats.select(8802); return user(); };
  });
  await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
  assert.equal(await b.avaliar(() => cenario.posts), 0);
  prova('troca de chat durante confirmação invalida a criação antes do POST');

  await b.navegar(base); await pronto();
  const antesDeDesmontar = await b.avaliar(() => bancada.chamadas.length);
  await b.avaliar(async () => { cenario.emitir('destroy', { reason: 'teste' }); await omni.chats.select(8802); });
  await new Promise(r => setTimeout(r, 600));
  assert.equal(await b.avaliar(() => bancada.chamadas.length), antesDeDesmontar);
  assert.match(await texto('#cp-nome'), /Um/);
  prova('destroy cancela assinatura de chat e trabalho pendente');

  await b.navegar(base + '?demonstracao=1&escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Chamado sintético');
  await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  assert.equal(await b.avaliar(() => cenario.tentativasRede), 0);
  assert.equal(await b.avaliar(() => bancada.rede.length + bancada.chamadas.length), 0);
  await assert.rejects(b.avaliar(async () => GI.chamarPortal('/chamados')), /Demonstração sem rede/);
  prova('demonstração: ciclo completo sintético com zero tentativas de rede');

  for (const q of ['?modo=local&escrita=1', '?modo=fora&escrita=1']) {
    await b.navegar(base + q); await b.esperar(() => document.querySelector('#cp-conteudo')?.textContent.includes('portal conectado'));
    await b.avaliar(async () => { try { await GI.chamarPortal('/chamados', { corpo: {} }); } catch {} });
    assert.equal(await b.avaliar(() => cenario.posts), 0);
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  }
  await b.navegar(base + '?cenario=hostil&escrita=1'); await b.esperar(() => !!document.querySelector('[data-chamado]'));
  for (const aba of ['chamados', 'imovel', 'novo']) {
    await b.clicar('#cp-tab-' + aba);
    await capturar('hostil-' + aba);
    assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-cockpit img, #gi-cockpit script').length), 0);
    assert.equal(await b.avaliar(() => window.__xss), undefined);
  }
  await b.preencher('#cp-titulo', '<img src=x onerror="window.__xss=1">');
  await b.preencher('#cp-descricao', '<img src=x onerror="window.__xss=1">');
  await b.clicar('#cp-revisar');
  await capturar('hostil-confirmacao');
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-cockpit img').length), 0);
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  assert.deepEqual(b.erros, []);
  prova('dado hostil permanece texto; sem storage, sem exceções no Chromium');
  process.stdout.write('Cockpit: todas as provas passaram. Capturas em test/bancada/capturas/cockpit-*.png\n');
} catch (err) {
  if (b) process.stderr.write(JSON.stringify(await b.avaliar(() => ({ texto: document.querySelector('#gi-cockpit')?.textContent, chamadas: bancada.chamadas.map(c => [c.method, c.caminho]), erros: window.__xss }))) + '\n');
  throw err;
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
