/* Adaptador determinístico de bancada. Nenhuma rota alcança portal/SDK reais. */
import { fixture, AGORA, anexos, orcamentos, eventos, totalPrestadoresHidraulica, normalizar } from './fixture-desenho.mjs';
import { criarPortalSituacao } from '../bancada/portal-situacao.mjs';
import { criarPortalChamados } from '../bancada/portal-chamados.mjs';
export function criarFixturePortal() {
  const situacao = criarPortalSituacao();
  const dados = structuredClone(fixture), { chamados, locacoes, produtos, contatos } = dados;
  // Só a criação usa o contrato já testado do portal de mentira, sem fixtures DEMO.
  const criacao = criarPortalChamados({ locacoes, agora: () => Date.parse(AGORA), semFixtures: true });
  const abertos = rows => rows.filter(c => !['concluido','cancelado'].includes(c.status)).length;
  const resposta = (corpo, status = 200) => ({ status, corpo });
  const resumo = rows => ({ abertos: abertos(rows), concluidos: rows.filter(c=>c.status==='concluido').length,
    prazo_estourado: rows.filter(c=>!['concluido','cancelado'].includes(c.status) && !c.sla.pausado && c.sla.prazo_solucao_em && Date.parse(c.sla.prazo_solucao_em)<Date.parse(AGORA)).length,
    aguardando_proprietario: rows.filter(c=>c.aprovacao.status==='pendente').length, emergencia_sem_triagem: rows.filter(c=>c.prioridade==='emergencia'&&c.status==='novo').length });
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
    if (method === 'POST' && rota === '/chamados') {
      const r = criacao.responder(method,rota,q,body,'Marina');
      if (r.status !== 201) return r;
      r.corpo.chamado.id = r.corpo.chamado.numero = Math.max(...chamados.map(c=>c.numero)) + 1;
      chamados.unshift(r.corpo.chamado); return r;
    }
    if (method !== 'GET') return resposta({ erro: 'fixture_somente_leitura' },405);
    if (rota === '/permissoes/eu') return resposta({ administrador: false, padrao: {}, permissoes: { ver_imoveis: true, editar_imoveis: true, mudar_situacao: true, gerenciar_campos: true, ver_historico: true, ver_configuracoes: true } });
    if (rota === '/info') return resposta({ ok: true, bancada: true });
    if (rota === '/campos') return resposta({ campos: [] });
    if (rota === '/preenchidos') return resposta({ preenchidos: {} });
    if (rota.startsWith('/valores/')) return resposta({ valores: [], entradas: [] });
    if (rota === '/config/manutencao') return criacao.responder(method,rota,q);
    if (rota === '/prestadores') {
      // O desenho conta cinco, mas nomeia só dois. Os outros três têm apenas
      // identidade técnica e categoria, sem inventar nome nem situação cadastral.
      const rows=orcamentos.map(o=>({ id:o.prestador_id,nome:o.prestador_nome,ativo:true,categorias:['hidraulica'] }));
      while(rows.length<totalPrestadoresHidraulica)rows.push({id:rows.length+1,categorias:['hidraulica']});
      const categoria=q.get('categoria');
      return resposta({rows:rows.filter(p=>!categoria||p.categorias.includes(categoria)).slice(0,Number(q.get('por_pagina')||25)),total:categoria==='hidraulica'?totalPrestadoresHidraulica:categoria?0:rows.length});
    }
    if (rota === '/locacoes/mapa') return resposta({ locados: Object.fromEntries(locacoes.filter(l=>l.imovel_codigo).map(l=>[l.imovel_codigo,{locacao_id:l.id,contrato_numero:l.contrato_numero,locatario_nome:l.contatos[0].nome}])) });
    if (rota === '/locacoes/candidatas') return resposta({ rows: [], total: 0 });
    if (rota === '/locacoes') return resposta({ rows:locacoes,total:locacoes.length,pageSize:Number(q.get('por_pagina')||25), resumo:{ativas:locacoes.length,vencendo_60d:locacoes.filter(l=>l.vence_em_dias<=60).length,encerradas:0} });
    let m = rota.match(/^\/contatos\/(\d+)\/locacoes$/);
    if (m) { const rows=locacoes.filter(l=>l.contatos.some(c=>c.contato_id===Number(m[1]))).map(l=>({...l,papel_do_contato:l.contatos.find(c=>c.contato_id===Number(m[1])).papel})); return resposta({rows,total:rows.length}); }
    m = rota.match(/^\/locacoes\/(\d+)$/);
    if (m) return resposta({ locacao: locacoes.find(l=>l.id===Number(m[1])), historico: [] });
    m = rota.match(/^\/(contatos|locacoes)\/(\d+)\/(chamados|atendimentos)$/);
    if (m) {
      const ids=m[1]==='locacoes'?[Number(m[2])]:locacoes.filter(l=>l.contatos.some(c=>c.contato_id===Number(m[2]))).map(l=>l.id);
      let rows=chamados.filter(c=>ids.includes(c.locacao_id));
      if (m[3]==='atendimentos') rows=rows.filter(c=>c.atendimento).map(c=>({...c.atendimento,chamados:[{id:c.id,numero:c.numero,titulo:c.titulo,status:c.status}]}));
      return resposta({rows,total:rows.length,resumo:resumo(chamados.filter(c=>ids.includes(c.locacao_id)))});
    }
    if (rota === '/chamados') return resposta({ rows:chamados,total:chamados.length,pageSize:Number(q.get('por_pagina')||25),resumo:resumo(chamados) });
    m=rota.match(/^\/chamados\/(\d+)$/);
    if (m) { const c=chamados.find(c=>c.id===Number(m[1])); if (!c) return resposta({erro:'nao_encontrado'},404);
      return resposta({ chamado:c,locacao:locacoes.find(l=>l.id===c.locacao_id),eventos:c.id===1042?eventos:[],anexos:c.id===1042?anexos:[],orcamentos:c.id===1042?orcamentos:[] }); }
    return resposta({ erro:'rota_fixture_ausente',rota },404);
  } };
}
