import http from 'node:http';
import { criarPortalPermissoes } from './portal-permissoes.mjs';
import { criarPortalSituacao } from './portal-situacao.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const copia = v => JSON.parse(JSON.stringify(v));
export function criarServidor({ portalRealUrl = process.env.PORTAL_REAL_URL, fixture = null, situacoes = {}, permissoes = {}, campos = [], detalhes = {}, capas = {}, produtosSinteticos = null, valoresColunas = {}, colunasFora = false, busca = null } = {}) {
  if (fixture && portalRealUrl) throw new Error('Fixture não pode usar portal real.');
  const destinoReal = portalRealUrl ? new URL(portalRealUrl) : null;
  if (destinoReal && !['127.0.0.1', 'localhost', '[::1]'].includes(destinoReal.hostname)) throw new Error('Portal real da bancada deve ser local.');
  const produtos = produtosSinteticos || [
    { id: 9101, internalcode: 'DEMO-001', name: 'Apartamento Demonstração Alfa', description: '[Locacao] Apartamento - 2 quarto(s) de demonstração', category: 'Apartamento > Cidade Fictícia > Bairro Exemplo', value: 123456, brand: 'DEMONSTRACAO' },
    { id: 9102, internalcode: 'DEMO-002', name: 'Casa Demonstração Beta', description: '[Venda] Casa - 2 quarto(s) de demonstração', category: 'Casa > Cidade Fictícia > Bairro Exemplo', value: 234500, brand: 'DEMONSTRACAO' },
    { id: 9103, internalcode: 'DEMO-003', name: 'Sala Demonstração Gama', description: 'Sala para finalidade não identificada', category: 'Sala > Cidade Fictícia > Bairro Modelo', value: 100000, brand: 'DEMONSTRACAO' },
  ];
  const contatos = [
    { id: 9901, name: 'Locatário Demonstração Um', phone: '00000000001', email: 'um@example.invalid' },
    { id: 9902, name: 'Locatário Demonstração Dois', phone: '00000000002', email: 'dois@example.invalid' }
  ];
  const valores = {};
  const layouts = {};
  const situacao = criarPortalSituacao(situacoes);
  const controle = criarPortalPermissoes(permissoes);
  const server = http.createServer(async (req, res) => {
    function json(status, corpo) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(corpo)); }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (fixture && (url.pathname.startsWith('/bancada/sdk/') || url.pathname.startsWith('/api/ext/'))) {
        if (url.pathname.startsWith('/api/ext/') && req.headers.authorization !== 'Bearer bancada-sintetica') return json(401, { erro: 'nao_autorizado' });
        let body;
        if (req.method === 'POST') { let texto = ''; for await (const chunk of req) { texto += chunk; if (texto.length > 256 * 1024) return json(413, { erro: 'corpo_grande' }); } body = JSON.parse(texto || '{}'); }
        const r = fixture.responder(req.method, url, body, req.headers['x-gi-autor']);
        return json(r.status, r.corpo);
      }
      if (url.pathname.startsWith('/bancada/sdk/')) {
        if (req.method !== 'GET') return json(405, { erro: 'somente_leitura' });
        const nome = url.pathname.slice('/bancada/sdk/'.length);
        if (nome === 'contacts') return json(200, contatos.filter(c => normalizar(c.name + c.phone).includes(normalizar(url.searchParams.get('termo')))));
        if (nome === 'users') return json(200, [{ id: 9999, name: 'Agente Demonstração' }]);
        if (nome === 'products') {
          const where = JSON.parse(url.searchParams.get('where') || '{}');
          const casa = (p, w) => Object.entries(w).every(([k, v]) => k === 'or' ? v.some(x => casa(p, x)) : typeof v?.contains === 'string' ? normalizar(p[k]).includes(normalizar(v.contains)) : typeof v?.startsWith === 'string' ? String(p[k] || '').startsWith(v.startsWith) : p[k] === v);
          const lista = produtos.filter(p => casa(p, where));
          const skip = Number(url.searchParams.get('skip') || 0), limit = Number(url.searchParams.get('limit') || 25);
          return json(200, lista.slice(skip, skip + limit));
        }
        return json(404, { erro: 'recurso_nao_simulado' });
      }
      if (url.pathname.startsWith('/api/ext/')) {
        if (destinoReal) {
          const destino = new URL(url.pathname + url.search, destinoReal);
          const headers = {};
          for (const nome of ['authorization', 'x-gi-autor', 'x-gi-user-id', 'x-gi-user-type', 'content-type']) if (req.headers[nome]) headers[nome] = req.headers[nome];
          const resposta = await fetch(destino, { method: req.method, headers, redirect: 'manual',
            ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req, duplex: 'half' }) });
          const volta = {};
          for (const nome of ['content-type', 'cache-control', 'retry-after', 'etag', 'content-disposition']) if (resposta.headers.has(nome)) volta[nome] = resposta.headers.get(nome);
          res.writeHead(resposta.status, volta);
          res.end(Buffer.from(await resposta.arrayBuffer()));
          return;
        }
        if (req.headers.authorization !== 'Bearer bancada-sintetica') return json(401, { erro: 'nao_autorizado' });
        const rota = url.pathname.slice('/api/ext'.length), q = url.searchParams;
        let dados = {};
        if (req.method === 'POST') {
          let texto = '', tamanho = 0;
          const limite = 256 * 1024;
          for await (const parte of req) { tamanho += parte.length; if (tamanho <= limite) texto += parte; }
          if (tamanho > limite) return json(413, { erro: 'corpo_grande' });
          dados = JSON.parse(texto || '{}');
        }
        const autor = req.headers['x-gi-autor'] || 'Agente Demonstração';
        const respostaPermissoes = controle.responder(req.method, rota, dados, req.headers);
        if (respostaPermissoes) return json(respostaPermissoes.status, respostaPermissoes.corpo);
        const respostaBusca = busca && busca.responder(req.method, rota, q, dados, req.headers);
        if (respostaBusca) return json(respostaBusca.status, respostaBusca.corpo);
        if (rota === '/imoveis/capas') return json(200, { capas: Object.fromEntries((url.searchParams.get('codigos') || '').split(',').filter(Boolean).map(c => [c, capas[c] || null])) });
        const respostaSituacao = situacao.responder(req.method, rota, dados, autor);
        if (respostaSituacao) return json(respostaSituacao.status, respostaSituacao.corpo);
        if (rota === '/colunas/eu') {
          if (colunasFora) return json(503, { erro:'indisponivel' });
          const user = req.headers['x-gi-user-id'];
          if (req.method === 'POST') layouts[user] = copia(dados.layout);
          return json(200, { layout:layouts[user] || null });
        }
        if (rota === '/valores/colunas') return json(200, { valores:valoresColunas });
        if (rota === '/info') return json(200, { ok: true, bancada: true });
        if (rota === '/config') return json(200, { urlFeed: { definida: false }, intervaloHoras: 6, sync: {} });
        if (rota === '/historico') return json(200, { eventos: [] });
        if (rota === '/campos') return json(200, { campos });
        if (rota === '/preenchidos') return json(200, { preenchidos: Object.fromEntries(Object.entries(valoresColunas).map(([codigo,campos]) => [codigo,Object.keys(campos).length])) });
        if (req.method === 'GET' && rota.startsWith('/imovel/')) {
          const codigo = decodeURIComponent(rota.slice('/imovel/'.length));
          return detalhes[codigo] ? json(200, copia(detalhes[codigo])) : json(404, { erro: 'nao_encontrado' });
        }
        if (rota.startsWith('/valores/')) {
          const codigo = decodeURIComponent(rota.slice('/valores/'.length));
          if (req.method === 'POST') valores[codigo] = copia(dados.entradas || []);
          return json(200, { valores: valores[codigo] || [], entradas: valores[codigo] || [] });
        }
        return json(404, { erro: 'rota_nao_simulada' });
      }
      if (req.method !== 'GET') return json(405, { erro: 'metodo_nao_simulado' });
      const nome = url.pathname === '/' ? 'app/imoveis.html' : decodeURIComponent(url.pathname).slice(1);
      if (!/^(?:app\/[a-z-]+\.(?:js|html|css|svg)|manifest\.json|test\/bancada\/omni-stub\.js)$/.test(nome)) return json(404, { erro: 'arquivo_nao_permitido' });
      let conteudo = await readFile(path.join(raiz, nome));
      const tipo = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(nome)];
      if (nome.endsWith('.html')) conteudo = conteudo.toString().replace('<script ', '<script src="/test/bancada/omni-stub.js"></script>\n<script ');
      res.writeHead(200, { 'Content-Type': tipo + '; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'" });
      res.end(conteudo);
    } catch (err) {
      json(err.code === 'ENOENT' ? 404 : 400, { erro: 'erro_bancada', detalhe: err.message });
    }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT || 4178);
  criarServidor().listen(porta, '127.0.0.1', function () {
    process.stdout.write('Bancada sintética: http://127.0.0.1:' + this.address().port + '/app/imoveis.html\n');
  });
}
