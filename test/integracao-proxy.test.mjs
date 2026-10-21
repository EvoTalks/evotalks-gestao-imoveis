import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarServidor } from './bancada/servidor.mjs';

test('proxy real preserva query, bearer, autoria, bytes, status e cache; estáticos e SDK continuam locais', async () => {
  const recebidos = [];
  const real = http.createServer(async (req, res) => {
    const partes = []; for await (const p of req) partes.push(p);
    recebidos.push({ url: req.url, headers: req.headers, body: Buffer.concat(partes).toString() });
    res.writeHead(422, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"erro":"real","espacos":  true}\n');
  });
  await new Promise(r => real.listen(0, '127.0.0.1', r));
  const anterior = process.env.PORTAL_REAL_URL;
  process.env.PORTAL_REAL_URL = 'http://127.0.0.1:' + real.address().port;
  const servidor = criarServidor();
  if (anterior === undefined) delete process.env.PORTAL_REAL_URL; else process.env.PORTAL_REAL_URL = anterior;
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + servidor.address().port;
    const body = '{"titulo": "Sintético"}';
    const r = await fetch(base + '/api/ext/imoveis/DEMO-001/situacao?busca=a%20b', { method: 'POST', body,
      headers: { authorization: 'Bearer teste-proxy-invalido', 'X-GI-Autor': 'Operador Sintetico', 'Content-Type': 'application/json' } });
    assert.equal(r.status, 422); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(await r.text(), '{"erro":"real","espacos":  true}\n');
    assert.equal(recebidos[0].url, '/api/ext/imoveis/DEMO-001/situacao?busca=a%20b');
    assert.equal(recebidos[0].headers.authorization, 'Bearer teste-proxy-invalido');
    assert.equal(recebidos[0].headers['x-gi-autor'], 'Operador Sintetico'); assert.equal(recebidos[0].body, body);
    assert.equal((await fetch(base + '/api/ext/info')).status, 422, 'autenticação é decidida pelo router real');
    assert.equal((await fetch(base + '/app/imoveis.html')).status, 200);
    assert.equal((await fetch(base + '/bancada/sdk/contacts?termo=Demonstra')).status, 200);
    assert.equal(recebidos.length, 2);
  } finally {
    servidor.closeAllConnections(); real.closeAllConnections();
    await Promise.all([new Promise(r => servidor.close(r)), new Promise(r => real.close(r))]);
  }
});
