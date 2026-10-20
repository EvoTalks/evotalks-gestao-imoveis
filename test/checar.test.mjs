import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
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

test('25: rejeita cor fixa em estado; 27: exige ?v= igual ao manifest nos recursos locais', () => {
  const pasta = mkdtempSync(path.join(raiz, '.checar-'));
  const app = path.join(pasta, 'app');
  const rodar = () => spawnSync(process.execPath, ['test/checar.mjs', pasta], { cwd: raiz, encoding: 'utf8' });
  try {
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(pasta, 'manifest.json'), '{"version":"0.20.0"}');
    writeFileSync(path.join(app, 'tela.html'), '<link href="estilo.css?v=0.20.0"><script src="tela.js?v=0.20.0"></script>');
    writeFileSync(path.join(app, 'estilo.css'), '.gi-estado-ok { color: #10714a; }');
    assert.notEqual(rodar().status, 0);
    assert.match(rodar().stderr, /cor hexadecimal fixa/);
    writeFileSync(path.join(app, 'estilo.css'), '.gi-estado-ok { color: var(--gi-texto); }');
    writeFileSync(path.join(app, 'tela.html'), '<link href="estilo.css"><script src="tela.js?v=0.20.0"></script>');
    assert.notEqual(rodar().status, 0);
    assert.match(rodar().stderr, /sem \?v=/);
    writeFileSync(path.join(app, 'tela.html'), '<link href="estilo.css?v=0.20.0"><script src="tela.js?v=0.20.0"></script>');
    assert.equal(rodar().status, 0);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('29/F11: cockpit e diálogo exigem [0,1,2], gestão [0] e demais telas preservadas', () => {
  const pasta = mkdtempSync(path.join(raiz, '.checar-'));
  const app = path.join(pasta, 'app');
  const rodar = () => spawnSync(process.execPath, ['test/checar.mjs', pasta], { cwd: raiz, encoding: 'utf8' });
  try {
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify({ version: '0.20.0', contributions: [
      { id: 'menu', items: ['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config'].map(id => ({ id })) },
      { id: 'gi-cockpit' }, { id: 'gi-os', visibility: { userTypes: [0, 1, 2] } }
    ] }));
    assert.notEqual(rodar().status, 0);
    assert.match(rodar().stderr, /deve restringir userIds/);
    const m = JSON.parse(readFileSync(path.join(pasta, 'manifest.json'), 'utf8'));
    for (const item of m.contributions[0].items.slice(0, 3)) item.visibility = { userIds: [1, 515, 528, 531] };
    m.contributions[1].visibility = { userTypes: [0, 1, 2] };
    writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(m));
    assert.equal(rodar().status, 0);
    for (const tipos of [[0], [0, 1], [0, 1, 2, 3]]) {
      m.contributions[1].visibility.userTypes = tipos;
      writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(m));
      assert.notEqual(rodar().status, 0);
    }
    m.contributions[1].visibility.userTypes = [0, 1, 2];
    m.contributions[2].visibility.userTypes = [0];
    writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(m));
    assert.notEqual(rodar().status, 0);
    assert.match(rodar().stderr, /gi-os deve definir userTypes/);
    m.contributions[2].visibility.userTypes = [0, 1, 2];
    for (const item of m.contributions[0].items.slice(0, 3)) {
      for (const visibility of [{ userTypes: [0] }, { userIds: [1, 515, 528] }, { userIds: [1, 515, 528, 531, 600] }, { userIds: ['1', 515, 528, 531] }, { userIds: [1, 515, 528, 531], userTypes: [0] }]) {
        item.visibility = visibility;
        writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(m));
        assert.notEqual(rodar().status, 0);
      }
      item.visibility = { userIds: [1, 515, 528, 531] };
    }
    m.contributions[0].items[3].visibility = { userTypes: [0] };
    writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(m));
    assert.notEqual(rodar().status, 0);
    assert.match(rodar().stderr, /não deve restringir visibilidade própria/);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

for (const versao of ['0.27.0', '0.28.0', '0.29.0', '0.29.1']) test(versao + ': telas ativas exigem cache novo, dormentes mantêm versão e contribuições desligadas são recusadas', () => {
  const pasta = mkdtempSync(path.join(raiz, '.checar-'));
  const app = path.join(pasta, 'app');
  const rodar = () => spawnSync(process.execPath, ['test/checar.mjs', pasta], { cwd: raiz, encoding: 'utf8' });
  const manifest = { version: versao, contributions: [{ id: 'menu', items: ['gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config'].map(id => ({ id })) }] };
  try {
    mkdirSync(app);
    writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(manifest));
    for (const tela of ['painel', 'os', 'chamados', 'prestadores']) writeFileSync(path.join(app, tela + '.html'), '<script src="comum.js?v=0.26.3"></script>');
    writeFileSync(path.join(app, 'imoveis.html'), '<script src="comum.js?v=' + versao + '"></script>');
    assert.equal(rodar().status, 0);
    writeFileSync(path.join(app, 'imoveis.html'), '<script src="comum.js?v=0.26.3"></script>');
    assert.notEqual(rodar().status, 0, 'tela ativa não aceita exceção de cache dormente');
    writeFileSync(path.join(app, 'imoveis.html'), '<script src="comum.js?v=' + versao + '"></script>');
    for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-cockpit', 'gi-os']) {
      manifest.contributions.push({ id });
      writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify(manifest));
      assert.match(rodar().stderr, /contribuição desligada/);
      manifest.contributions.pop();
    }
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
