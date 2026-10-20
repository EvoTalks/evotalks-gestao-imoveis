import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function carregar() {
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), { window, document: {}, URL, setTimeout });
  return window.GI;
}
test('capas codificam os códigos e em modo local não consultam o portal', async () => {
  const GI = carregar();
  GI.chamarPortal = async () => { throw new Error('Não deveria consultar'); };
  assert.equal(Object.keys(await GI.capasImoveis(['A'])).length, 0);
  GI.modo = 'portal';
  GI.chamarPortal = async rota => { assert.equal(rota, '/imoveis/capas?codigos=A%26B%2CC'); return { capas: { C: null } }; };
  assert.equal((await GI.capasImoveis(['A&B', 'C'])).C, null);
});
test('situação deriva do acesso a Imóveis mesmo quando chave legada contradiz', async () => {
  for (const ver of [true, false]) {
    const GI = carregar(); GI.modo = 'portal';
    GI.chamarPortal = async () => ({ permissoes: { ver_imoveis: ver, mudar_situacao: !ver }, padrao: {} });
    await GI.permissoes();
    assert.equal(GI.pode('mudar_situacao'), ver);
  }
  const config = readFileSync('app/config.html', 'utf8');
  assert.doesNotMatch(config, /Mudar situação|mudar_situacao/);
});
