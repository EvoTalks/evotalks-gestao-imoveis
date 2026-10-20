import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { abrirExtensao } from './fidelidade/roteiros.mjs';

test('S3b: avisos de envio ficam na linha do checkbox sem mudar a altura do modal', async () => {
  const s = await abrirExtensao('modal', { largura:900, altura:1853 });
  try {
    const b = s.b;
    const altura = await b.avaliar(() => document.querySelector('.gi-modal').getBoundingClientRect().height);
    for (const [tipo, mensagem] of [
      ['encerrado', 'Atendimento encerrado'], ['janela', 'Janela de 24 h fechada'],
      ['canal', 'Canal não permite mensagem'], ['erro', 'Não foi possível consultar o atendimento. Escolha outro atendimento.'],
      ['aberto', ''], ['sem-vinculo', 'Vincule um atendimento aberto para avisar o cliente.']
    ]) {
      await b.clicar('.gi-modal [data-cancelar]');
      if (tipo === 'sem-vinculo') s.portal.dados.chamados.find(c => c.id === 1042).atendimento = null;
      await b.avaliar(tipo => {
        omni.chats.get = async id => {
          if (tipo === 'erro') throw new Error('Falha sintética');
          return { id, contactId:103, status:tipo === 'encerrado' ? 'closed' : 'open',
            sessionLocked:tipo === 'janela', channel:tipo === 'canal' ? 'E-mail' : 'WhatsApp' };
        };
      }, tipo);
      await b.clicar('[data-editar="1042"]');
      await b.esperar(() => !!document.querySelector('#c-nota'));
      await b.esperar(msg => document.querySelector('#c-aviso-dica').textContent === msg, mensagem);
      // A consulta do aviso pode terminar antes dos dados que definem a altura.
      await b.esperar(() => document.querySelector('#c-orcamentos')?.textContent.includes('Hidro Sul'));
      const r = await b.avaliar(() => {
        const input = document.querySelector('#c-avisar'), dica = document.querySelector('#c-aviso-dica');
        const linha = input.closest('label').getBoundingClientRect(), texto = dica.getBoundingClientRect();
        const altura = document.querySelector('.gi-modal').getBoundingClientRect().height, hidden = dica.hidden;
        dica.hidden = true;
        const alturaSemAviso = document.querySelector('.gi-modal').getBoundingClientRect().height;
        dica.hidden = hidden;
        return { disabled:input.disabled, hidden:dica.hidden, visivel:dica.checkVisibility(), title:input.title,
          descrito:input.getAttribute('aria-describedby'), altura, alturaSemAviso,
          mesmaLinha:texto.top >= linha.top && texto.bottom <= linha.bottom };
      });
      assert.equal(r.disabled, tipo !== 'aberto', tipo);
      assert.equal(r.hidden, !mensagem, tipo);
      assert.equal(r.visivel, !!mensagem, tipo);
      assert.equal(r.title, mensagem, tipo);
      assert.equal(r.descrito, 'c-aviso-dica');
      assert.equal(r.altura, r.alturaSemAviso, tipo);
      if (tipo !== 'sem-vinculo') assert.equal(r.altura, altura, tipo);
      if (mensagem) assert.equal(r.mesmaLinha, true, tipo);
    }
    assert.deepEqual(b.erros, []);
  } finally { await s.fechar(); }
});

