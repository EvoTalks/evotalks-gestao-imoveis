import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const capas = { 'DEMO-002': 'javascript:alert(1)' };
const s = criarServidor({ capas });
await new Promise(r => s.listen(0, '127.0.0.1', r));
capas['DEMO-001'] = 'http://127.0.0.1:' + s.address().port + '/app/icone-casa.svg';
let b;
try {
  b = await abrirChromium();
  await b.navegar('http://127.0.0.1:' + s.address().port + '/app/imoveis.html?perfil=admin');
  await b.esperar(() => document.querySelectorAll('.gi-capa').length === 3);
  await b.esperar(() => bancada.chamadas.some(c => c.caminho.startsWith('/api/ext/imoveis/capas?')));
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.startsWith('/api/ext/imoveis/capas?')).length), 1);
  assert.equal(await b.avaliar(() => document.querySelector('[data-detalhe="DEMO-002"].gi-capa img')), null);
  assert.equal(await b.avaliar(() => document.querySelector('[data-detalhe="DEMO-003"].gi-capa img')), null);
  await b.esperar(() => !!document.querySelector('.gi-capa img'));
  assert.equal(await b.avaliar(() => document.querySelector('.gi-capa img').getAttribute('loading')), 'lazy');
  await b.avaliar(() => {
    var buscar = GI.buscarImoveis;
    GI.buscarImoveis = function (op) { return buscar(op).then(function (r) { r.itens[0].name = '\"/><img onerror=window.__capaXss=1>'; return r; }); };
  });
  await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('.gi-capa img') && document.querySelector('.gi-capa img').alt.includes('onerror'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo img[onerror]').length), 0);
  assert.equal(await b.avaliar(() => !!window.__capaXss), false);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.startsWith('/api/ext/imoveis/capas?')).length), 1);
  await b.avaliar(() => document.querySelector('.gi-capa img').dispatchEvent(new Event('error')));
  assert.equal(await b.avaliar(() => document.querySelector('.gi-capa img')), null);
  await b.clicar('.gi-capa');
  await b.esperar(() => !!document.querySelector('.gi-modal'));
  await b.avaliar(() => {
    var buscar = GI.buscarImoveis;
    GI.buscarImoveis = function (op) { return buscar(op).then(function (r) { r.itens.forEach(function (p) { p.internalcode += '-novo'; }); return r; }); };
    GI.capasImoveis = function () { window.__falhaCapas = true; return Promise.reject(new Error('Falha sintética')); };
  });
  await b.clicar('#b-buscar');
  await b.esperar(() => !!window.__falhaCapas && document.querySelectorAll('.gi-capa').length === 3);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo .gi-capa img').length), 0);
  assert.equal(await b.avaliar(() => document.querySelector('#gi-erro').textContent), '');
  process.stdout.write('PASS capas: miniaturas clicáveis, placeholders, erro da imagem, URL não-http, escape do alt e cache por código; FAIL 0\n');
} finally { if (b) await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
