/* Contrato do portal para o cockpit de busca, com dados sintéticos. Segue o spec literalmente. */
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function criarPortalBusca({ origem = () => '' } = {}) {
  const bairros = { 'Cidade Fictícia': ['Bairro Exemplo', 'Águas Modelo'], 'Outra Cidade': ['Centro Sintético'] };
  const itens = [];
  const criar = () => Array.from({ length: 45 }, (_, n) => {
    const loc = n % 2 === 0, cidade = n % 5 === 0 ? 'Outra Cidade' : 'Cidade Fictícia';
    const bairro = cidade === 'Outra Cidade' ? 'Centro Sintético' : bairros[cidade][n % 2];
    const situacao = n % 9 === 8 ? 'indisponivel' : n % 7 === 6 ? 'reservado' : 'disponivel';
    return {
      codigo: 'DEMO-' + String(n + 1).padStart(3, '0'), codigo_curto: String(n + 1).padStart(4, '0'),
      titulo: (loc ? 'Apartamento ' : 'Casa ') + 'sintético ' + (n + 1) + (n === 0 ? ' com um título bem comprido para caber em duas linhas no cartão do painel' : ''),
      tipo: loc ? 'Apartamento' : 'Casa', transacao: loc ? 'Locacao' : 'Venda', cidade, bairro,
      quartos: n % 5 === 4 ? null : (n % 4) + 1, suites: n % 3 === 0 ? 1 : 0, banheiros: 1 + (n % 3), vagas: n % 4 === 3 ? null : (n % 3), area_m2: n % 6 === 5 ? null : 50 + n,
      valor_venda: loc ? null : (300000 + n * 10000) * 100, valor_aluguel: loc ? (1500 + n * 50) * 100 : null, condominio: loc ? 30000 : null,
      valor_total_mensal: loc ? (1500 + n * 50) * 100 + 30000 : null,
      imagem_principal: n % 8 === 7 ? null : origem() + '/app/icone-casa.svg?capa' + n, link: 'https://example.invalid/imovel/' + (n + 1),
      situacao, restricao: n % 6 === 5, restricao_campos: n % 6 === 5 ? ['Aceita pet', 'Taxa interna'] : [],
      descricao: '<p>Descri&ccedil;&atilde;o do im&oacute;vel '+(n+1)+'</p><br>Segunda linha &amp; fim', caracteristicas: ['Pool', 'Elevator'],
      imagens: Array.from({ length: n === 1 ? 12 : n === 7 ? 0 : 5 }, (_, k) => origem() + '/app/icone-casa.svg?n' + n + 'f' + k),
      primeiro_visto_em: n
    };
  });
  const iniciar = () => { if (!itens.length) itens.push(...criar()); };
  const ordem = { disponivel: 0, reservado: 1, indisponivel: 2 };
  const log = [];
  function item(i) { const { descricao, caracteristicas, imagens, primeiro_visto_em, ...resto } = i; return resto; }
  const portal = { itens, log, falharFotos: [], falharBusca: 0, falharOpcoes: 0, paginaVazia: false, iniciar, responder(method, rota, q, dados, headers) {
    iniciar();
    const r = (corpo, status = 200) => ({ status, corpo });
    if (method === 'GET' && rota === '/busca/opcoes') { log.push({ rota }); if (portal.falharOpcoes > 0) { portal.falharOpcoes--; return r({ erro: 'indisponivel' }, 503); } return r({ cidades: Object.keys(bairros).sort(), bairros, transacoes: ['Venda', 'Locacao'], quartos_max: 4 }); }
    if (method === 'GET' && rota === '/busca') {
      log.push({ rota, q: Object.fromEntries(q) });
      if (portal.falharBusca > 0) { portal.falharBusca--; return r({ erro: 'indisponivel' }, 503); }
      if (portal.paginaVazia && Number(q.get('pagina') || 1) > 1) return r({ itens: [], total: 45, pagina: Number(q.get('pagina')), por_pagina: 20 });
      const t = norm(q.get('texto')), vmax = q.get('valor_max') ? Number(q.get('valor_max')) * 100 : null;
      let lista = itens.filter(i => (!t || norm([i.titulo, i.descricao, i.bairro, i.cidade, i.tipo, i.codigo, i.codigo_curto].join(' ')).includes(t)) &&
        (!q.get('transacao') || i.transacao === q.get('transacao')) && (!q.get('cidade') || norm(i.cidade) === norm(q.get('cidade'))) &&
        (!q.get('bairro') || norm(i.bairro) === norm(q.get('bairro'))) && (!q.get('quartos_min') || (i.quartos || 0) >= Number(q.get('quartos_min'))) &&
        (vmax === null || (i.transacao === 'Locacao' ? i.valor_total_mensal : i.valor_venda) <= vmax));
      lista = lista.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.primeiro_visto_em - a.primeiro_visto_em);
      const por = Math.min(Number(q.get('por_pagina') || 20), 50), pag = Number(q.get('pagina') || 1);
      return r({ itens: lista.slice((pag - 1) * por, pag * por).map(item), total: lista.length, pagina: pag, por_pagina: por });
    }
    const m = rota.match(/^\/imovel\/([^/]+)(?:\/(card|fotos))?$/);
    if (m) {
      const i = itens.find(x => x.codigo === decodeURIComponent(m[1]));
      if (!i) return r({ erro: 'nao_encontrado' }, 404);
      if (method === 'GET' && !m[2]) {
        log.push({ rota });
        const str = v => v == null ? v : String(v); /* detalhe: bigint do pg vem como string */
        return r({ imovel: { ...i, valor_venda: str(i.valor_venda), valor_aluguel: str(i.valor_aluguel), condominio: str(i.condominio), valor_total_mensal: str(i.valor_total_mensal), campos_internos: [{ rotulo: 'Taxa interna', texto: 'R$ 123,45/mês', valor_centavos: 12345, observacao: 'Cobrada junto ao condomínio' }, { rotulo: 'Observação interna', texto: 'Chave com o zelador do prédio, avisar antes de visitar.', valor_centavos: null, observacao: null }] }, valores: [] });
      }
      if (method === 'POST' && m[2] === 'card') { log.push({ rota }); return r({ texto: i.titulo + '\n' + i.link, fileId: i.imagem_principal ? 7000 + itens.indexOf(i) : null }); }
      if (method === 'POST' && m[2] === 'fotos') {
        log.push({ rota, corpo: dados });
        const ix = dados && dados.indices;
        if (!Array.isArray(ix) || !ix.length || ix.length > 9 || ix.some(n => !Number.isInteger(n) || n < 0 || n >= i.imagens.length)) return r({ erro: 'indices_invalidos' }, 422);
        return r({ fotos: ix.map(n => ({ indice: n, url: i.imagens[n], fileId: portal.falharFotos.includes(n) ? null : 9000 + n, ...(portal.falharFotos.includes(n) ? { erro: 'download' } : {}) })) });
      }
    }
    return null;
  } };
  return portal;
}
