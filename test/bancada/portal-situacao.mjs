/* Contrato compartilhado pelos portais sintéticos; nunca acessa rede externa. */
export function criarPortalSituacao(iniciais = {}) {
  const situacoes = Object.assign(Object.create(null), iniciais);
  return { responder(method, rota, dados, autor) {
    if (method === 'GET' && rota === '/imoveis/situacoes') return { status: 200, corpo: { situacoes: { ...situacoes } } };
    const alvo = rota.match(/^\/imoveis\/([^/]*)\/situacao$/);
    if (method !== 'POST' || !alvo) return null;
    const codigo = decodeURIComponent(alvo[1]).trim();
    if (!codigo || codigo.length > 40) return { status: 422, corpo: { erro: 'codigo_invalido' } };
    if (!['disponivel', 'reservado', 'indisponivel'].includes(dados.situacao)) return { status: 422, corpo: { erro: 'situacao_invalida' } };
    situacoes[codigo] = dados.situacao;
    return { status: 200, corpo: { codigo, situacao: dados.situacao, autor, atualizado_em: new Date().toISOString() } };
  } };
}
