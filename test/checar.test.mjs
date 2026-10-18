import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
test('verificador detecta erro em JS e inline; ignora src e scripts de dados', () => {
  const pasta = mkdtempSync(path.join(raiz, '.checar-'));
  const rodar = () => spawnSync(process.execPath, ['test/checar.mjs', pasta], { cwd: raiz, encoding: 'utf8' });
  try {
    writeFileSync(path.join(pasta, 'bom.js'), 'const bom = 1;');
    writeFileSync(path.join(pasta, 'tela.html'), '<script src="bom.js"></script><script type="application/json">{"x": 1}</script><script>const x = 1;</script>');
    assert.equal(rodar().status, 0);
    writeFileSync(path.join(pasta, 'ruim.js'), 'const = ;');
    let r = rodar();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ruim.js/);
    rmSync(path.join(pasta, 'ruim.js'));
    writeFileSync(path.join(pasta, 'tela.html'), '<script>function (</script>');
    r = rodar();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /tela.html.*inline/);
    writeFileSync(path.join(pasta, 'tela.html'), '<script type="module">export const bom = 1;</script>');
    assert.equal(rodar().status, 0);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('23: verificador recusa versões divergentes em links e scripts HTML', () => {
  const pasta = mkdtempSync(path.join(raiz, '.checar-'));
  const rodar = () => spawnSync(process.execPath, ['test/checar.mjs', pasta], { cwd: raiz, encoding: 'utf8' });
  try {
    writeFileSync(path.join(pasta, 'manifest.json'), '{"version":"0.20.0"}');
    for (const tag of ['<script src="comum.js?v=0.19.0"></script>', '<link rel="stylesheet" href="estilo.css?v=0.18.0">']) {
      writeFileSync(path.join(pasta, 'tela.html'), tag);
      const r = rodar();
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /versão.*0.20.0/i);
    }
    writeFileSync(path.join(pasta, 'tela.html'), '<link href="estilo.css?v=0.20.0"><script src="comum.js?v=0.20.0"></script>');
    assert.equal(rodar().status, 0);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
