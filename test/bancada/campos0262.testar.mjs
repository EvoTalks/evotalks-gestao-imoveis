/* N3: estilos computados com os tokens medidos do host; sem rede externa. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const antes = process.argv.includes('--capturar-antes');
const pasta = new URL('../fidelidade/saida/capturas-0262/', import.meta.url);
await mkdir(pasta, { recursive: true });
// Tema claro medido na instância; escuro do host.js da bancada do time.
function aplicarTokens() {
  const escuro = new URLSearchParams(location.search).get('tema') === 'escuro';
  const tokens = {
    primary: escuro ? '#e5e7eb' : '#2A2E30', 'primary-light': escuro ? '#f3f4f6' : '#383e40',
    'primary-dark': escuro ? '#d1d5db' : '#1c1e20', 'on-primary': escuro ? '#1c1e20' : '#FFF',
    'primary-soft': escuro ? 'rgba(229,231,235,.1)' : 'rgba(42,46,48,.1)',
    accent: '#d4d5d5', header: '#2A2E30', 'on-header': '#FFF', alert: escuro ? '#ff80a6' : '#FF3C78',
    bg: escuro ? '#17191d' : '#ffffff', surface: escuro ? '#24272e' : '#f5f5f5',
    border: escuro ? '#4e5665' : '#d2d2d2', text: escuro ? '#f0f2f4' : '#1e1e1e',
    'text-muted': escuro ? '#b4bdc9' : '#565656', error: escuro ? '#ff8b8b' : '#ff3b3b',
    warning: escuro ? '#ffab8f' : '#ff784b', success: escuro ? '#62ce9b' : '#06c270', info: escuro ? '#70d3ff' : '#29bdff'
  };
  const vars = Object.fromEntries(Object.entries(tokens).map(([k, v]) => ['--ext-color-' + k, v]));
  if (escuro) vars['--ext-color-surface-alt'] = '#30343d';
  Object.assign(vars, { '--ext-radius': '4px', '--ext-font-family': 'Roboto, "Helvetica Neue", Arial, sans-serif', '--ext-font-size': '14px', '--ext-spacing': '8px' });
  const ready = omni.ready;
  omni.ready = function (fn) { return ready(function (c) { c.theme.tokens = vars; fn(c); }); };
}
const servidor = criarServidor();
servidor.prependListener('request', (req, res) => {
  if (!req.url.startsWith('/app/') || !req.url.includes('.html')) return;
  const end = res.end;
  res.end = function (data, ...args) {
    if (typeof data === 'string' || Buffer.isBuffer(data)) data = data.toString().replace(/<script src="comum.js(?:\?v=[^"]+)?">/, '<script>(' + aplicarTokens.toString() + ')();</script>$&');
    return end.call(this, data, ...args);
  };
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
// 0.26.2: todo campo de digitar fica branco com texto preto, também no tema escuro.
const falhas = [];
async function campos(nome) {
  const lista = await b.avaliar(() => {
    const sel = 'input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=button],[type=submit],[type=reset],[type=image],[type=hidden]),select:not(.gi-status-select),#c-status,textarea,.inp';
    return [...document.querySelectorAll(sel)].filter(el => el.getBoundingClientRect().width).map(el => {
      const s = getComputedStyle(el), dentro = el.closest('.gi-campo-caixa, #c-valor-caixa'), caixa = el.closest('.gi-campo-caixa, #c-valor-caixa');
      const fundo = s.backgroundColor === 'rgba(0, 0, 0, 0)' && caixa ? getComputedStyle(caixa).backgroundColor : s.backgroundColor;
      return { id: el.id || el.name || el.className || el.tagName, fundo, cor: s.color, desabilitado: el.matches(':disabled'), bordaVisivel: !!dentro && s.borderTopWidth !== '0px' && s.borderTopColor !== 'rgba(0, 0, 0, 0)' };
    });
  });
  assert.ok(lista.length, nome + ': campos renderizados');
  for (const c of lista) {
    const fundoOk = c.desabilitado ? c.fundo === 'rgb(242, 242, 242)' : c.fundo === 'rgb(255, 255, 255)';
    const corOk = c.desabilitado ? c.cor === 'rgb(85, 85, 85)' : c.cor === 'rgb(0, 0, 0)';
    if (c.bordaVisivel) falhas.push(nome + ' / ' + c.id + ': borda dentro da caixa');
    if (!fundoOk || !corOk) falhas.push(nome + ' / ' + c.id + ': fundo ' + c.fundo + ', texto ' + c.cor);
  }
  const { data } = await b.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(nome + '.png', pasta), Buffer.from(data, 'base64'));
  return lista.length;
}
try {
  b = await abrirChromium();
  const total = {};
  for (const tema of ['claro', 'escuro']) {
    await b.viewport(315, 1100);
    await b.navegar(origem + '/app/painel.html?escrita=1&tema=' + tema);
    await b.esperar(() => !!document.querySelector('[data-gestao]'));
    await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => !!document.querySelector('#cp-titulo'));
    total['cockpit-novo-' + tema] = await campos('cockpit-novo-' + tema);
    await b.viewport(1280, 900);
    await b.navegar(origem + '/app/os.html?chamado=1&targetchat=8802&tema=' + tema);
    await b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-status').disabled);
    total['os-' + tema] = await campos('os-' + tema);
    for (const tela of ['chamados', 'imoveis',  'prestadores']) {
      await b.navegar(origem + '/app/' + tela + '.html?tema=' + tema);
      await b.esperar(() => document.readyState === 'complete' && !!document.querySelector('input, select, textarea'));
      total[tela + '-' + tema] = await campos(tela + '-' + tema);
    }
  }
  console.log(JSON.stringify(total));
  assert.deepEqual(falhas, []);
  console.log('ok: campos brancos com texto preto nos temas claro e escuro');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
