import { testarImpeditivos } from './impeditivos.cenarios.mjs';
import { testarReview1 } from './review1.cenarios.mjs';
import { testarLote1 } from './lote1.cenarios.mjs';
import { testarCockpit2 } from './cockpit2.cenarios.mjs';
/* Bancada do cockpit: SDK simulado, portal real da bancada e Chromium sem dependências. */
import { testarResidencias } from './vinculos.cenarios.mjs';
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
      if (cenario.tipo === 'snapshot-lento' && op.url.endsWith('/locacoes')) await new Promise(r => { cenario.liberar = r; });
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
  const semOverflow = async () => assert.ok(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#gi-cockpit *')].filter(el => el.checkVisibility() && !el.classList.contains('cp-so-leitor')).every(el => el.scrollWidth <= el.clientWidth + 1 || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')), 'sem rolagem horizontal, inclusive dentro dos cartões');
  const capturar = async nome => {
    await semOverflow();
    const tamanho = await b.avaliar(() => { scrollTo(0, 0); return [innerWidth, Math.max(500, Math.ceil(document.querySelector('#gi-cockpit').getBoundingClientRect().bottom) + 20)]; });
    await b.viewport(...tamanho);
    await b.captura('cockpit-' + nome);
  };
  await testarResidencias(b, base.replace('/app/painel.html', ''));
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
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-gestao]')), true, 'atendente recebe gestão no diálogo');
      assert.equal(await b.avaliar(() => document.querySelector('details').open), true);
      assert.equal(await b.avaliar(() => document.querySelector('details summary strong').textContent), 'OS-1001', 'emergência com SLA vencido vem antes da aprovação pausada');
      assert.ok(await b.avaliar(() => [...document.querySelectorAll('.gi-cp-trilha')].every(el => el.children.length === 7)));
      assert.equal(await b.avaliar(() => { const r = document.createRange(); const n = document.querySelector('#cp-tab-chamados').firstChild; r.setStart(n, 0); r.setEnd(n, 8); return r.getClientRects().length; }), 1, 'rótulo Chamados não quebra no meio da palavra');
      await capturar(largura + '-' + tema + '-chamados');
      await b.clicar('#cp-tab-imovel');
      assert.match(await texto('#cp-conteudo'), /Fiador/);
      await capturar(largura + '-' + tema + '-imovel');
      await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
      assert.match(await texto('#cp-escrita-aviso'), /desligadas/);
      assert.equal(await b.avaliar(() => document.querySelector('#cp-tab-novo').hidden), true);
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-revisar')), false);
      await b.avaliar(async () => { try { await GI.chamarPortal('/chamados', { corpo: {} }); } catch {} });
      assert.equal(await b.avaliar(() => cenario.posts), 0);
      await capturar(largura + '-' + tema + '-escrita-desligada');

      await b.navegar(base + q + '&escrita=1'); await pronto();
      await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.esperar(() => !!document.querySelector('[data-foto]'));
      assert.match(await texto('#cp-vinculo'), /8801.*DEMO-P8801.*WhatsApp/);
      await b.preencher('#cp-descricao', 'Relato de teste sintético.');
      await b.clicar('[data-categoria="eletrica"]'); await b.clicar('[data-prioridade="alta"]');
      await b.clicar('[data-foto]'); await b.clicar('#cp-mais-detalhes summary'); await b.preencher('#cp-disponibilidade', 'Após 18h');
      await capturar(largura + '-' + tema + '-novo-vinculado');
      if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
      assert.match(await texto('#cp-conteudo'), /Confirme antes de abrir/);
      assert.equal(await b.avaliar(() => cenario.posts), 0);
      await capturar(largura + '-' + tema + '-confirmacao');
      await b.clicar('#cp-voltar');
      assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Relato de teste sintético.');
      if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
      await b.esperar(() => document.querySelector('#cp-sucesso')?.textContent.includes('aberta'));
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-ver-gestao')), true);
      const criacao = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.method === 'POST').body));
      assert.equal(criacao.atendimento.chat_id, 8801); assert.equal(criacao.atendimento.protocolo, 'DEMO-P8801');
      assert.equal(criacao.solicitante.contato_id, 9901); assert.equal(criacao.atendente.user_id, 9999);
      assert.equal(criacao.origem, 'atendimento'); assert.equal(criacao.categoria, 'eletrica'); assert.equal(criacao.prioridade, 'alta');
      assert.equal(criacao.anexos.length, 1); assert.equal(criacao.acesso.disponibilidade, 'Após 18h');
      assert.equal(await b.avaliar(() => cenario.posts), 1);
      await b.esperar(() => bancada.chamadas.filter(c => c.caminho.includes('/contatos/9901/chamados')).length >= 2);
      await capturar(largura + '-' + tema + '-sucesso');

      for (const [cenario, esperado] of [['carregando', 'Carregando'], ['vazio', 'Este contato ainda não tem residência vinculada.'], ['semchamados', 'Nenhum chamado'], ['erro', 'Portal indisponível'], ['rate', 'Limite de consultas']]) {
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
  await b.preencher('#cp-filtro-imovel', '3');
  assert.doesNotMatch(await texto('#cp-conteudo'), /Proprietário Demonstração/);
  await b.preencher('#cp-filtro-imovel', '1');
  assert.match(await texto('#cp-conteudo'), /Proprietário Demonstração/);
  const n = await b.avaliar(() => bancada.chamadas.length);
  await b.clicar('#cp-atualizar'); await pronto();
  await b.esperar(n => bancada.chamadas.length === n + 2, n);
  await b.clicar('#cp-tab-imovel'); await new Promise(r => setTimeout(r, 200));
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await new Promise(r => setTimeout(r, 200));
  const alturas = await b.avaliar(() => cenario.alturas.slice());
  assert.ok(alturas.some((h, i) => i && h < alturas[i - 1] - 2));
  assert.ok(alturas.some((h, i) => i && h > alturas[i - 1] + 2));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await b.avaliar(() => cenario.alturas.length), alturas.length);
  prova('atualização ignora cache 60s; wrapper cresce e encolhe sem realimentação de altura');

  await b.navegar(base + '?cenario=fixo'); await pronto();
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await new Promise(r => setTimeout(r, 200));
  const pedidosFixos = await b.avaliar(() => cenario.alturas.length);
  assert.ok(pedidosFixos > 0, 'o host recebe o ajuste inicial de altura');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await b.avaliar(() => cenario.alturas.length), pedidosFixos, 'applied:false encerra novas tentativas no slot fixo');
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
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.preencher('#cp-descricao', 'Preservar no erro');
  if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').disabled), false);
  await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Título recusado'));
  await b.clicar('#cp-voltar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Preservar no erro');
  await b.avaliar(() => { cenario.tipo = 'semreleitura'; });
  if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Chamado aberto'));
  assert.equal(await b.avaliar(() => !!document.querySelector('#cp-confirmar')), false);
  prova('422 preserva formulário; releitura recusada após POST mantém sucesso e evita nova gravação');

  await b.navegar(base + '?escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
  await b.preencher('#cp-descricao', 'Abertura incerta sintética'); if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
  await b.avaliar(() => { cenario.tipo = 'erro'; bancada.perderResposta = true; }); await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Conferir se abriu');
  const postsIncerta = await b.avaliar(() => cenario.posts);
  assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').disabled), false);
  await b.avaliar(() => { cenario.tipo = ''; }); await b.clicar('#cp-atualizar');
  await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent.includes('aberta'));
  assert.equal(await b.avaliar(() => cenario.posts), postsIncerta, 'conferência por releitura não repete POST');
  await b.clicar('#cp-voltar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Abertura incerta sintética', 'o campo mantém o título depois da atualização que encontrou a abertura');
  prova('abertura incerta: botão habilitado, atualização confere por GET e preserva formulário sem POST duplicado');

  // Releitura recusada mantém conferência; trocar de atendimento abandona a incerteza antiga.
  await b.navegar(base + '?escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
  await b.preencher('#cp-descricao', 'Incerta só no atendimento original RC3'); if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
  await b.avaliar(() => { cenario.tipo = 'erro'; bancada.perderResposta = true; }); await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Conferir se abriu');
  const postsFalha = await b.avaliar(() => cenario.posts);
  await b.clicar('#cp-atualizar');
  await b.esperar(() => document.querySelector('#cp-recado').textContent.includes('Não foi possível conferir'));
  assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').textContent), 'Conferir se abriu');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-confirmar').disabled), false);
  assert.equal(await b.avaliar(() => cenario.posts), postsFalha);
  await b.clicar('#cp-voltar');
  assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Incerta só no atendimento original RC3', 'releitura falha por ⟳ mantém o campo');
  await b.avaliar(async () => {
    const http = omni.http.request;
    cenario.conferenciasAntigas = 0; cenario.restaurarRede = () => { omni.http.request = http; };
    omni.http.request = async op => {
      if (op.url.includes('/contatos/9901/')) { cenario.conferenciasAntigas++; return { status: 503, body: '{"erro":"Indisponível só para contato antigo"}' }; }
      return http(op);
    };
    cenario.tipo = ''; await omni.chats.select(8802);
  });
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois') && document.querySelector('#cp-imovel').textContent.includes('Avulso') && !!document.querySelector('[data-chamado]'));
  assert.equal(await b.avaliar(() => cenario.conferenciasAntigas), 0, 'troca não consulta o contato da criação incerta');
  assert.equal(await b.avaliar(() => cenario.posts), postsFalha);
  await b.avaliar(async () => { cenario.restaurarRede(); await omni.chats.select(8801); });
  await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Um') && !!document.querySelector('[data-chamado]'));
  assert.equal(await b.avaliar(() => document.body.textContent.includes('Conferir se abriu')), false, 'voltar ao atendimento não ressuscita a incerteza descartada');
  prova('RC3 abertura incerta: falha mantém botão e título; outro contato carrega sem conferir o antigo; retorno sem incerteza residual');

  // Sem chamado na releitura, só a tentativa explícita pode mandar outro POST.
  await b.navegar(base + '?escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
  await b.preencher('#cp-titulo', 'POST não chegou ao portal RC3'); await b.preencher('#cp-descricao', 'POST não chegou ao portal RC3'); if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
  await b.avaliar(() => {
    const http = omni.http.request;
    omni.http.request = async op => {
      if (op.method === 'POST' && op.url.endsWith('/chamados')) {
        omni.http.request = http; cenario.posts++; cenario.tipo = 'erro';
        throw Object.assign(new Error('Timeout antes de gravar'), { code: 'timeout' });
      }
      return http(op);
    };
  });
  await b.clicar('#cp-confirmar'); await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Conferir se abriu');
  const postsNaoGravados = await b.avaliar(() => cenario.posts);
  await b.avaliar(() => { cenario.tipo = ''; }); await b.clicar('#cp-confirmar');
  await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Tentar de novo');
  assert.match(await texto('#cp-recado'), /Não consegui falar com o servidor\. O chamado não foi aberto\. Confira sua conexão e tente de novo\./);
  assert.equal(await b.avaliar(() => cenario.posts), postsNaoGravados);
  await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  assert.equal(await b.avaliar(() => cenario.posts), postsNaoGravados + 1, 'Tentar de novo manda um único novo POST');
  prova('RC3 abertura incerta: releitura sem chamado oferece Tentar de novo e só então repete POST');
  for (const mudanca of ['chat', 'contato', 'conferencia-tardia']) {
    await b.navegar(base + '?escrita=1'); await pronto();
    await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.preencher('#cp-descricao', 'Isolamento da incerteza RC3 ' + mudanca); if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
    await b.avaliar(() => { cenario.tipo = 'erro'; bancada.perderResposta = true; }); await b.clicar('#cp-confirmar');
    await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Conferir se abriu');
    const anteriores = await b.avaliar(() => ({ posts: cenario.posts, locacoes: bancada.chamadas.filter(c => c.caminho.endsWith('/locacoes')).length }));
    await b.avaliar(mudanca => {
      cenario.tipo = '';
      if (mudanca === 'conferencia-tardia') {
        const obter = GI.chamadosPorContato;
        GI.chamadosPorContato = n => n === 9901 ? new Promise((resolve, reject) => { cenario.recusarConferencia = () => reject(new Error('Conferência antiga falhou')); }) : obter(n);
      } else {
        const selecionado = omni.chats.getSelected;
        // O SDK passa a devolver outro par sem evento; iniciar deve conferir os dois IDs.
        omni.chats.getSelected = async () => ({ ...(await selecionado()), ...(mudanca === 'chat' ? { id: 8805 } : { contactId: 9902 }) });
      }
    }, mudanca);
    if (mudanca === 'conferencia-tardia') {
      await b.clicar('#cp-confirmar'); await b.esperar(() => !!cenario.recusarConferencia);
      await b.avaliar(async () => { await omni.chats.select(8802); });
    } else await b.clicar('#cp-atualizar');
    await b.esperar(nome => document.querySelector('#cp-nome').textContent.includes(nome) && !!document.querySelector('[data-chamado]'), mudanca === 'chat' ? 'Um' : 'Dois');
    if (mudanca === 'conferencia-tardia') {
      await b.avaliar(async () => { cenario.recusarConferencia(); await new Promise(r => setTimeout(r, 30)); });
      assert.doesNotMatch(await texto('#cp-recado'), /Não foi possível conferir/);
    } else {
      assert.ok(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/locacoes')).length) > anteriores.locacoes, 'outro par carrega normalmente em vez de conferir a incerteza');
    }
    assert.equal(await b.avaliar(() => cenario.posts), anteriores.posts);
    assert.equal(await b.avaliar(() => document.body.textContent.includes('Conferir se abriu')), false);
  }
  prova('RC3 incerteza: IDs de chat e contato conferidos mesmo sem evento; falha tardia do chat antigo descartada');



  await b.navegar(base + '?escrita=1'); await pronto();
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.preencher('#cp-descricao', 'Não abrir no chat errado');
  if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
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
  await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value)); await b.preencher('#cp-descricao', 'Chamado sintético');
  if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
  await b.esperar(() => !!document.querySelector('#cp-sucesso'));
  assert.equal(await b.avaliar(() => cenario.tentativasRede), 0);
  assert.equal(await b.avaliar(() => bancada.rede.length + bancada.chamadas.length), 0);
  await assert.rejects(b.avaliar(async () => GI.chamarPortal('/chamados')), /Demonstração sem rede/);
  prova('demonstração: ciclo completo sintético com zero tentativas de rede');

  for (const q of ['?modo=local&escrita=1', '?modo=fora&escrita=1']) {
    await b.navegar(base + q); await b.esperar(() => document.querySelector('#cp-conteudo')?.textContent.includes('Confira a URL e o token'));
    await b.avaliar(async () => { try { await GI.chamarPortal('/chamados', { corpo: {} }); } catch {} });
    assert.equal(await b.avaliar(() => cenario.posts), 0);
    assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  }
  await b.navegar(base + '?cenario=hostil&escrita=1'); await b.esperar(() => !!document.querySelector('[data-chamado]'));
  for (const aba of ['chamados', 'imovel', 'novo']) {
    await b.clicar('#cp-tab-' + aba);
    if (aba === 'novo' && await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await capturar('hostil-' + aba);
    assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-cockpit img, #gi-cockpit script').length), 0);
    assert.equal(await b.avaliar(() => window.__xss), undefined);
  }
  await b.preencher('#cp-descricao', '<img src=x onerror="window.__xss=1">');
  if (!await b.avaliar(() => document.querySelector('#cp-titulo')?.value)) await b.preencher('#cp-titulo', 'Chamado sintético Cockpit'); await b.clicar('#cp-revisar');
  await capturar('hostil-confirmacao');
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-cockpit img').length), 0);
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  const snapshotHostil = await b.avaliar(async () => omni.storage.get('gi-cockpit-snapshots-v1'));
  assert.ok(snapshotHostil.rows.length > 0);
  assert.doesNotMatch(JSON.stringify(snapshotHostil), /portalToken|base64|anexos/);
  assert.deepEqual(b.erros, []);
  prova('dado hostil permanece texto; snapshot sem arquivos ou credenciais, sem exceções no Chromium');
  await testarCockpit2(b, base);
  await testarLote1(b, base.replace('/app/painel.html', ''));
  await testarImpeditivos(b, base.replace('/app/painel.html', ''));
  await testarReview1(b, base);
  process.stdout.write('Cockpit: todas as provas passaram. Capturas em test/bancada/capturas/cockpit-*.png\n');
} catch (err) {
  if (b) process.stderr.write(JSON.stringify(await b.avaliar(() => ({ texto: document.querySelector('#gi-cockpit')?.textContent, chamadas: bancada.chamadas.map(c => [c.method, c.caminho]), erros: window.__xss }))) + '\n');
  throw err;
} finally {
  if (b) await b.fechar();
  servidor.closeAllConnections(); await new Promise(r => servidor.close(r));
}
