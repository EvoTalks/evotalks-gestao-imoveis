import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function carregar(extra = {}) {
  const window = { GI: {} };
  const sandbox = { window, GI: window.GI, Uint8Array, Blob, Promise, ...extra };
  vm.runInNewContext(readFileSync(new URL('../app/fotos.js', import.meta.url), 'utf8'), sandbox);
  return window.GI.fotos;
}
const plain = v => JSON.parse(JSON.stringify(v));
test('dimensões limitam a 1600/1280 sem ampliar e recusam dimensões inválidas', () => {
  const f = carregar();
  assert.deepEqual(plain(f.dimensoes(3200, 1800, 1600)), { largura: 1600, altura: 900 });
  assert.deepEqual(plain(f.dimensoes(900, 3200, 1280)), { largura: 360, altura: 1280 });
  assert.deepEqual(plain(f.dimensoes(30, 20, 1600)), { largura: 30, altura: 20 });
  assert.throws(() => f.dimensoes(0, 100), /decodificar/);
});
test('nome seguro e tamanho legível sem HTML', () => {
  const f = carregar();
  assert.equal(f.nomeSeguro(''), 'foto');
  assert.equal(f.nomeSeguro('<img src=x onerror="x">/\\\u0000.png'), '_img src=x onerror=_x_____.png');
  assert.equal(f.nomeSeguro('x'.repeat(140)).length, 120);
  assert.equal(f.tamanho(1024), '1,0 KB');
  assert.equal(f.tamanho(1572864), '1,5 MB');
});
test('bytes iniciais identificam só os quatro tipos e recusam SVG disfarçado', () => {
  const f = carregar();
  for (const [tipo, bytes] of [
    ['image/jpeg', [255,216,255]], ['image/png', [137,80,78,71]],
    ['image/gif', Array.from(Buffer.from('GIF89a'))], ['image/gif', Array.from(Buffer.from('GIF87a'))],
    ['image/webp', Array.from(Buffer.from('RIFF1234WEBP'))]
  ]) assert.equal(f.tipoBytes(new Uint8Array(bytes)), tipo);
  assert.equal(f.tipoBytes(new Uint8Array(Buffer.from('<svg/>'))), null);
});
test('recusa tipo divergente, SVG e mais de 25 MB antes de decodificar; não perde os demais', async () => {
  let decodificou = 0;
  const f = carregar({ createImageBitmap: async () => { decodificou++; throw Error('inválida'); } });
  const svg = new Blob(['<svg/>'], { type: 'image/png' });
  const gigante = { name: 'grande.png', size: 25 * 1024 * 1024 + 1, type: 'image/png' };
  await assert.rejects(f.processar(svg), /bytes|conteúdo/);
  await assert.rejects(f.processar(gigante), /25 MB/);
  const tipoErrado = new Blob([new Uint8Array([255,216,255])], { type: 'image/png' });
  await assert.rejects(f.processar(tipoErrado), /tipo|conteúdo/);
  assert.equal(decodificou, 0);
  await assert.rejects(f.processar(new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' })), /decodificar/);
});
test('JPEG 0,82, depois 0,7 e 1280; fundo branco, sem prefixo e libera bitmap', async () => {
  const tentativas = [], desenhos = [], fundos = []; let fechou = 0;
  const f = carregar({ createImageBitmap: async () => ({ width: 3200, height: 1800, close() { fechou++; } }),
    FileReader: class { readAsDataURL(blob) { this.result = 'data:image/jpeg;base64,/9j/'; this.onload(); } },
    document: { createElement() { return { getContext() { return { set fillStyle(v) { fundos.push(v); }, fillRect() {}, drawImage(...a) { desenhos.push(a.slice(3)); } }; },
      toBlob(cb, tipo, qualidade) { tentativas.push([this.width, this.height, tipo, qualidade]); cb(new Blob([new Uint8Array(tentativas.length < 3 ? 1600000 : 30)])); } }; } } });
  const r = await f.processar(Object.assign(new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' }), { name: 'sintetica.png' }));
  assert.deepEqual(tentativas, [[1600,900,'image/jpeg',0.82], [1600,900,'image/jpeg',0.7], [1280,720,'image/jpeg',0.7]]);
  assert.equal(r.dados_base64, '/9j/'); assert.equal(r.mimetype, 'image/jpeg'); assert.equal(r.tamanho, 30);
  assert.equal(r.previa, 'data:image/jpeg;base64,/9j/'); assert.ok(fundos.every(c => c === '#fff')); assert.equal(fechou, 1);
});
test('imagem ainda grande após as três tentativas é recusada', async () => {
  const f = carregar({ createImageBitmap: async () => ({ width: 10, height: 10, close() {} }),
    document: { createElement() { return { getContext() { return { fillRect() {}, drawImage() {} }; }, toBlob(cb) { cb(new Blob([new Uint8Array(1600000)])); } }; } } });
  await assert.rejects(f.processar(new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' })), /1,5 MB/);
});
test('fallback Image revoga object URL também quando o decoder recusa a imagem', async () => {
  const revogadas = [];
  const f = carregar({ URL: { createObjectURL() { return 'blob:sintetico'; }, revokeObjectURL(u) { revogadas.push(u); } },
    Image: class { set src(v) { this.onerror(); } } });
  await assert.rejects(f.processar(new Blob([new Uint8Array([255,216,255])], { type: 'image/jpeg' })), /decodificar/);
  assert.deepEqual(revogadas, ['blob:sintetico']);
});
