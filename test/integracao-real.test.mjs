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
test('router e SQL reais preservam resposta e autoria pelo proxy da bancada', {
  skip: !portalExiste && 'AVISO: portal real ausente em ' + portalDir + '; defina PORTAL_DIR'
}, async () => {
  const real = await criarPortalReal();
  const servidor = criarServidor({ portalRealUrl: real.url });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  try {
    const url = 'http://127.0.0.1:' + servidor.address().port + '/api/ext';
    assert.equal((await fetch(url + '/locacoes')).status, 401);
    const r = await fetch(url + '/locacoes', { method: 'POST',
      headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json', 'X-GI-Autor': 'Autor Sintetico Integracao' },
      body: JSON.stringify({ imovel: { titulo: 'Imóvel Sintético' }, contatos: [{ contato_id: 9901, nome: 'Locatário Demonstração Um', papel: 'locatario' }] }) });
    assert.equal(r.status, 201); const { locacao } = await r.json();
    const { rows } = await real.pg.query('SELECT criada_por FROM locacoes WHERE id=$1', [locacao.id]);
    assert.equal(rows[0].criada_por, 'Autor Sintetico Integracao');
    assert.equal((await real.api('/contatos/9901/locacoes')).rows[0].id, locacao.id);
    assert.equal((await real.api('/locacoes/candidatas')).rows[0].codigo, 'DEMO-SAIDA');
  } finally {
    servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); await real.fechar();
  }
});

test('simulador e portal real: escolher novamente o orçamento atual preserva a decisão', {
  skip: !portalExiste && 'AVISO: portal real ausente; comparação pulada'
}, async () => {
  const { criarPortalChamados } = await import('./bancada/portal-chamados.mjs');
  const real = await criarPortalReal();
  try {
    const { locacao } = await real.api('/locacoes', { imovel: { titulo: 'Imóvel Sintético' }, contatos: [{ nome: 'Locatário Sintético', papel: 'locatario' }] });
    const falso = criarPortalChamados({ locacoes: [{ id: locacao.id, contatos: [] }], semFixtures: true });
    const apiFalso = async (rota, corpo) => {
      const r = falso.responder(corpo === undefined ? 'GET' : 'POST', rota, undefined, corpo, 'Operador Sintético');
      assert.ok(r.status < 400, JSON.stringify(r)); return r.corpo;
    };
    for (const api of [real.api, apiFalso]) {
      const { chamado } = await api('/chamados', { locacao_id: locacao.id, titulo: 'Orçamento Sintético', categoria: 'outros', solicitante: { nome: 'Pessoa Sintética' } });
      const base = '/chamados/' + chamado.id;
      await api(base, { quem_paga: 'proprietario' });
      const { orcamento } = await api(base + '/orcamentos', { prestador_nome: 'Prestador Sintético', valor_centavos: 50000 });
      await api(base + '/orcamentos/' + orcamento.id + '/escolher', {});
      await api(base + '/aprovacao', { acao: 'recusada', por: 'Pessoa Sintética' });
      const antes = await api(base);
      await api(base + '/orcamentos/' + orcamento.id + '/escolher', {});
      const depois = await api(base);
      assert.equal(depois.chamado.aprovacao.status, 'recusada');
      assert.equal(depois.eventos.length, antes.eventos.length, 'escolha repetida é idempotente');
    }
  } finally { await real.fechar(); }
});
