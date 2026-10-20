/* Só lê código/schema do portal. Toda escrita SQL vive no PGlite em memória. */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const portalDir = path.resolve(process.env.PORTAL_DIR || path.join(os.homedir(), '.worktrees/gestao-imoveis-portal-situacao'));
export const portalExiste = existsSync(path.join(portalDir, 'app/api.js')) && existsSync(path.join(portalDir, 'schema.sql'));
export async function criarPortalReal() {
  const require = createRequire(path.join(portalDir, 'app/api.js'));
  const { PGlite } = require('@electric-sql/pglite');
  const express = require('express');
  const db = require('./db');
  const { criarRouter } = require('./api');
  const pg = new PGlite();
  let servidor;
  try {
    await pg.exec(readFileSync(path.join(portalDir, 'schema.sql'), 'utf8'));
    // Igual ao adaptador de app/test/chamados.test.js do portal real.
    Object.assign(db, db.criarDb({ query: (sql, params) => pg.query(sql, params),
      connect: async () => ({ query: (sql, params) => pg.query(sql, params), release() {} }) }));
    await pg.query("INSERT INTO imoveis_saidas (codigo,titulo,transacao,bairro) VALUES ('DEMO-SAIDA','Imóvel que Saiu do Anúncio Demonstração','Locacao','Bairro Fictício')");
    const app = express(), requisicoes = [];
    app.use('/api/ext', (req, res, next) => { requisicoes.push({ method: req.method, url: req.url, em: Date.now() }); next(); }, criarRouter('bancada-sintetica'));
    servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = 'http://127.0.0.1:' + servidor.address().port;
    async function api(rota, corpo) {
      const r = await fetch(url + '/api/ext' + rota, { method: corpo === undefined ? 'GET' : 'POST',
        headers: { authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json', 'X-GI-Autor': 'Verificador Sintetico' },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
      const dados = await r.json();
      if (!r.ok) throw new Error('API real ' + r.status + ': ' + JSON.stringify(dados));
      return dados;
    }
    return { pg, url, api, requisicoes, fechar: async () => {
      servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); await pg.close();
    } };
  } catch (err) {
    if (servidor) { servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
    await pg.close(); throw err;
  }
}