test('S3b: rótulo de contato mascara números e rejeita disfarces com texto extra', async () => {
  const s = await abrirExtensao('novo', { largura:900, altura:960 });
  try {
    const casos = [
      ['(11) 9 ••••-1234', '(11) 9 ••••-1234'], ['11987654321', '(11) 9 ••••-4321'],
      ['5511987654321', '(11) 9 ••••-4321'], ['(11) 3456-1234', '(11) ••••-1234'],
      ['11987654321 (11) 9 ••••-1234', '(11) 9 ••••-1234'],
      ['(11) 9 ••••-1234 11987654321', '(11) 9 ••••-4321'],
      ['<b>11987654321</b>', '(11) 9 ••••-4321'], ['11987654321\n', '(11) 9 ••••-4321'],
      ['(11) 9 ••••-1234\r', '••••-1234'], ['(11) 9 ••••-1234\u2028', '••••-1234'], ['551134561234', '(11) ••••-1234'],
      ['(11) 9 ••••-1234\n', '••••-1234'], ['123456789012345', '(12) 3 ••••-2345'],
      ['1234567', '••••-4567'], ['1234', '••••'], ['1', '••••'], ['', '']
    ];
    for (const [i, [phone, esperado]] of casos.entries()) {
      await s.b.avaliar(phone => { omni.contacts.search = async () => [{ id:103, name:'Contato sintético', phone }]; }, phone);
      await s.b.preencher('#c-cliente', 'Teste ' + i);
      await s.b.esperar(() => !!document.querySelector('[data-contato="0"]'));
      await s.b.clicar('[data-contato="0"]');
      assert.equal(await s.b.avaliar(() => document.querySelector('#c-cliente').value), 'Contato sintético' + (esperado ? ' · ' + esperado : ''), phone);
    }
    assert.equal(await s.b.avaliar(() => document.querySelectorAll('#c-contatos b').length), 0);
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
});

test('S3b: aprovação aparece só após envio ou decisão; seletor atende também a aba Imóvel', async () => {
  const s = await abrirExtensao('cockpit-chamados', { largura:315, altura:1100 });
  try {
    const b = s.b, alvo = s.portal.dados.chamados.find(c => c.id === 1042);
    const url = await b.avaliar(() => location.href);
    for (const [aprovacao, texto] of [
      [{status:'aprovada'}, 'Aprovada'], [{status:'recusada'}, 'Recusada'],
      [{status:'pendente', enviada_em:'2026-10-17T12:00:00Z'}, 'Pendente'],
      [{status:'pendente', enviada_em:null}, ''], [{status:'nao_necessaria'}, '']
    ]) {
      alvo.aprovacao = aprovacao;
      await b.navegar(url);
      await b.esperar(() => !!document.querySelector('[data-os-id="1042"] .kv'));
      const valor = await b.avaliar(() => [...document.querySelectorAll('[data-os-id="1042"] .acc__body > .kv')]
        .find(n => n.querySelector('.k').textContent === 'Aprovação do proprietário')?.querySelector('.v').textContent || '');
      assert.equal(valor, texto, JSON.stringify(aprovacao));
    }
    const l = structuredClone(s.portal.dados.locacoes.find(l => l.id === alvo.locacao_id));
    l.id = 90; l.imovel_titulo = 'Residência sintética adicional'; s.portal.dados.locacoes.push(l);
    await b.navegar(url); await b.esperar(() => document.querySelector('#cp-imovel').options.length === 2);
    for (const aba of ['chamados','imovel','novo']) {
      await b.clicar('#cp-tab-' + aba);
      assert.equal(await b.avaliar(() => document.querySelector('#cp-selecao').checkVisibility()), aba !== 'novo', aba);
      if (aba === 'imovel') {
        await b.preencher('#cp-imovel', '90');
        assert.match(await b.avaliar(() => document.querySelector('#cp-conteudo').textContent), /Residência sintética adicional/);
      }
    }
    assert.deepEqual(b.erros, []);
  } finally { await s.fechar(); }
});

test('S3b: rodapé verdadeiro e contagens sem larguras ajustadas aos números do desenho', async () => {
  let s = await abrirExtensao('cockpit-chamados', { largura:315, altura:1100 });
  try {
    assert.equal(await s.b.avaliar(() => document.querySelector('#cp-conteudo > .foot').textContent), 'Chamados de todas as residências.');
  } finally { await s.fechar(); }
  s = await abrirExtensao('imoveis', { largura:1360, altura:738 });
  try {
    const estilos = await s.b.avaliar(() => ['.gi-contagem-campos','.gi-total-catalogo'].map(sel => {
      const c = getComputedStyle(document.querySelector(sel)); return { display:c.display, minWidth:c.minWidth };
    }));
    assert.deepEqual(estilos, [{display:'inline', minWidth:'0px'}, {display:'inline', minWidth:'0px'}]);
  } finally { await s.fechar(); }
});

test('S3b: textareas dos recortes seguem o desenho sem grip de redimensionamento', async () => {
  for (const quadro of ['novo','modal','cockpit-novo']) {
    const s = await abrirExtensao(quadro, {largura:900, altura:1853});
    try {
      const textareas = await s.b.avaliar(() => [...document.querySelectorAll('textarea')]
        .filter(n => n.checkVisibility()).map(n => ({id:n.id, resize:getComputedStyle(n).resize})));
      assert.ok(textareas.length, quadro);
      for (const campo of textareas) assert.equal(campo.resize, 'none', quadro + '/' + campo.id);
    } finally { await s.fechar(); }
  }
});

test('S3b: todas as páginas recebem navegação única sem manutenção no menu do host', async () => {
  const s = await abrirExtensao('imoveis', { largura:1360, altura:1000 });
  try {
    const base = await s.b.avaliar(() => location.origin);
    for (const pagina of ['imoveis','chamados','prestadores','campos','config','historico']) {
      await s.b.navegar(base + '/app/' + pagina + '.html?fixture=desenho');
      await s.b.esperar(() => document.querySelectorAll('.gi-nav-item').length === 4);
      assert.deepEqual(await s.b.avaliar(() => [...document.querySelectorAll('.gi-nav-item')].map(n => n.textContent)), ['Imóveis','Campos','Histórico','Configurações']);
      if (pagina === 'prestadores') {
        assert.equal(await s.b.avaliar(() => document.querySelectorAll('.gi-nav-ativo').length), 0);
        await s.b.clicar('#b-novo');
        await s.b.esperar(() => !!document.querySelector('.gi-modal input'));
      }
    }
    assert.doesNotMatch(await s.b.avaliar(() => GI.cabecalho('gi-prestadores')), /Prestadores|gi-nav-ativo/);
    const m = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
    assert.equal(m.contributions.some(c => c.items?.some(i => i.id === 'gi-prestadores')), false);
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
});
