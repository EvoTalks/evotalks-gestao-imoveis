import { fixture, normalizar } from './fixture-desenho.mjs';
import { criarPortalSituacao } from '../bancada/portal-situacao.mjs';
export function criarFixturePortal() {
  const situacao = criarPortalSituacao(), dados = structuredClone(fixture), { produtos, contatos } = dados;
  const resposta = (corpo, status = 200) => ({ status, corpo });
  return { dados, responder(method, url, body, autor) {
    const p = url.pathname, q = url.searchParams;
    const rSituacao = situacao.responder(method, p.replace(/^\/api\/ext/, ''), body, autor);
    if (rSituacao) return rSituacao;
    if (p.startsWith('/bancada/sdk/')) {
      const recurso = p.split('/').pop();
      if (recurso === 'contacts') return resposta(contatos.filter(c=>normalizar(c.name+c.phone).includes(normalizar(q.get('termo')))));
      if (recurso === 'users') return resposta(dados.usuarios);
      if (recurso === 'products') {
        const where = JSON.parse(q.get('where') || '{}');
        const casa = (item,w) => Object.entries(w).every(([k,v]) => k === 'or' ? v.some(x=>casa(item,x)) : k === 'and' ? v.every(x=>casa(item,x)) : v?.contains !== undefined ? normalizar(item[k]).includes(normalizar(v.contains)) : item[k] === v);
        const rows = produtos.filter(p=>casa(p,where));
        return resposta(rows.slice(Number(q.get('skip')||0), Number(q.get('skip')||0)+Number(q.get('limit')||25)));
      }
      return resposta({ erro: 'sdk_fixture_ausente' },404);
    }
    const rota = p.slice('/api/ext'.length);
    if (method !== 'GET') return resposta({ erro: 'fixture_somente_leitura' },405);
    if (rota === '/permissoes/eu') return resposta({ administrador: false, padrao: {}, permissoes: { ver_imoveis: true, editar_imoveis: true, mudar_situacao: true, gerenciar_campos: true, ver_historico: true, ver_configuracoes: true } });
    if (rota === '/info') return resposta({ ok: true, bancada: true });
    if (rota === '/campos') return resposta({ campos: [] });
    if (rota === '/preenchidos') return resposta({ preenchidos: {} });
    if (rota.startsWith('/valores/')) return resposta({ valores: [], entradas: [] });
    return resposta({ erro: 'rota_fixture_ausente' }, 404);
  } };
}
