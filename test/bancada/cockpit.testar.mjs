// Cockpit de busca (chatPanel) com portal sintético seguindo o contrato do spec e o stub do SDK.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarServidor } from './servidor.mjs';
import { criarPortalBusca } from './portal-busca.mjs';
import { abrirChromium } from './chromium.mjs';

const saida = fileURLToPath(new URL('../resultados-cockpit/', import.meta.url));
mkdirSync(saida, { recursive: true });
let origem = '';
const portal = criarPortalBusca({ origem: () => origem });
const todasFalsas = { ver_imoveis: false, editar_imoveis: false, gerenciar_campos: false, ver_historico: false, ver_configuracoes: false };
const servidor = criarServidor({ busca: portal, permissoes: { 9990: todasFalsas } });
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
origem = 'http://127.0.0.1:' + servidor.address().port;
portal.iniciar();
let b, passes = 0;
const ok = (c, m) => { assert.ok(c, m); passes++; };
const eq = (a, e, m) => { assert.deepEqual(a, e, m); passes++; };
const pausa = ms => new Promise(r => setTimeout(r, ms));
const cartoes = () => b.avaliar(() => document.querySelectorAll('.cp-card').length);
const ultimaBusca = () => portal.log.filter(l => l.rota === '/busca').at(-1)?.q;
const nBuscas = () => portal.log.filter(l => l.rota === '/busca').length;
const msgs = () => b.avaliar(() => bancada.mensagens.length);
const txt = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
const semRolagemHorizontal = () => b.avaliar(() => {
  const d = document.documentElement;
  return d.scrollWidth <= innerWidth && [...document.querySelectorAll('.cp-rolagem')].every(e => e.scrollWidth <= e.clientWidth + 1);
});
async function foto(nome) {
  const { data } = await b.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(saida + nome + '.png', Buffer.from(data, 'base64'));
}
async function abrir(consulta = '') {
  await b.navegar(origem + '/app/cockpit.html' + consulta);
  await b.esperar(() => document.querySelectorAll('.cp-card').length > 0);
}
try {
  b = await abrirChromium({ antesDeCarregar: "window.__copiado=null;Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__copiado=t;return Promise.resolve();}},configurable:true});" });
  for (const largura of [360, 480]) {
    await b.viewport(largura, 720);
    portal.log.length = 0; portal.falharFotos = [];
    await abrir();
    // Primeira busca, contagem, ordem e selos.
    eq(ultimaBusca(), { pagina: '1', por_pagina: '20' }, 'primeira busca sem filtros');
    eq(await cartoes(), 20); eq(await txt('#cp-contagem'), '45 imóveis');
    eq(await b.avaliar(() => document.querySelector('.cp-card .cp-selo--pendente,.cp-card .cp-selo--escuro') === null), true, 'disponíveis primeiro');
    ok(/Casa|Apartamento/.test(await txt('.cp-card .cp-info')) && /R\$/.test(await txt('.cp-card .cp-valor')), 'linhas de informação e valor');
    ok(/\/mês/.test(await b.avaliar(() => [...document.querySelectorAll('.cp-card')].find(c => /Locação/.test(c.textContent)).querySelector('.cp-valor').textContent)), 'locação em /mês');
    ok(await b.avaliar(() => [...document.querySelectorAll('.cp-card')].every(c => !/NaN|undefined|null/.test(c.textContent))), 'sem lixo no texto');
    ok(await b.avaliar(() => !!document.querySelector('.cp-selo--restricao[title*="Aceita pet"]')), 'selo Restrição com os campos no title');
    ok(await b.avaliar(() => [...document.querySelectorAll('.cp-selo--neutro')].some(s => s.textContent === 'Venda') && [...document.querySelectorAll('.cp-selo--neutro')].some(s => s.textContent === 'Locação')), 'selos Venda e Locação');
    ok(await semRolagemHorizontal(), 'lista sem rolagem horizontal em ' + largura);
    await foto('lista-' + largura);
    // Carregar mais.
    await b.clicar('#cp-mais'); await b.esperar(() => document.querySelectorAll('.cp-card').length === 40);
    eq(ultimaBusca().pagina, '2'); await b.clicar('#cp-mais'); await b.esperar(() => document.querySelectorAll('.cp-card').length === 45);
    ok(await b.avaliar(() => document.getElementById('cp-mais').hidden), 'sem mais páginas');
    ok(await b.avaliar(() => /Indisponível/.test(document.getElementById('cp-itens').textContent) && /Reservado/.test(document.getElementById('cp-itens').textContent)), 'selos de situação');
    await foto('selos-' + (largura));
    // Digitação: uma busca só depois dos 300 ms.
    const antes = nBuscas();
    await b.preencher('#cp-q', 'sint'); await b.preencher('#cp-q', 'sintético 1');
    await pausa(150); eq(nBuscas(), antes, 'espera antes de buscar');
    await b.esperar(() => true); await pausa(400);
    eq(nBuscas(), antes + 1, 'uma busca após a espera'); eq(ultimaBusca().texto, 'sintético 1');
    // Filtros e parâmetros.
    await b.clicar('[data-trans="Locacao"]'); await pausa(80); eq(ultimaBusca().transacao, 'Locacao');
    await b.clicar('[data-trans="Locacao"]'); await pausa(80); eq(ultimaBusca().transacao, undefined, 'alternância desliga');
    await b.preencher('#cp-q', ''); await pausa(450);
    await b.clicar('[data-trans="Locacao"]'); await pausa(80);
    ok(await b.avaliar(() => [...document.getElementById('cp-cidade').options].map(o => o.value).join('|') === '|Cidade Fictícia|Outra Cidade'), 'cidades do /busca/opcoes');
    await b.preencher('#cp-cidade', 'Cidade Fictícia'); await pausa(80);
    eq(ultimaBusca().cidade, 'Cidade Fictícia');
    eq(await b.avaliar(() => [...document.getElementById('cp-bairro').options].map(o => o.value).join('|')), '|Bairro Exemplo|Águas Modelo', 'bairros dependem da cidade');
    await b.preencher('#cp-bairro', 'Bairro Exemplo'); await pausa(80); eq(ultimaBusca().bairro, 'Bairro Exemplo');
    await b.preencher('#cp-quartos', '2'); await pausa(80); eq(ultimaBusca().quartos_min, '2');
    await b.preencher('#cp-valor', '3000'); eq(await b.avaliar(() => document.getElementById('cp-valor').value), '3.000', 'máscara');
    await pausa(550); eq(ultimaBusca().valor_max, '3000', 'valor em reais');
    ok(!(await b.avaliar(() => document.getElementById('cp-limpar').hidden)), 'Limpar aparece com filtro');
    ok(await semRolagemHorizontal(), 'filtros sem rolagem horizontal');
    const total = await txt('#cp-contagem'); ok(/imóve/.test(total) && total !== '45 imóveis' && !/^0 /.test(total), 'contagem acompanha filtros: ' + total);
    await foto('filtros-' + largura);
    // Trocar de cidade zera o bairro.
    await b.preencher('#cp-cidade', 'Outra Cidade'); await pausa(80); eq(ultimaBusca().bairro, undefined, 'bairro zerado');
    await b.clicar('#cp-limpar'); await pausa(80);
    eq(ultimaBusca(), { pagina: '1', por_pagina: '20' }, 'Limpar volta à busca vazia'); ok(await b.avaliar(() => document.getElementById('cp-limpar').hidden));
    await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
    // Busca sem resultado.
    await b.preencher('#cp-q', 'zzzz'); await pausa(450); await b.esperar(() => !document.getElementById('cp-vazio').hidden); eq(await txt('#cp-contagem'), '0 imóveis');
    await b.preencher('#cp-q', ''); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
    // Detalhe: abre pelo card, o botão do card não abre.
    await b.avaliar(() => { document.getElementById('cp-rolagem').scrollTop = 120; });
    const rolagem = await b.avaliar(() => document.getElementById('cp-rolagem').scrollTop);
    await b.preencher('#cp-q', 'sintético 2'); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length > 0);
    ok(await b.avaliar(() => !!document.querySelector('[data-codigo="DEMO-002"]')), 'imóvel 2 achado');
    await b.clicar('[data-codigo="DEMO-002"] [data-enviar-card]'); await pausa(300);
    ok(await b.avaliar(() => document.getElementById('cp-detalhe').hidden), 'botão Enviar do card não abre o detalhe');
    const m0 = await b.avaliar(() => bancada.mensagens.slice(-1)[0]);
    eq(m0.chatId, 8801); eq(m0.payload, { text: portal.itens[1].titulo + '\n' + portal.itens[1].link, fileId: 7001 }, 'card enviado com capa, legenda e link');
    ok(/Enviado ✓/.test(await txt('[data-codigo="DEMO-002"] [data-enviar-card]')), 'Enviado ✓');
    await b.avaliar(() => document.querySelector('[data-codigo="DEMO-002"]').click());
    await b.esperar(() => !document.getElementById('cp-detalhe').hidden && document.querySelectorAll('.cp-celula').length > 0).catch(async e => { console.log(await b.avaliar(() => document.getElementById('cp-corpo').textContent + '|' + document.getElementById('cp-recado-d').textContent + '|' + document.getElementById('cp-detalhe').hidden)); throw e; });
    ok(await b.avaliar(() => document.getElementById('cp-lista').hidden));
    eq(await b.avaliar(() => document.querySelectorAll('.cp-celula').length), 12, 'galeria com todas as fotos');
    const campos = await txt('.cp-campos');
    ok(/^Descrição do imóvel 2\n+Segunda linha & fim$/.test(await b.avaliar(() => [...document.querySelectorAll('.cp-campo')].find(c => /Descrição/.test(c.textContent)).querySelector('.cp-val').textContent)), 'descrição em texto limpo');
    ok(/Taxa interna/.test(await txt('#cp-corpo')) && /Interno \(não vai ao cliente\)/.test(await txt('#cp-corpo')), 'seção interna');
    ok(!/Taxa interna/.test(campos), 'interno fora da lista pública');
    ok(/R\$ 3\.100\.000?|R\$ 3\.1\d\d\.000/.test(campos) || /Valor de venda/.test(campos), 'valor de venda no detalhe');
    ok(await semRolagemHorizontal(), 'detalhe sem rolagem horizontal');
    await foto('detalhe-' + largura);
    await b.avaliar(() => { document.getElementById('cp-corpo').scrollTop = 600; }); await foto('detalhe-campos-' + largura);
    await b.avaliar(() => { document.getElementById('cp-corpo').scrollTop = 0; });
    // Copiar.
    await b.clicar('[data-copiar="0"]'); await b.esperar(() => window.__copiado !== null);
    eq(await b.avaliar(() => window.__copiado), portal.itens[1].codigo_curto, 'área de transferência'); ok(/Copiado ✓/.test(await txt('[data-copiar="0"]')));
    await b.clicar('[data-copiar-link]'); await b.esperar(() => window.__copiado === 'https://example.invalid/imovel/2');
    // Enviar card do detalhe.
    const antesMsgs = await msgs();
    await b.clicar('#cp-corpo [data-enviar-card]'); await b.esperar(n => bancada.mensagens.length === n + 1, antesMsgs);
    // Fotos selecionadas, uma chamada por foto.
    await b.clicar('[data-sel="0"]'); await b.clicar('[data-sel="2"]'); eq(await txt('#cp-n-sel'), '2');
    const m1 = await msgs();
    await b.clicar('[data-enviar-selecionadas]'); await b.esperar(n => bancada.mensagens.length === n + 2, m1);
    eq(await b.avaliar(() => bancada.mensagens.slice(-2).map(m => m.payload)), [{ fileId: 9000 }, { fileId: 9002 }]);
    eq(portal.log.filter(l => /fotos$/.test(l.rota)).at(-1).corpo, { indices: [0, 2] });
    await b.clicar('[data-enviar-foto="4"]'); await b.esperar(n => bancada.mensagens.length === n + 3, m1);
    eq(portal.log.filter(l => /fotos$/.test(l.rota)).at(-1).corpo, { indices: [4] });
    // Limite de 9 seleções e "Enviar todas".
    for (let i = 0; i < 12; i++) if (await b.avaliar(i => !document.querySelector('[data-sel="' + i + '"]').disabled && !document.querySelector('[data-sel="' + i + '"]').checked, i)) await b.clicar('[data-sel="' + i + '"]');
    eq(await txt('#cp-n-sel'), '9', 'máximo de 9 selecionadas'); eq(await b.avaliar(() => document.querySelectorAll('[data-sel]:disabled').length), 3);
    const m2 = await msgs();
    await b.clicar('[data-enviar-todas]'); await b.esperar(n => bancada.mensagens.length === n + 9, m2);
    eq(portal.log.filter(l => /fotos$/.test(l.rota)).at(-1).corpo.indices.length, 9, 'Enviar todas limita a 9');
    // Falha de uma foto: diz qual e envia as outras.
    await b.avaliar(() => { document.querySelectorAll('[data-sel]:checked').forEach(c => c.click()); });
    portal.falharFotos = [1]; await b.clicar('[data-sel="0"]'); await b.clicar('[data-sel="1"]'); await b.clicar('[data-sel="2"]');
    const m3 = await msgs(); await b.clicar('[data-enviar-selecionadas]'); await b.esperar(() => /foto 2/.test(document.getElementById('cp-recado-d').textContent));
    eq(await msgs(), m3 + 2, 'as outras fotos foram enviadas'); portal.falharFotos = [];
    // Janela de 24 h.
    await b.avaliar(() => { bancada.recusarEnvio = true; });
    const m4 = await msgs(); await b.clicar('#cp-corpo [data-enviar-card]');
    await b.esperar(() => /Fora da janela de 24 h do WhatsApp: envie um modelo antes/.test(document.getElementById('cp-recado-d').textContent));
    eq(await msgs(), m4, 'forbidden não reenvia'); await b.avaliar(() => { bancada.recusarEnvio = false; });
    // Sem atendimento aberto: envio desligado, cópia continua.
    await b.avaliar(() => bancada.selecionarChat(null)); await b.esperar(() => document.getElementById('cp-dica-envio-d').textContent !== '');
    eq(await txt('#cp-dica-envio-d'), 'Abra um atendimento para enviar');
    ok(await b.avaliar(() => [...document.querySelectorAll('[data-envio]')].every(x => x.disabled)), 'envios desabilitados sem chat');
    await foto('sem-chat-' + largura);
    await b.avaliar(() => { window.__copiado = null; }); await b.clicar('[data-copiar="1"]'); await b.esperar(() => window.__copiado !== null);
    await b.avaliar(() => bancada.selecionarChat(8802)); await b.esperar(() => document.getElementById('cp-dica-envio-d').textContent === '');
    ok(await b.avaliar(() => document.querySelector('[data-enviar-card]').disabled === false), 'reabilita ao selecionar chat');
    await b.avaliar(() => bancada.selecionarChat(8801)); await pausa(100);
    // Voltar mantém busca, filtros e rolagem.
    await b.clicar('#cp-voltar');
    ok(await b.avaliar(() => document.getElementById('cp-detalhe').hidden && !document.getElementById('cp-lista').hidden));
    eq(await b.avaliar(() => document.getElementById('cp-q').value), 'sintético 2', 'busca mantida');
    ok(await b.avaliar(() => document.getElementById('cp-itens').children.length > 0), 'lista mantida');
    ok(rolagem > 0, 'rolagem de teste existia');
    // Rolagem restaurada (lista inteira de 20 itens).
    await b.preencher('#cp-q', ''); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
    await b.avaliar(() => { document.getElementById('cp-rolagem').scrollTop = 200; });
    await b.avaliar(() => document.querySelectorAll('.cp-card')[3].click()); await b.esperar(() => !document.getElementById('cp-detalhe').hidden);
    await b.clicar('#cp-voltar'); eq(await b.avaliar(() => document.getElementById('cp-rolagem').scrollTop), 200, 'rolagem restaurada');
  }
  // ---- Correções do lote único (0.34.0) ----
  const atrasarPortal = () => b.avaliar(() => {
    if (window.__atrasou) return; window.__atrasou = true;
    const o = omni.http.request;
    omni.http.request = function (op) { const p = o(op); return /\/(card|fotos)$/.test(op.url) ? p.then(r => new Promise(res => setTimeout(() => res(r), 700))) : p; };
  });
  const ir = async c => { await b.preencher('#cp-q', c); await pausa(450); await b.esperar(c => !!document.querySelector('[data-codigo="' + c + '"]'), c); };
  const clicarJs = s => b.avaliar(s => document.querySelector(s).click(), s);
  // Card: miniatura quadrada à esquerda, título em até 2 linhas, em qualquer largura de 320 a 600.
  for (const l of [320, 360, 480, 600]) {
    await b.viewport(l, 720); await abrir(); await pausa(100);
    const g = await b.avaliar(() => {
      const c = document.querySelector('.cp-card'), f = c.querySelector('.cp-foto').getBoundingClientRect(), t = c.querySelector('.cp-titulo').getBoundingClientRect();
      const sp = c.querySelector('.cp-abrir span').getBoundingClientRect(), bt = c.querySelector('[data-enviar-card]').getBoundingClientRect();
      return { fr: f.right, fh: f.height, fw: f.width, tl: t.left, th: sp.height, bw: bt.width, bh: bt.height, aria: c.querySelector('[data-enviar-card]').getAttribute('aria-label'), titulo: c.querySelector('[data-enviar-card]').title };
    });
    ok(g.fr <= g.tl, 'miniatura à esquerda do título em ' + l); ok(g.fh <= 96 && g.fh >= 80 && g.fw === g.fh, 'miniatura quadrada de 80 a 96 px em ' + l);
    ok(g.th <= 2 * 18, 'título em até 2 linhas em ' + l + ': ' + g.th);
    ok(g.aria === 'Enviar card ao cliente' && g.titulo === 'Enviar card ao cliente', 'botão com aria-label e title');
    if (l < 380) ok(g.bw <= 40 && g.bh >= 32, 'Enviar compacto (só ícone) em ' + l + ': ' + g.bw);
    ok(await semRolagemHorizontal(), 'sem rolagem horizontal em ' + l);
    if (l === 320) await foto('lista-320');
  }
  await b.viewport(360, 720);
  // Acessibilidade: nada de role=button com botão dentro; abrir pelo teclado; foco volta ao card; foto >= 32 px.
  await abrir();
  eq(await b.avaliar(() => document.querySelectorAll('[role=button]').length), 0, 'sem role=button');
  ok(await b.avaliar(() => [...document.querySelectorAll('.cp-card')].every(c => c.querySelector('button[data-abrir]') && c.querySelector('button[data-enviar-card]') && !c.hasAttribute('tabindex'))), 'abrir e Enviar são botões separados');
  await ir('DEMO-004');
  await b.avaliar(() => document.querySelector('[data-codigo="DEMO-004"] [data-abrir]').focus()); await b.tecla('Enter');
  await b.esperar(() => !document.getElementById('cp-detalhe').hidden && document.querySelectorAll('.cp-celula').length > 0);
  ok(await b.avaliar(() => [...document.querySelectorAll('.cp-foto-env')].every(x => { const r = x.getBoundingClientRect(); return r.width >= 32 && r.height >= 32; })), 'botão de foto com 32 px ou mais');
  await clicarJs('#cp-voltar');
  eq(await b.avaliar(() => document.activeElement.closest('.cp-card')?.getAttribute('data-codigo')), 'DEMO-004', 'foco volta ao card');
  // Altura: pede ao host ao abrir e na troca de vista, sem laço; lista e detalhe rolam por dentro.
  await abrir(); await pausa(300);
  const alturas = await b.avaliar(() => bancada.alturas.slice());
  ok(alturas.length >= 1 && alturas.every(h => h >= 520 && h <= 760), 'omni.ui.resize ao abrir: ' + alturas);
  await ir('DEMO-003'); const nAntes = await b.avaliar(() => bancada.alturas.length);
  await clicarJs('[data-codigo="DEMO-003"] [data-abrir]'); await b.esperar(() => document.querySelectorAll('.cp-celula').length > 0); await pausa(300);
  const n1 = await b.avaliar(() => bancada.alturas.length); await pausa(600);
  eq(await b.avaliar(() => bancada.alturas.length), n1, 'sem laço de resize');
  ok(await b.avaliar(() => { const c = document.getElementById('cp-corpo'); return c.clientHeight >= 160 && c.scrollHeight > c.clientHeight && getComputedStyle(c).overflowY === 'auto'; }), 'detalhe rola por dentro e não colapsa');
  await clicarJs('#cp-voltar');
  await b.preencher('#cp-q', ''); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
  ok(await b.avaliar(() => { const c = document.getElementById('cp-rolagem'); return c.clientHeight >= 160 && c.scrollHeight > c.clientHeight && getComputedStyle(c).overflowY === 'auto'; }), 'lista rola por dentro e não colapsa');
  // Campos internos no formato do portal.
  await ir('DEMO-003');
  await clicarJs('[data-codigo="DEMO-003"] [data-abrir]'); await b.esperar(() => document.querySelectorAll('.cp-celula').length > 0);
  ok(/Taxa interna/.test(await txt('#cp-corpo')) && /R\$ 123,45\/mês/.test(await txt('#cp-corpo')), 'rótulo e texto do campo interno');
  eq(await txt('.cp-obs'), 'Cobrada junto ao condomínio', 'observação como linha secundária');
  ok(await b.avaliar(() => [...document.querySelectorAll('.cp-campo')].some(c => /Observação interna/.test(c.textContent) && /zelador/.test(c.textContent))), 'campo só com texto');
  // Cache do detalhe: 3 minutos.
  const lerDetalhe = () => portal.log.filter(l => l.rota === '/imovel/DEMO-003').length;
  const l0 = lerDetalhe();
  await clicarJs('#cp-voltar'); await clicarJs('[data-codigo="DEMO-003"] [data-abrir]'); await b.esperar(() => document.querySelectorAll('.cp-celula').length > 0);
  eq(lerDetalhe(), l0, 'dentro dos 3 min usa o cache');
  await clicarJs('#cp-voltar'); await b.avaliar(() => { const d = Date.now; window.__dn = d; Date.now = () => d() + 181000; });
  await clicarJs('[data-codigo="DEMO-003"] [data-abrir]'); await b.esperar(() => document.querySelectorAll('.cp-celula').length > 0);
  eq(lerDetalhe(), l0 + 1, 'depois de 3 min busca de novo');
  await b.avaliar(() => { Date.now = window.__dn; });
  // Destino do envio e troca de conversa.
  await abrir(); await ir('DEMO-001');
  eq(await txt('#cp-destino'), 'Enviar para: Locatário Demonstração Um', 'destino mostrado');
  await b.avaliar(() => { bancada.atrasoSelecao = 2500; bancada.selecionarChat(8802); });
  const mT = await msgs();
  await clicarJs('[data-codigo="DEMO-001"] [data-enviar-card]');
  await b.esperar(() => /Aguarde: trocando de conversa…/.test(document.getElementById('cp-recado').textContent));
  eq(await msgs(), mT, 'nada vai ao chat antigo durante a troca');
  eq(await txt('#cp-destino'), 'Enviar para: Locatário Demonstração Dois', 'destino segue o evento');
  eq(await txt('#cp-dica-envio'), 'Aguarde: trocando de conversa…');
  await b.esperar(() => document.getElementById('cp-dica-envio').textContent === '');
  await b.avaliar(() => { bancada.atrasoSelecao = 0; });
  await clicarJs('[data-codigo="DEMO-001"] [data-enviar-card]'); await b.esperar(n => bancada.mensagens.length === n + 1, mT);
  eq(await b.avaliar(() => bancada.mensagens.at(-1).chatId), 8802, 'depois de assentar, vai ao chat novo');
  // Troca de conversa durante o upload do /card: cancela.
  await atrasarPortal(); const mU = await msgs();
  await clicarJs('[data-codigo="DEMO-001"] [data-enviar-card]'); await pausa(150);
  await b.avaliar(() => bancada.selecionarChat(8803));
  await b.esperar(() => /A conversa mudou; envio cancelado/.test(document.getElementById('cp-recado').textContent));
  eq(await msgs(), mU, 'card cancelado'); ok(await b.avaliar(() => [...document.querySelectorAll('[data-envio]')].every(x => !x.disabled)), 'trava liberada');
  // Troca durante o upload de /fotos: cancela antes da 1ª foto.
  await b.avaliar(() => bancada.selecionarChat(8801)); await pausa(100);
  await ir('DEMO-002'); await clicarJs('[data-codigo="DEMO-002"] [data-abrir]'); await b.esperar(() => document.querySelectorAll('.cp-celula').length > 0);
  await clicarJs('[data-sel="0"]'); await clicarJs('[data-sel="1"]'); const mF = await msgs();
  await clicarJs('[data-enviar-selecionadas]'); await pausa(150); await b.avaliar(() => bancada.selecionarChat(8802));
  await b.esperar(() => /A conversa mudou; envio cancelado/.test(document.getElementById('cp-recado-d').textContent));
  eq(await msgs(), mF, 'fotos canceladas');
  // Trava global: duplo clique envia uma vez só e trava todos os botões de envio enquanto dura.
  await b.avaliar(() => bancada.selecionarChat(8801)); await pausa(100);
  const mD = await msgs();
  const durante = await b.avaliar(() => { const a = document.querySelector('#cp-corpo [data-enviar-card]'); a.click(); a.click(); document.querySelector('[data-enviar-todas]').click(); return [...document.querySelectorAll('[data-envio]')].every(x => x.disabled); });
  ok(durante, 'todos os botões de envio travados durante o envio');
  await b.esperar(() => /Enviado ✓/.test(document.querySelector('#cp-corpo [data-enviar-card]').textContent)); await pausa(200);
  eq(await msgs(), mD + 1, 'duplo clique envia uma vez');
  // Busca que falha limpa a lista e oferece nova tentativa.
  await abrir();
  portal.falharBusca = 1; await b.preencher('#cp-q', 'sintético 3'); await b.esperar(() => !document.getElementById('cp-erro').hidden);
  eq(await cartoes(), 0, 'lista antiga some'); eq(await txt('#cp-contagem'), 'sem resultado');
  ok(await b.avaliar(() => document.getElementById('cp-mais').hidden && document.getElementById('cp-vazio').hidden), 'sem Carregar mais nem "vazio"');
  eq(await txt('#cp-tentar'), 'Tentar de novo');
  await clicarJs('#cp-tentar'); await b.esperar(() => document.querySelectorAll('.cp-card').length > 0); ok(await b.avaliar(() => document.getElementById('cp-erro').hidden), 'erro some ao acertar');
  // Carregar mais usa os filtros da lista atual, não os digitados depois.
  await b.preencher('#cp-q', ''); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
  await b.preencher('#cp-q', 'sintético'); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
  await b.avaliar(() => { const q = document.getElementById('cp-q'); q.value = 'zzzz'; q.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('cp-mais').click(); });
  await b.esperar(() => document.querySelectorAll('.cp-card').length >= 40 || document.querySelectorAll('.cp-card').length === 0);
  const ult = portal.log.filter(l => l.rota === '/busca').at(-1)?.q;
  ok(ult && ult.texto === 'sintético' && ult.pagina === '2', 'página 2 com o texto da lista atual: ' + JSON.stringify(ult));
  await pausa(450);
  // Página vazia com total maior esconde Carregar mais.
  portal.paginaVazia = true; await b.preencher('#cp-q', ''); await pausa(450); await b.esperar(() => document.querySelectorAll('.cp-card').length === 20);
  await clicarJs('#cp-mais'); await b.esperar(() => document.getElementById('cp-mais').hidden); eq(await cartoes(), 20, 'sem duplicar'); portal.paginaVazia = false;
  // /busca/opcoes falhou: avisa e tenta de novo ao abrir o filtro.
  portal.falharOpcoes = 1; await abrir();
  ok(/cidade e bairro/.test(await txt('#cp-recado')), 'aviso discreto'); eq(await b.avaliar(() => document.getElementById('cp-cidade').options.length), 1);
  await b.avaliar(() => document.getElementById('cp-cidade').dispatchEvent(new Event('focus')));
  await b.esperar(() => document.getElementById('cp-cidade').options.length === 3);
  // Larguras extremas sem rolagem horizontal.
  for (const l of [320, 600]) { await b.viewport(l, 640); await pausa(100); ok(await semRolagemHorizontal(), 'sem rolagem horizontal em ' + l); }
  await b.viewport(360, 720);
  // Envio desligado nas configurações.
  await abrir('?semenvio=1');
  eq(await txt('#cp-dica-envio'), 'Envio desligado nas Configurações da extensão');
  ok(await b.avaliar(() => [...document.querySelectorAll('[data-envio]')].every(x => x.disabled && x.title === 'Envio desligado nas Configurações da extensão')));
  const m5 = await msgs(); await b.avaliar(() => document.querySelector('[data-enviar-card]').click()); await pausa(150); eq(await msgs(), m5);
  // Tema escuro.
  await abrir('?tema=escuro');
  eq(await b.avaliar(() => getComputedStyle(document.body).backgroundColor), 'rgb(23, 25, 29)', 'fundo escuro do host');
  await foto('lista-escuro-360');
  // Sem permissão ver_imoveis.
  await b.navegar(origem + '/app/cockpit.html?usuario=9990'); await b.esperar(() => !!document.getElementById('gi-sem-acesso'));
  eq(await b.avaliar(() => document.querySelectorAll('.cp-card').length), 0);
  // Sem portal (modo local).
  await b.navegar(origem + '/app/cockpit.html?modo=local'); await b.esperar(() => !document.getElementById('cp-estado').hidden);
  ok(/precisa do portal/.test(await txt('#cp-estado')));
  eq(b.erros, []);
  process.stdout.write('PASS cockpit: ' + passes + ' verificações em 360 e 480 px, 320 e 600 sem rolagem horizontal; FAIL 0\n');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
