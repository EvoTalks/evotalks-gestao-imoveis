import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { portalExiste, portalDir, criarPortalReal } from './integracao/portal-real.mjs';
import { criarServidor } from './bancada/servidor.mjs';

test('integração sem portal disponível pula com aviso e saída zero', () => {
  const r = spawnSync(process.execPath, ['test/integracao/real.mjs'], {
    env: { ...process.env, PORTAL_DIR: new URL('./portal-ausente-sintetico', import.meta.url).pathname }, encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /AVISO.*integração pulada/);
});
