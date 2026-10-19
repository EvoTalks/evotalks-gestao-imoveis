import http from 'node:http';
import { criarPortalChamados } from './portal-chamados.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const copia = v => JSON.parse(JSON.stringify(v));
export function criarServidor({ falhasUpload = 0, portalRealUrl = process.env.PORTAL_REAL_URL, fixture = null } = {}) {
  if (fixture && portalRealUrl) throw new Error('Fixture não pode usar portal real.');
  const destinoReal = portalRealUrl ? new URL(portalRealUrl) : null;
  if (destinoReal && !['127.0.0.1', 'localhost', '[::1]'].includes(destinoReal.hostname)) throw new Error('Portal real da bancada deve ser local.');
  const produtos = [
    { id: 9101, internalcode: 'DEMO-001', name: 'Apartamento Demonstração Alfa', description: '[Locacao] Apartamento - 2 quarto(s) de demonstração', category: 'Apartamento > Cidade Fictícia > Bairro Exemplo', value: 123456, brand: 'DEMONSTRACAO' },
    { id: 9102, internalcode: 'DEMO-002', name: 'Casa Demonstração Beta', description: '[Venda] Casa - 2 quarto(s) de demonstração', category: 'Casa > Cidade Fictícia > Bairro Exemplo', value: 234500, brand: 'DEMONSTRACAO' },
    { id: 9103, internalcode: 'DEMO-003', name: 'Sala Demonstração Gama', description: 'Sala para finalidade não identificada', category: 'Sala > Cidade Fictícia > Bairro Modelo', value: 100000, brand: 'DEMONSTRACAO' },
  ];
  const contatos = [
    { id: 9901, name: 'Locatário Demonstração Um', phone: '00000000001', email: 'um@example.invalid' },
    { id: 9902, name: 'Locatário Demonstração Dois', phone: '00000000002', email: 'dois@example.invalid' }
  ];
  let proximoId = 4;
  const historico = {};
  const locacoes = [
    { id: 1, imovel_codigo: 'DEMO-002', imovel_titulo: produtos[1].name, imovel_tipo: 'Casa', imovel_bairro: 'Bairro Exemplo', imovel_cidade: 'Cidade Fictícia', fim: dia(28),
      contatos: [{ contato_id: 9901, papel: 'locatario', nome: contatos[0].name, telefone: contatos[0].phone },
        { contato_id: 9903, papel: 'proprietario', nome: 'Proprietário Demonstração' }, { contato_id: 9904, papel: 'fiador', nome: 'Fiador Demonstração' }] },
    { id: 2, imovel_codigo: null, imovel_titulo: 'Imóvel Avulso Demonstração', imovel_endereco: 'Rua Fictícia, zero', fim: dia(180), contatos: [{ contato_id: 9902, papel: 'locatario', nome: contatos[1].name }] },
    { id: 3, imovel_codigo: null, imovel_titulo: 'Contrato Vencido Demonstração', fim: dia(-2), contatos: [{ contato_id: 9901, papel: 'locatario', nome: contatos[0].name }] }
  ].map(l => ({ contrato_numero: 'DEMO-C' + l.id, garantia: 'fiador', inicio: dia(-300), valor_aluguel_centavos: 120000,
    dia_vencimento: 10, observacao: null, origem: 'manual', criada_por: 'Agente Demonstração', criada_em: new Date().toISOString(),
    atualizada_em: new Date().toISOString(), encerrada_em: null, ...l }));
  const manutencao = criarPortalChamados({ locacoes });
  manutencao.falharUpload(falhasUpload);
  const candidatas = [{ codigo: 'DEMO-SAIDA', titulo: 'Imóvel que Saiu do Anúncio Demonstração', bairro: 'Bairro Fictício', saiu_em: new Date().toISOString() }];
  const ativa = l => !l.encerrada_em;
  const objeto = l => ({ ...copia(l), fora_do_catalogo: !l.imovel_codigo, chamados_abertos: manutencao.contarAbertos(l.id),
    vence_em_dias: l.fim ? Math.round((Date.parse(l.fim) - Date.parse(dia(0))) / 86400000) : null });
  function registrar(l, acao, autor) {
    (historico[l.id] ||= []).push({ id: (historico[l.id]?.length || 0) + 1, autor, acao, detalhe: {}, em: new Date().toISOString() });
  }
  function validar(d, nova) {
    const campos = {};
    if (nova && !d.imovel_codigo && !(typeof d.imovel?.titulo === 'string' && d.imovel.titulo.trim())) campos.imovel = 'Informe o título do imóvel.';
    if (nova && d.imovel_codigo && !produtos.some(p => p.internalcode === d.imovel_codigo) && !(typeof d.imovel?.titulo === 'string' && d.imovel.titulo.trim())) campos.imovel = 'Imóvel fora do espelho: informe o título.';
    if (d.imovel_codigo != null && typeof d.imovel_codigo !== 'string') campos.imovel_codigo = 'Informe um texto.';
    if (Array.isArray(d.contatos)) d.contatos.forEach((c, i) => {
      if (typeof c.nome !== 'string' || !c.nome.trim()) campos['contatos.' + i + '.nome'] = 'Informe um nome não vazio.';
      if (c.telefone != null && typeof c.telefone !== 'string') campos['contatos.' + i + '.telefone'] = 'Informe um texto.';
      if (c.contato_id != null && (!Number.isSafeInteger(c.contato_id) || c.contato_id < 1)) campos['contatos.' + i + '.contato_id'] = 'Informe um identificador inteiro positivo.';
    });
    if (!Array.isArray(d.contatos) || !d.contatos.some(c => c.papel === 'locatario')) campos.contatos = 'Informe ao menos um locatário.';
    else if (d.contatos.some(c => !(typeof c.nome === 'string' && c.nome.trim()) || !['locatario', 'proprietario', 'fiador', 'outro'].includes(c.papel))) campos.contatos = 'Nome e papel do contato são obrigatórios.';
    if (d.inicio && d.fim && d.fim < d.inicio) campos.fim = 'O fim deve ser posterior ao início.';
    if (d.valor_aluguel_centavos != null && (!Number.isSafeInteger(d.valor_aluguel_centavos) || d.valor_aluguel_centavos < 0)) campos.valor_aluguel_centavos = 'Aluguel inválido.';
    if (d.dia_vencimento != null && (!Number.isInteger(d.dia_vencimento) || d.dia_vencimento < 1 || d.dia_vencimento > 31)) campos.dia_vencimento = 'Vencimento deve estar entre 1 e 31.';
    if (d.garantia && !['fiador', 'seguro_fianca', 'caucao', 'titulo_capitalizacao', 'sem_garantia', 'outra'].includes(d.garantia)) campos.garantia = 'Garantia inválida.';
    // Exercita uma recusa do servidor que as validações locais não conhecem.
    if (d.contrato_numero === 'FORCAR-422') campos.contrato_numero = 'Contrato recusado pela bancada (422 de teste).';
    return Object.keys(campos).length ? campos : null;
  }
  const server = http.createServer(async (req, res) => {
    function json(status, corpo) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(corpo)); }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (fixture && (url.pathname.startsWith('/bancada/sdk/') || url.pathname.startsWith('/api/ext/'))) {
        if (url.pathname.startsWith('/api/ext/') && req.headers.authorization !== 'Bearer bancada-sintetica') return json(401, { erro: 'nao_autorizado' });
        let body;
        if (req.method === 'POST') { let texto = ''; for await (const chunk of req) { texto += chunk; if (texto.length > 256 * 1024) return json(413, { erro: 'corpo_grande' }); } body = JSON.parse(texto || '{}'); }
        const r = fixture.responder(req.method, url, body);
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
          for (const nome of ['authorization', 'x-gi-autor', 'x-gi-user-id', 'content-type']) if (req.headers[nome]) headers[nome] = req.headers[nome];
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
          const upload = /^\/chamados\/\d+\/anexos\/upload$/.test(rota), limite = upload ? 3 * 1024 * 1024 : 256 * 1024;
          for await (const parte of req) { tamanho += parte.length; if (tamanho <= limite) texto += parte; }
          if (tamanho > limite) return json(413, { erro: upload ? 'arquivo_grande' : 'corpo_grande' });
          dados = JSON.parse(texto || '{}');
        }
        const autor = req.headers['x-gi-autor'] || 'Agente Demonstração';
        const respostaManutencao = manutencao.responder(req.method, rota, q, dados, autor);
        if (respostaManutencao) { for (const [k, v] of Object.entries(respostaManutencao.headers || {})) res.setHeader(k, v); return json(respostaManutencao.status, respostaManutencao.corpo); }
        if (rota === '/info') return json(200, { ok: true, bancada: true });
        if (rota === '/campos') return json(200, { campos: [] });
        if (rota === '/preenchidos') return json(200, { preenchidos: {} });
        if (rota.startsWith('/valores/')) return json(200, { valores: [], entradas: [] });
        if (rota === '/locacoes/mapa') return json(200, { locados: Object.fromEntries(locacoes.filter(l => ativa(l) && l.imovel_codigo).map(l => [l.imovel_codigo,
          { locacao_id: l.id, contrato_numero: l.contrato_numero, locatario_nome: l.contatos.find(c => c.papel === 'locatario')?.nome }])) });
        if (rota === '/locacoes/candidatas') {
          const rows = candidatas.filter(p => !locacoes.some(l => ativa(l) && l.imovel_codigo === p.codigo));
          return json(200, { rows, total: rows.length });
        }
        if (/^\/contatos\/\d+\/locacoes$/.test(rota)) {
          const id = Number(rota.split('/')[2]);
          const rows = locacoes.filter(l => ativa(l) && l.contatos.some(c => c.contato_id === id)).map(l => ({ ...objeto(l), papel_do_contato: l.contatos.find(c => c.contato_id === id).papel }));
          return json(200, { rows, total: rows.length });
        }
        if (rota === '/locacoes' && req.method === 'GET') {
          const contrato = q.get('contrato') || 'ativas', busca = normalizar(q.get('busca'));
          const pageSize = Math.min(100, Math.max(1, Number(q.get('por_pagina') || 30))), pagina = Math.max(1, Number(q.get('pagina') || 1));
          const rows = locacoes.map(objeto).filter(l =>
            (contrato === 'todas' || contrato === 'encerradas' && !ativa(l) || contrato === 'ativas' && ativa(l) || contrato === 'vencendo' && ativa(l) && l.vence_em_dias != null && l.vence_em_dias <= 60) &&
            (!q.get('origem') || l.origem === q.get('origem')) && normalizar([l.imovel_titulo, l.imovel_codigo, l.contrato_numero, ...l.contatos.map(c => c.nome)].join(' ')).includes(busca)
          ).sort((a, b) => a.imovel_titulo.localeCompare(b.imovel_titulo));
          return json(200, { rows: rows.slice((pagina - 1) * pageSize, pagina * pageSize), total: rows.length, pageSize,
            resumo: { ativas: locacoes.filter(ativa).length, vencendo_60d: locacoes.filter(l => ativa(l) && l.fim && objeto(l).vence_em_dias <= 60).length, encerradas: locacoes.filter(l => !ativa(l)).length } });
        }
        const detalhe = rota.match(/^\/locacoes\/(\d+)(\/encerrar)?$/);
        const l = detalhe && locacoes.find(l => l.id === Number(detalhe[1]));
        if (detalhe && !l) return json(404, { erro: 'nao_encontrada' });
        if (l && req.method === 'GET' && !detalhe[2]) return json(200, { locacao: objeto(l), historico: historico[l.id] || [] });
        if (req.method === 'POST' && (rota === '/locacoes' || detalhe)) {
          if (l?.encerrada_em) return json(409, { erro: 'locacao_encerrada' });
          if (detalhe?.[2]) {
            l.encerrada_em = new Date().toISOString(); l.encerrada_por = autor; l.motivo_encerramento = dados.motivo || null;
            registrar(l, 'encerrou', autor); return json(200, { ok: true, locacao: objeto(l) });
          }
          const campos = validar(dados, !l);
          if (campos) return json(422, { erro: 'dados_invalidos', campos });
          if (!l && dados.imovel_codigo) {
            const existente = locacoes.find(x => ativa(x) && x.imovel_codigo === dados.imovel_codigo);
            if (existente) return json(409, { erro: 'imovel_ja_locado', locacao_id: existente.id });
          }
          const permitidos = ['contrato_numero', 'garantia', 'inicio', 'fim', 'valor_aluguel_centavos', 'dia_vencimento', 'observacao', 'contatos'];
          const entrada = Object.fromEntries(permitidos.filter(k => k in dados).map(k => [k, copia(dados[k])]));
          let salvo = l;
          if (l) Object.assign(l, entrada, { atualizada_em: new Date().toISOString() });
          else {
            const p = produtos.find(p => p.internalcode === dados.imovel_codigo), cat = p?.category.split(' > ');
            const imovel = p ? { titulo: p.name, tipo: cat[0], cidade: cat[1], bairro: cat[2] } : dados.imovel;
            salvo = { id: proximoId++, ...entrada, imovel_codigo: dados.imovel_codigo || null, origem: 'manual', encerrada_em: null,
              criada_por: autor, criada_em: new Date().toISOString(), atualizada_em: new Date().toISOString(),
              ...Object.fromEntries(['titulo', 'tipo', 'endereco', 'bairro', 'cidade'].map(k => ['imovel_' + k, imovel[k] || null])) };
            locacoes.push(salvo);
          }
          registrar(salvo, l ? 'atualizou' : 'criou', autor);
          return json(l ? 200 : 201, { ok: true, locacao: objeto(salvo) });
        }
        return json(404, { erro: 'rota_nao_simulada' });
      }
      if (req.method !== 'GET') return json(405, { erro: 'metodo_nao_simulado' });
      const nome = url.pathname === '/' ? 'app/locados.html' : decodeURIComponent(url.pathname).slice(1);
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
    process.stdout.write('Bancada sintética: http://127.0.0.1:' + this.address().port + '/app/locados.html\n');
  });
}
