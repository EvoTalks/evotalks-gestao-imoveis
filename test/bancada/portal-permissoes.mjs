/* Contrato do portal, com dados sintéticos e sem acesso a rede externa. */
export const PERMISSOES_PADRAO = { ver_imoveis: true, editar_imoveis: true, gerenciar_campos: false, ver_historico: false, ver_configuracoes: false };
export function criarPortalPermissoes(iniciais = {}) {
  const registros = structuredClone(iniciais), historico = [];
  const chaves = Object.keys(PERMISSOES_PADRAO);
  const todas = Object.fromEntries(chaves.map(k => [k, true]));
  return { registros, historico, responder(method, rota, dados, headers) {
    const bruto = String(headers['x-gi-user-id'] || ''), numero = Number(bruto);
    const id = /^\d+$/.test(bruto) && Number.isInteger(numero) && numero > 0 && numero <= 2147483647 ? numero : null;
    const autor = String(headers['x-gi-autor'] || dados && dados.autor || '').trim().slice(0, 80) || 'extensao';
    const admin = id !== null && headers['x-gi-user-type'] === '0';
    const base = admin && id ? todas : id && registros[id] || PERMISSOES_PADRAO;
    const permissoes = { ...base, mudar_situacao: base.ver_imoveis };
    const resposta = (corpo, status = 200) => ({ status, corpo });
    const negar = permissao => resposta({ erro: 'sem_permissao', ...(permissao ? { permissao } : {}) }, 403);
    if (rota === '/permissoes/eu') return resposta({ permissoes: permissoes, administrador: admin && !!id, padrao: PERMISSOES_PADRAO });
    if (rota === '/permissoes' || rota.startsWith('/permissoes/')) {
      if (!admin || !id) return negar();
      if (method === 'GET' && rota === '/permissoes') return resposta({ padrao: PERMISSOES_PADRAO, usuarios: Object.entries(registros).map(([user_id, r]) => ({ ...r, user_id: Number(user_id) })) });
      const alvo = rota.match(/^\/permissoes\/(\d+)$/), userId = Number(alvo?.[1]);
      if (method !== 'POST' || !Number.isInteger(userId) || userId <= 0 || userId > 2147483647 || !dados || typeof dados !== 'object' || Array.isArray(dados) || chaves.some(k => typeof dados[k] !== 'boolean') || dados.nome != null && typeof dados.nome !== 'string') return resposta({ erro: 'permissao_invalida' }, 422);
      const antes = registros[userId];
      const novo = { nome: dados.nome ?? null, ...Object.fromEntries(chaves.map(k => [k, dados[k]])) };
      if (!antes || novo.nome !== antes.nome || chaves.some(k => novo[k] !== antes[k])) historico.push({ user_id: userId, antes, depois: novo, autor });
      registros[userId] = { ...novo, atualizado_por: autor, atualizado_em: new Date().toISOString() };
      return resposta({ user_id: userId, ...registros[userId] });
    }
    const chave = method === 'POST' && rota.startsWith('/valores/') ? 'editar_imoveis'
      : method === 'POST' && /^\/imoveis\/[^/]+\/situacao$/.test(rota) ? 'ver_imoveis'
      : method === 'POST' && /^\/campos(?:\/|$)/.test(rota) ? 'gerenciar_campos'
      : method === 'GET' && rota === '/historico' ? 'ver_historico'
      : /^\/config(?:\/|$)/.test(rota) ? 'ver_configuracoes' : null;
    if (chave && !permissoes[chave]) return negar(chave);
    return null;
  } };
}
