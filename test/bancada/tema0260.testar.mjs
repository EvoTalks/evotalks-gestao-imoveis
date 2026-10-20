/* N3: estilos computados com os tokens medidos do host; sem rede externa. */
import assert from 'node:assert/strict';
import { PERMISSOES_PADRAO } from './portal-permissoes.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const antes = process.argv.includes('--capturar-antes');
const pasta = new URL('../fidelidade/saida/capturas-0261/', import.meta.url);
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
const servidor = criarServidor({ permissoes: { 9999: { ...PERMISSOES_PADRAO, ver_configuracoes: true } } });
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
const linhas = [], falhas = [];
// Cada par vem do DOM renderizado, incluindo texto de descendentes e fundos alpha.
function medir() {
  const cor = s => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255];
  };
  const sobre = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])).concat(1);
  const fundo = el => el ? sobre(cor(getComputedStyle(el).backgroundColor), fundo(el.parentElement)) : [255, 255, 255, 1];
  const lum = c => c.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const razao = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  const raizes = [...document.querySelectorAll('.gi-cockpit, #gi-os, body:has(#gi-os) > .gi-modal-fundo')];
  const controles = [...new Set(raizes.flatMap(r => [...r.querySelectorAll('button, [role="button"], [role="tab"], summary[aria-label], .chip, .gi-chip, .pill, .opt, .gi-cp-pill')]))];
  return controles.filter(el => {
    const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden';
  }).map(el => {
    const s = getComputedStyle(el), textos = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t; while ((t = w.nextNode())) if (t.textContent.trim()) {
      const p = t.parentElement, r = document.createRange(); r.selectNodeContents(t);
      if (!r.getBoundingClientRect().width) continue;
      const ps = getComputedStyle(p), bg = fundo(p);
      textos.push({ texto: t.textContent.trim().slice(0, 45), contraste: razao(sobre(cor(ps.color), bg), bg), tamanho: parseFloat(ps.fontSize) });
    }
    return { compacto: el.matches('#cp-resumo [data-resumo], .pc__link, .pill, .gi-cp-pill'), acao: el.matches('.btn, .btn-primario, .btn-sucesso, .btn-perigo, .btn-perigo-forte, .btn-icone, .gi-modal-x, summary[aria-label], [role=tab], .seg button, .gi-cp-chips button, .chip, .opt, .gi-modal-rodape button'), id: el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 35), textos,
      contraste: razao(sobre(cor(s.color), fundo(el)), fundo(el)), tamanho: parseFloat(s.fontSize),
      peso: s.fontWeight, familia: s.fontFamily, caixa: s.textTransform, espaco: s.letterSpacing, raio: s.borderRadius,
      fundo: s.backgroundColor, cor: s.color, borda: s.borderTopColor, altura: el.getBoundingClientRect().height,
      desabilitado: el.disabled, opacidade: s.opacity, cursor: s.cursor };
  });
}
async function provar(nome, captura = false) {
  const controles = await b.avaliar(medir);
  assert.ok(controles.length, nome + ': controles renderizados');
  for (const c of controles) {
    for (const t of c.textos.length ? c.textos : [{ contraste: c.contraste, tamanho: c.tamanho, texto: c.id }]) {
      if (t.contraste < 4.5) falhas.push(nome + ' / ' + c.id + ': contraste ' + t.contraste.toFixed(2) + ':1 (' + t.texto + ')');
      if ((c.acao || c.compacto) && (t.tamanho < (c.acao ? 13 : 12) || t.tamanho > (c.acao ? 14 : 13))) falhas.push(nome + ' / ' + c.id + ': fonte ' + t.tamanho + 'px');
    }
    if (c.caixa !== 'none') falhas.push(nome + ' / ' + c.id + ': text-transform ' + c.caixa);
    if (c.acao && c.altura < 32) falhas.push(nome + ' / ' + c.id + ': alvo ' + c.altura + 'px');
    if (c.acao && !['500', '600'].includes(c.peso)) falhas.push(nome + ' / ' + c.id + ': peso ' + c.peso);
    if (!c.familia.includes('Roboto') || c.espaco !== 'normal' || c.acao && c.raio !== '4px') falhas.push(nome + ' / ' + c.id + ': tipografia/raio fora dos tokens');
  }
  linhas.push({ estado: nome, controles });
  if (!antes) {
    const cobertos = await b.avaliar(() => [...document.querySelectorAll('.cp-confirm-extra > summary, .cp-result-extra > summary')].filter(el => {
      const titulo = document.querySelector(el.parentElement.classList.contains('cp-confirm-extra') ? '#cp-confirmacao-titulo' : '#cp-sucesso h2');
      const texto = document.createRange(); texto.selectNodeContents(titulo);
      const a = texto.getBoundingClientRect(), c = el.getBoundingClientRect();
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    }).length);
    assert.equal(cobertos, 0, nome + ': Mais ações não cobre o título');
  }
  if (captura) {
    const { data } = await b.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(new URL('x5-' + (antes ? 'antes-' : 'depois-') + nome + '.png', pasta), Buffer.from(data, 'base64'));
  }
}
// X5: só ações recebem caixa de botão; textos e selos continuam compactos.
async function compactos(nome) {
  const medidas = await b.avaliar(() => {
    const visiveis = s => [...document.querySelectorAll(s)].filter(el => el.getBoundingClientRect().width);
    return visiveis('#cp-resumo [data-resumo], .pc__link, .pill, .gi-cp-pill').map(el => {
      const s = getComputedStyle(el);
      return { texto: el.textContent.trim(), resumo: el.matches('#cp-resumo [data-resumo]'), link: el.matches('.pc__link'),
        altura: el.getBoundingClientRect().height, borda: parseFloat(s.borderTopWidth), display: s.display,
        sublinhado: s.textDecorationLine.includes('underline'), peso: s.fontWeight, selecionado: el.getAttribute('aria-pressed') === 'true' };
    });
  });
  assert.ok(medidas.length, nome + ': textos compactos presentes');
  for (const m of medidas) {
    if (m.altura > (m.resumo ? 26 : 28)) falhas.push(nome + ' / ' + m.texto + ': compacto com altura ' + m.altura + 'px');
    if ((m.resumo || m.link) && m.borda !== 0) falhas.push(nome + ' / ' + m.texto + ': texto com borda ' + m.borda + 'px');
    if (m.resumo && m.display !== 'inline') falhas.push(nome + ' / ' + m.texto + ': resumo deve ser inline');
    if (m.link && !m.sublinhado) falhas.push(nome + ' / ' + m.texto + ': link sem sublinhado');
    if (m.resumo && m.selecionado && (m.peso !== '600' || !m.sublinhado)) falhas.push(nome + ': resumo selecionado sem peso/sublinhado');
  }
}
async function cabecalhoCompacto(tema) {
  const m = await b.avaliar(() => {
    const link = document.querySelector('link[href*="controles-atendimento.css"]');
    const atual = document.querySelector('#cp-cabecalho').getBoundingClientRect().height;
    link.sheet.disabled = true;
    const semControles = document.querySelector('#cp-cabecalho').getBoundingClientRect().height;
    link.sheet.disabled = false;
    return { atual, semControles };
  });
  process.stdout.write('X5 cabeçalho ' + tema + ': ' + m.atual + 'px / sem controles ' + m.semControles + 'px\n');
  if (m.atual > 1.15 * m.semControles) falhas.push('cabeçalho ' + tema + ': ' + m.atual + 'px > 1,15 × ' + m.semControles + 'px');
}
async function interacoes(tema, seletor, tela) {
  const bg = () => b.avaliar(s => getComputedStyle(document.querySelector(s)).backgroundColor, seletor);
  const [normal, hover, ativo] = tema === 'claro' ? ['rgb(42, 46, 48)', 'rgb(56, 62, 64)', 'rgb(28, 30, 32)'] : ['rgb(229, 231, 235)', 'rgb(243, 244, 246)', 'rgb(209, 213, 219)'];
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  assert.equal(await bg(), normal, tela + ': primário usa token do host');
  const p = await b.avaliar(s => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, seletor);
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  assert.equal(await bg(), hover, tela + ': hover usa primary-light');
  await provar(tela + '-hover-' + tema);
  await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...p });
  assert.equal(await bg(), ativo, tela + ': ativo usa primary-dark');
  await provar(tela + '-ativo-' + tema);
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0, buttons: 1 });
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: 0, y: 0 });
  await b.avaliar(s => document.querySelector(s).blur(), seletor);
  await b.tecla('Tab');
  await b.avaliar(s => document.querySelector(s).focus(), seletor);
  const foco = await b.avaliar(s => { const el = document.querySelector(s), st = getComputedStyle(el); return [el.matches(':focus-visible'), st.outlineWidth, st.outlineColor]; }, seletor);
  assert.deepEqual(foco, [true, '2px', tema === 'claro' ? 'rgb(41, 189, 255)' : 'rgb(112, 211, 255)'], tela + ': foco de teclado visível');
  await b.avaliar(s => { document.querySelector(s).disabled = true; }, seletor);
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  assert.deepEqual(await b.avaliar(s => { const st = getComputedStyle(document.querySelector(s)); return [st.opacity, st.cursor]; }, seletor), ['0.55', 'not-allowed'], tela + ': desabilitado mesmo sob o mouse');
  await provar(tela + '-desabilitado-' + tema);
  await b.avaliar(s => { document.querySelector(s).disabled = false; document.querySelector(s).blur(); }, seletor);
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
}
try {
  b = await abrirChromium();
  for (const tema of ['claro', 'escuro']) {
    await b.viewport(315, 1100);
    await b.navegar(origem + '/app/painel.html?escrita=1&demonstracao=1&tema=' + tema);
    await b.esperar(() => !!document.querySelector('#cp-resumo [data-resumo]'));
    await cabecalhoCompacto('demo-' + tema);
    await b.clicar('#cp-resumo [data-resumo=abertos]');
    await compactos('demo-selecionado-' + tema);
    await b.navegar(origem + '/app/painel.html?escrita=1&tema=' + tema);
    await b.esperar(() => !!document.querySelector('[data-gestao]'));
    await compactos('chamados-' + tema);
    await cabecalhoCompacto(tema);
    await provar('cockpit-chamados-' + tema, true);
    await b.avaliar(() => { document.querySelector('details[data-os-id]').open = true; });
    await provar('cockpit-cartao-' + tema, true);
    if (!antes) {
      for (const largura of [260, 300, 334]) {
        await b.viewport(largura, 1100);
        const cortes = await b.avaliar(() => [...document.querySelectorAll('[role=tab]')].filter(el => el.scrollWidth > el.clientWidth).map(el => el.id));
        assert.deepEqual(cortes, [], 'abas legíveis sem cortar texto em ' + largura + 'px');
      }
      await b.viewport(315, 1100);
      await interacoes(tema, '[data-gestao]', 'cockpit');
      const icones = await b.avaliar(() => [...document.querySelectorAll('.btn--icon')].filter(el => el.getBoundingClientRect().width).map(el => { const st = getComputedStyle(el), r = el.getBoundingClientRect(); return [st.backgroundColor, st.color, r.width, r.height]; }));
      assert.ok(icones.length);
      for (const c of icones) assert.deepEqual(c, tema === 'claro' ? ['rgb(255, 255, 255)', 'rgb(30, 30, 30)', 32, 32] : ['rgb(23, 25, 29)', 'rgb(240, 242, 244)', 32, 32], 'ícones são secundários 32×32');
    }
    await b.clicar('[data-editar-os]'); await b.esperar(() => !!document.querySelector('#cp-edit-form'));
    await provar('cockpit-editar-' + tema, true);
    await b.clicar('#cp-edit-cancelar'); await b.esperar(() => !document.querySelector('#cp-edit-form'));
    await b.clicar('#cp-tab-imovel'); await b.esperar(() => document.querySelector('#cp-tab-imovel').getAttribute('aria-selected') === 'true');
    await provar('cockpit-imovel-' + tema, true);
    await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => !!document.querySelector('#cp-titulo'));
    await b.clicar('[data-categoria="eletrica"]');
    await compactos('novo-' + tema);
    await provar('cockpit-novo-' + tema, true);
    await b.preencher('#cp-titulo', 'Cano quebrado na cozinha');
    await b.clicar('#cp-revisar'); await b.esperar(() => !!document.querySelector('#cp-confirmar'));
    await provar('cockpit-confirma-' + tema, true);
    await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    await provar('cockpit-sucesso-' + tema, true);
    await b.viewport(1366, 900);
    await b.navegar(origem + '/app/os.html?tema=' + tema);
    await b.esperar(() => !!document.querySelector('[data-os]'));
    await provar('gestao-lista-' + tema, true);
    for (const altura of [900, 720]) {
      await b.viewport(1366, altura);
      await b.navegar(origem + '/app/os.html?chamado=1&targetchat=8802&tema=' + tema);
      await b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-status').disabled);
      await provar('gestao-editar-' + altura + '-' + tema, true);
      if (!antes && altura === 900) await interacoes(tema, '[data-ok]', 'gestao');
      await b.avaliar(() => { document.querySelector('#c-mais').open = true; });
      await provar('gestao-mais-' + altura + '-' + tema);
      if (altura === 720) {
        await b.avaliar(() => { GI.criarChamadoForm({}).cancelar({ id: 1, numero: 1001 }); });
        await b.esperar(() => !!document.querySelector('body > .gi-modal-fundo'));
        await provar('gestao-modal-' + tema, true);
      }
    }
    if (!antes) {
      // Mesmo carregando a folha, a Gestão de página inteira conserva seu CSS.
      await b.navegar(origem + '/app/chamados.html?tema=' + tema);
      await b.esperar(() => !!document.querySelector('[data-editar]'));
      const estilos = () => [...document.querySelectorAll('button, input, select')].map(el => getComputedStyle(el).cssText + ['color','backgroundColor','fontFamily','fontSize','padding','border','borderRadius','minHeight'].map(p => getComputedStyle(el)[p]).join(';'));
      const original = await b.avaliar(estilos);
      await b.avaliar(async () => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'controles-atendimento.css'; document.head.append(l); await new Promise(r => { l.onload = r; }); });
      assert.deepEqual(await b.avaliar(estilos), original, 'CSS dos controles não vaza para Chamados');
    }
  }
  await writeFile(new URL('x5-' + (antes ? 'antes' : 'depois') + '-contraste.json', pasta), JSON.stringify({ linhas, falhas }, null, 2));
  process.stdout.write((antes ? 'ANTES' : 'X5') + ': ' + linhas.length + ' estados, ' + linhas.reduce((n, l) => n + l.controles.length, 0) + ' controles; ' + falhas.length + ' violações.\n');
  if (!antes || process.argv.includes('--exigir')) assert.deepEqual(falhas, [], falhas.slice(0, 18).join('\n'));
  assert.deepEqual(b.erros, []);
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
