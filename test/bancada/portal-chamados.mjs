/* Portal de mentira: estado por servidor, relógio injetável e somente dados sintéticos. */
import { createHash } from 'node:crypto';
export const STATUS = ['novo', 'triagem', 'orcamento', 'aprovacao', 'agendado', 'execucao', 'concluido', 'cancelado'];
export const CATEGORIAS = ['hidraulica', 'eletrica', 'gas', 'estrutura', 'esquadrias', 'pintura', 'chaveiro', 'outros'];
export const PADROES = { alcada_centavos: 25000, sla: { emergencia: { resposta_min: 15, solucao_h: 24 },
  alta: { resposta_min: 120, solucao_h: 72 }, normal: { resposta_min: 240, solucao_h: 120 } } };
const copia = v => structuredClone(v);
const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const aberto = c => !['concluido', 'cancelado'].includes(c.status);
const positivo = n => Number.isSafeInteger(n) && n > 0;
const dinheiro = n => Number.isSafeInteger(n) && n >= 0;
const texto = n => typeof n === 'string' && n.trim().length > 0;
const iso = n => typeof n === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(n) && Number.isFinite(Date.parse(n));
function erro(status, codigo, campos) { throw { status, corpo: { erro: codigo, ...(campos ? { campos } : {}) } }; }
function validar(campos) { if (Object.keys(campos).length) erro(422, 'dados_invalidos', campos); }
export function criarPortalChamados({ locacoes, agora = () => Date.now(), semFixtures = false }) {
  let chamados = [], prestadores = [], config = copia(PADROES), eventos = {}, anexos = {}, orcamentos = {}, pausas = {};
  let numero = 1001, proximo = 1, proximoPrestador = 1, proximoOrcamento = 1, proximoEvento = 1, proximoAnexo = 1;
  const arquivos = new Map();
  let falhasUpload = 0;
  const requisicoes = new Map();
  const instante = () => new Date(agora()).toISOString();
  const locacao = n => locacoes.find(l => l.id === Number(n));
  const porContato = n => locacoes.filter(l => !l.encerrada_em && l.contatos.some(c => c.contato_id === Number(n))).map(l => l.id);
  function evento(c, tipo, autor, detalhe = {}, texto = null, notificou_cliente = false) {
    const e = { id: proximoEvento++, chamado_id: c.id, tipo, autor, detalhe: copia(detalhe), texto, notificou_cliente, em: instante() };
    (eventos[c.id] ||= []).push(e); c.atualizado_em = instante(); return e;
  }
  function prazos(c) {
    const s = config.sla[c.prioridade], base = Date.parse(c.criado_em);
    c.sla.prazo_resposta_em = new Date(base + s.resposta_min * 60000).toISOString();
    c.sla.prazo_solucao_em = new Date(base + s.solucao_h * 3600000 + (pausas[c.id] || 0)).toISOString();
  }
  function objeto(c) {
    const l = locacao(c.locacao_id);
    return copia({ ...c, imovel: { codigo: l.imovel_codigo ?? null, titulo: l.imovel_titulo, endereco: l.imovel_endereco ?? null,
      bairro: l.imovel_bairro ?? null, cidade: l.imovel_cidade ?? null, fora_do_catalogo: !l.imovel_codigo },
    contrato_numero: l.contrato_numero ?? null, anexos_total: anexos[c.id]?.length || 0, orcamentos_total: orcamentos[c.id]?.length || 0 });
  }
  function validarChamado(d, novo) {
    const campos = {};
    if ((novo || 'titulo' in d) && !texto(d.titulo)) campos.titulo = 'Informe o título.';
    if ((novo || 'categoria' in d) && !CATEGORIAS.includes(d.categoria)) campos.categoria = 'Categoria inválida.';
    if ('prioridade' in d && !Object.hasOwn(PADROES.sla, d.prioridade)) campos.prioridade = 'Prioridade inválida.';
    if ('origem' in d && !['atendimento', 'gestao', 'ia'].includes(d.origem)) campos.origem = 'Origem inválida.';
    for (const [campo, chaveId, textos] of [['solicitante', 'contato_id', ['nome', 'telefone']], ['atendente', 'user_id', ['nome']], ['atendimento', 'chat_id', ['protocolo', 'canal', 'fila', 'iniciado_em']]]) {
      const v = d[campo];
      if (v == null && !(novo && campo === 'solicitante')) continue;
      if (!v || typeof v !== 'object') { campos[campo] = 'Informe os dados em um objeto.'; continue; }
      if (v[chaveId] != null && !positivo(v[chaveId]) || campo === 'atendente' && !positivo(v[chaveId])) campos[campo + '.' + chaveId] = 'Informe um identificador inteiro positivo.';
      for (const chave of textos) {
        if (v[chave] != null && typeof v[chave] !== 'string' || chave === 'nome' && !texto(v[chave])) campos[campo + '.' + chave] = chave === 'nome' ? 'Informe um texto não vazio.' : 'Informe um texto.';
      }
      if (campo === 'atendimento') {
        if (v.chat_id == null && !texto(v.protocolo)) campos.atendimento = 'Informe chat_id ou protocolo do atendimento.';
        if (typeof v.iniciado_em === 'string' && (!iso(v.iniciado_em) || new Date(v.iniciado_em).getUTCFullYear() < 2000 || new Date(v.iniciado_em).getUTCFullYear() > 2100)) campos['atendimento.iniciado_em'] = 'Informe uma data e hora ISO válida, com fuso.';
      }
    }
    if ('locacao_id' in d && !positivo(d.locacao_id) || novo && !locacao(d.locacao_id)) campos.locacao_id = 'Locação inválida.';
    if (d.acesso != null && (typeof d.acesso !== 'object' || 'sem_cliente' in d.acesso && typeof d.acesso.sem_cliente !== 'boolean')) campos.acesso = 'Acesso inválido.';
    if (d.quem_paga != null && !['proprietario', 'inquilino', 'imobiliaria'].includes(d.quem_paga)) campos.quem_paga = 'Pagador inválido.';
    if (d.valor_estimado_centavos != null && !dinheiro(d.valor_estimado_centavos)) campos.valor_estimado_centavos = 'Valor inválido.';
    if ('repasse' in d && typeof d.repasse !== 'boolean') campos.repasse = 'Informe sim ou não.';
    validar(campos);
  }
  function adicionarAnexos(c, lista, autor) {
    if (!Array.isArray(lista) || lista.some(a => !texto(a?.file_ref) || a.origem && !['atendimento', 'upload'].includes(a.origem))) erro(422, 'dados_invalidos', { anexos: 'Anexo inválido.' });
    const arr = anexos[c.id] ||= [];
    for (const a of lista) if (!arr.some(x => x.file_ref === a.file_ref)) {
      const salvo = { id: proximoAnexo++, chamado_id: c.id, file_ref: a.file_ref, nome: a.nome ?? null, mimetype: a.mimetype ?? null,
        origem: a.origem || 'atendimento', miniatura_base64: null, criado_por: autor, criado_em: instante() };
      arr.push(salvo); evento(c, 'anexo', autor, { file_ref: a.file_ref });
    }
    return arr;
  }
  const editaveis = ['titulo', 'descricao', 'categoria', 'prioridade', 'atendente', 'atendimento', 'acesso', 'quem_paga', 'valor_estimado_centavos', 'repasse', 'solicitante'];
  function criar(d, autor) {
    validarChamado(d, true);
    if (locacao(d.locacao_id).encerrada_em) erro(409, 'locacao_encerrada');
    const c = { id: proximo++, numero: numero++, locacao_id: d.locacao_id, titulo: d.titulo, descricao: d.descricao ?? null,
      categoria: d.categoria, prioridade: d.prioridade || 'normal', origem: d.origem || 'gestao', solicitante: copia(d.solicitante),
      atendente: d.atendente ?? null, atendimento: d.atendimento ?? null, acesso: { disponibilidade: null, sem_cliente: false, chaves: null, ...d.acesso },
      quem_paga: null, valor_estimado_centavos: null, repasse: false, criado_por: autor, criado_em: instante(), atualizado_em: instante(),
      status: 'novo', status_desde: instante(), concluido_em: null, cancelado_em: null, motivo_cancelamento: null,
      sla: { prazo_resposta_em: null, prazo_solucao_em: null, primeira_resposta_em: null, pausado: false, pausado_desde: null },
      prestador: null, visita: { inicio: null, fim: null }, aprovacao: { status: 'nao_necessaria', enviada_em: null, resposta_em: null, por: null, canal: null, observacao: null } };
    prazos(c); chamados.push(c); evento(c, 'criou', autor); adicionarAnexos(c, d.anexos || [], autor); return c;
  }
  function avaliarAlcada(c, autor, novaReferencia = false) {
    const escolhido = (orcamentos[c.id] || []).find(o => o.escolhido);
    const valor = escolhido?.valor_centavos ?? c.valor_estimado_centavos;
    const necessaria = c.quem_paga === 'proprietario' && valor > config.alcada_centavos;
    const status = necessaria ? (novaReferencia || c.aprovacao.status === 'nao_necessaria' ? 'pendente' : c.aprovacao.status) : 'nao_necessaria';
    if (novaReferencia || status !== c.aprovacao.status) {
      c.aprovacao = { status, enviada_em: null, resposta_em: null, por: null, canal: null, observacao: null };
      evento(c, 'aprovacao', autor, { status });
    }
    if (status === 'pendente' && ['agendado', 'execucao'].includes(c.status)) mudarStatus(c, 'aprovacao', 'alçada excedida após alteração', autor);
  }
  function mudarStatus(c, status, motivo, autor) {
    if (!STATUS.includes(status)) erro(422, 'dados_invalidos', { status: 'Status inválido.' });
    if (!aberto(c) && status !== 'triagem') erro(409, 'chamado_encerrado');
    if (status === 'aprovacao' && !orcamentos[c.id]?.some(o => o.escolhido)) erro(422, 'sem_orcamento_escolhido');
    if (['agendado', 'execucao'].includes(status) && c.aprovacao.status === 'pendente') erro(409, 'aprovacao_pendente');
    if (['agendado', 'execucao'].includes(status) && c.aprovacao.status === 'recusada') erro(409, 'aprovacao_recusada');
    if (status === 'agendado' && !c.visita.inicio) erro(422, 'sem_visita');
    const de = c.status, em = instante();
    if (de !== status && de === 'aprovacao' && c.sla.pausado) {
      if (!['concluido', 'cancelado'].includes(status)) {
        const pausa = agora() - Date.parse(c.sla.pausado_desde);
        pausas[c.id] = (pausas[c.id] || 0) + pausa;
        c.sla.prazo_solucao_em = new Date(Date.parse(c.sla.prazo_solucao_em) + pausa).toISOString();
      }
      c.sla.pausado = false; c.sla.pausado_desde = null;
      evento(c, 'sla', autor, { acao: 'retomou' });
    }
    if (de !== status && status === 'aprovacao') {
      c.sla.pausado = true; c.sla.pausado_desde = em; evento(c, 'sla', autor, { acao: 'pausou' });
    }
    c.status = status; c.status_desde = em;
    c.sla.primeira_resposta_em ||= em;
    c.concluido_em = status === 'concluido' ? em : null; c.cancelado_em = status === 'cancelado' ? em : null;
    c.motivo_cancelamento = status === 'cancelado' ? motivo || null : null;
    evento(c, 'status', autor, { de, para: status, motivo: motivo ?? null });
  }
  function resumo(rows) {
    return { abertos: rows.filter(aberto).length,
      prazo_estourado: rows.filter(c => aberto(c) && ((!c.sla.pausado && Date.parse(c.sla.prazo_solucao_em) < agora()) ||
        (!c.sla.primeira_resposta_em && Date.parse(c.sla.prazo_resposta_em) < agora()))).length,
      aguardando_proprietario: rows.filter(c => aberto(c) && c.aprovacao.status === 'pendente').length,
      emergencia_sem_triagem: rows.filter(c => c.status === 'novo' && c.prioridade === 'emergencia').length };
  }
  function executar(method, rota, q, d, autor) {
    const get = method === 'GET', post = method === 'POST';
    const resposta = (corpo, status = 200) => ({ status, corpo: copia(corpo) });
    const upload = rota.match(/^\/chamados\/(\d+)\/anexos\/upload$/);
    const arquivo = rota.match(/^\/chamados\/(\d+)\/anexos\/([^/]+)\/arquivo$/);
    if (upload && post) {
      const campos = {}, tipos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (d.nome !== undefined && typeof d.nome !== 'string') campos.nome = 'Informe um nome em texto.';
      if (!tipos.includes(d.mimetype)) campos.mimetype = 'Escolha uma imagem JPEG, PNG, WEBP ou GIF.';
      const base64 = typeof d.dados_base64 === 'string' && d.dados_base64;
      const bytes = base64 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) ? Buffer.from(base64, 'base64') : null;
      if (!bytes || bytes.toString('base64') !== base64 || bytes.length < 1 || bytes.length > 2 * 1024 * 1024) campos.dados_base64 = 'Informe base64 válido de 1 byte a 2 MiB, sem prefixo.';
      if (bytes && !campos.dados_base64) {
        const tipo = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' :
          bytes.subarray(0, 4).equals(Buffer.from([137,80,78,71])) ? 'image/png' :
          /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('latin1')) ? 'image/gif' :
          bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
        if (!tipo || tipo !== d.mimetype) campos.dados_base64 = 'Os bytes iniciais não correspondem ao tipo da imagem.';
      }
      if (d.miniatura_base64 != null) {
        const mini = d.miniatura_base64;
        const b = typeof mini === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(mini) ? Buffer.from(mini, 'base64') : null;
        if (!b || !b.length || b.length > 40 * 1024 || b.toString('base64') !== mini || b[0] !== 255 || b[1] !== 216 || b[2] !== 255) campos.miniatura_base64 = 'Informe uma miniatura JPEG em base64 válido de até 40 KB, sem prefixo.';
      }
      validar(campos);
      const c = chamados.find(c => c.id === Number(upload[1]));
      if (!c) erro(404, 'nao_encontrado');
      if (falhasUpload > 0) { falhasUpload--; erro(500, 'upload_indisponivel'); }
      const file_ref = 'upload:' + createHash('sha256').update(bytes).digest('hex'), lista = anexos[c.id] ||= [];
      const existente = lista.find(a => a.file_ref === file_ref);
      if (existente) return resposta({ ok: true, repetido: true, anexo: existente });
      if (lista.filter(a => a.origem === 'upload').length >= 20) erro(409, 'limite_anexos');
      const nome = (d.nome || '').trim().replace(/[\\/"'<>\x00-\x1f\x7f-\x9f]/g, '_').slice(0, 120) || 'foto';
      const a = { id: proximoAnexo++, chamado_id: c.id, file_ref, nome, mimetype: d.mimetype,
        origem: 'upload', miniatura_base64: d.miniatura_base64 ?? null, tamanho: bytes.length, criado_por: autor, criado_em: instante() };
      lista.push(a); arquivos.set(a.id, bytes.toString('base64')); evento(c, 'anexo', autor, { arquivos: [file_ref] });
      return resposta({ ok: true, repetido: false, anexo: a });
    }
    if (arquivo && get) {
      const a = anexos[Number(arquivo[1])]?.find(a => a.id === Number(arquivo[2]) && a.origem === 'upload' && arquivos.has(a.id));
      if (!a) erro(404, 'anexo_nao_encontrado');
      return { ...resposta({ mimetype: a.mimetype, nome: a.nome, tamanho: a.tamanho, dados_base64: arquivos.get(a.id) }), headers: { 'Cache-Control': 'no-store' } };
    }
    if (rota === '/config/manutencao') {
      if (get) return resposta(config);
      if (!post) return null;
      const campos = {};
      if ('alcada_centavos' in d && !positivo(d.alcada_centavos)) campos.alcada_centavos = 'Informe um inteiro positivo.';
      if ('sla' in d) {
        if (!d.sla || typeof d.sla !== 'object' || Array.isArray(d.sla)) campos.sla = 'SLA inválido.';
        else for (const [k, v] of Object.entries(d.sla)) {
          if (!Object.hasOwn(PADROES.sla, k) || !v || !positivo(v.resposta_min) || !positivo(v.solucao_h)) campos.sla = 'Informe prazos inteiros positivos por prioridade.';
        }
      }
      validar(campos);
      if ('alcada_centavos' in d) config.alcada_centavos = d.alcada_centavos;
      if (d.sla) Object.assign(config.sla, copia(d.sla));
      return resposta({ ok: true, ...config });
    }
    if (rota === '/prestadores' && get) {
      const rows = prestadores.filter(p => (!q.get('categoria') || p.categorias.includes(q.get('categoria'))) &&
        (q.get('ativos') !== '1' && q.get('ativo') !== '1' || p.ativo) && normalizar(p.nome + ' ' + p.telefone + ' ' + p.email).includes(normalizar(q.get('busca'))));
      rows.sort((a, b) => a.nome.localeCompare(b.nome));
      return resposta({ rows: rows.slice(0, Number(q.get('por_pagina')) || rows.length), total: rows.length });
    }
    const pm = rota.match(/^\/prestadores(?:\/(\d+)(?:\/(ativar|desativar))?)?$/);
    if (pm && post) {
      let p = pm[1] && prestadores.find(p => p.id === Number(pm[1]));
      if (pm[1] && !p) erro(404, 'nao_encontrado');
      if (pm[2]) { p.ativo = pm[2] === 'ativar'; p.atualizado_em = instante(); return resposta({ ok: true, prestador: p }); }
      const campos = {};
      if (!texto(d.nome)) campos.nome = 'Informe o nome.';
      if (d.categorias !== undefined && (!Array.isArray(d.categorias) || d.categorias.some(c => !CATEGORIAS.includes(c)))) campos.categorias = 'Categorias inválidas.';
      validar(campos);
      if (!p) { p = { id: proximoPrestador++, categorias: [], telefone: null, email: null, observacao: null, ativo: true, criado_por: autor, criado_em: instante() }; prestadores.push(p); }
      for (const k of ['nome', 'categorias', 'telefone', 'email', 'observacao']) if (k in d) p[k] = copia(d[k]);
      p.atualizado_em = instante(); return resposta({ ok: true, prestador: p });
    }
    const relacionados = rota.match(/^\/(locacoes|contatos)\/(\d+)\/chamados$/);
    if (relacionados && get) {
      const ids = relacionados[1] === 'contatos' ? porContato(relacionados[2]) : [Number(relacionados[2])];
      const todos = chamados.filter(c => ids.includes(c.locacao_id));
      const rows = todos.filter(c => q.get('abertos') !== '1' || aberto(c)).sort((a, b) => b.numero - a.numero).map(objeto);
      return resposta({ rows, total: rows.length, ...(relacionados[1] === 'contatos' ? { resumo: { abertos: todos.filter(aberto).length, concluidos: todos.filter(c => c.status === 'concluido').length } } : {}) });
    }
    if (rota === '/atendimentos/vinculados' && get) {
      const ids = porContato(q.get('contato_id')), rows = [];
      for (const c of chamados.filter(c => ids.includes(c.locacao_id) && c.atendimento)) {
        let r = rows.find(r => c.atendimento.chat_id != null ? r.chat_id === c.atendimento.chat_id : r.chat_id == null && r.protocolo === c.atendimento.protocolo);
        if (!r) { r = { ...copia(c.atendimento), chamados: [] }; rows.push(r); }
        r.chamados.push({ id: c.id, numero: c.numero, titulo: c.titulo, status: c.status });
      }
      return resposta({ rows });
    }
    if (rota === '/chamados' && get) {
      const rows = chamados.filter(c => (!q.get('busca') || normalizar([c.numero, c.titulo, locacao(c.locacao_id).imovel_titulo, c.solicitante.nome].join(' ')).includes(normalizar(q.get('busca')))) &&
        ['status', 'prioridade', 'categoria', 'locacao_id'].every(k => !q.get(k) || String(c[k]) === q.get(k)) &&
        (!q.get('imovel_codigo') || locacao(c.locacao_id).imovel_codigo === q.get('imovel_codigo')) &&
        (!q.get('contato_id') || porContato(q.get('contato_id')).includes(c.locacao_id)) &&
        (!q.get('atendente_user_id') || String(c.atendente?.user_id) === q.get('atendente_user_id')) && (q.get('abertos') !== '1' || aberto(c))).sort((a, b) => b.numero - a.numero);
      const pageSize = Math.min(100, Math.max(1, Math.floor(Number(q.get('por_pagina')) || 30))), pagina = Math.max(1, Math.floor(Number(q.get('pagina')) || 1));
      return resposta({ rows: rows.slice((pagina - 1) * pageSize, pagina * pageSize).map(objeto), total: rows.length, pageSize, resumo: resumo(rows) });
    }
    if (rota === '/chamados' && post) return resposta({ ok: true, chamado: objeto(criar(d, autor)) }, 201);
    const cm = rota.match(/^\/chamados\/(\d+)(?:\/(status|notas|anexos|prestador|visita|orcamentos|aprovacao)(?:\/(\d+)\/(escolher|apagar))?)?$/);
    if (!cm || !get && !post) return null;
    const c = chamados.find(c => c.id === Number(cm[1])), acao = cm[2];
    if (!c) erro(404, 'nao_encontrado');
    if (get && !acao) return resposta({ chamado: objeto(c), locacao: { ...copia(locacao(c.locacao_id)), chamados_abertos: contarAbertos(c.locacao_id) },
      eventos: eventos[c.id] || [], anexos: anexos[c.id] || [], orcamentos: orcamentos[c.id] || [] });
    if (!post) return null;
    if (acao === 'status') { mudarStatus(c, d.status, d.motivo, autor); return resposta({ ok: true, chamado: objeto(c) }); }
    // Notas e anexos continuam disponíveis no histórico dos chamados encerrados.
    if (acao === 'notas') {
      if (!texto(d.texto) || 'notificou_cliente' in d && typeof d.notificou_cliente !== 'boolean') erro(422, 'dados_invalidos', { texto: 'Informe a nota.' });
      c.sla.primeira_resposta_em ||= instante();
      return resposta({ ok: true, evento: evento(c, 'nota', autor, {}, d.texto, d.notificou_cliente === true) }, 201);
    }
    if (acao === 'anexos') return resposta({ ok: true, anexos: adicionarAnexos(c, d.anexos, autor) });
    if (!aberto(c)) erro(409, 'chamado_encerrado');
    if (!acao) {
      if ('valor_estimado_centavos' in d && (orcamentos[c.id] || []).some(o => o.escolhido)) erro(422, 'dados_invalidos', { valor_estimado_centavos: 'Definido pelo orçamento escolhido.' });
      validarChamado(d, false);
      const alterados = editaveis.filter(k => k in d && JSON.stringify(c[k]) !== JSON.stringify(d[k]));
      if (!alterados.length) return resposta({ ok: true, chamado: objeto(c) });
      const anterior = JSON.stringify(c.atendimento);
      for (const k of alterados) c[k] = copia(d[k]);
      if (alterados.includes('prioridade')) prazos(c);
      if (alterados.includes('quem_paga') || alterados.includes('valor_estimado_centavos')) avaliarAlcada(c, autor, alterados.includes('quem_paga') || c.aprovacao.status !== 'recusada');
      evento(c, 'atualizou', autor, { campos: alterados });
      if (anterior !== JSON.stringify(c.atendimento)) evento(c, 'vinculou_atendimento', autor, { atendimento: c.atendimento });
    }
    if (acao === 'prestador') {
      const p = prestadores.find(p => p.id === d.prestador_id);
      if (d.prestador_id !== null && !p) erro(422, 'dados_invalidos', { prestador_id: 'Prestador inválido.' });
      c.prestador = p ? { id: p.id, nome: p.nome } : null; evento(c, 'prestador', autor, { prestador_id: d.prestador_id });
    }
    if (acao === 'visita') {
      if (d.inicio !== null && (!iso(d.inicio) || d.fim != null && (!iso(d.fim) || Date.parse(d.fim) < Date.parse(d.inicio)))) erro(422, 'dados_invalidos', { inicio: 'Visita inválida.' });
      c.visita = { inicio: d.inicio, fim: d.inicio ? d.fim ?? null : null }; evento(c, 'atualizou', autor, { visita: c.visita });
    }
    if (acao === 'orcamentos') {
      const arr = orcamentos[c.id] ||= [];
      if (cm[3]) {
        const o = arr.find(o => o.id === Number(cm[3]));
        if (!o) erro(404, 'nao_encontrado');
        if (cm[4] === 'apagar') {
          if (o.escolhido && (!['novo', 'triagem', 'orcamento'].includes(c.status) || (eventos[c.id] || []).some(ev => ev.tipo === 'status' && ['aprovacao', 'agendado', 'execucao', 'concluido', 'cancelado'].includes(ev.detalhe.para)))) erro(409, 'orcamento_escolhido');
          arr.splice(arr.indexOf(o), 1);
          if (o.escolhido) { c.valor_estimado_centavos = null; if (c.prestador?.id === o.prestador_id) c.prestador = null; avaliarAlcada(c, autor); }
        } else {
          if (o.escolhido) return resposta({ ok: true, chamado: copia(c) });
          arr.forEach(x => { x.escolhido = x.id === o.id; });
          if (o.valor_centavos != null) c.valor_estimado_centavos = o.valor_centavos;
          c.prestador = o.prestador_id ? { id: o.prestador_id, nome: o.prestador_nome } : null;
          avaliarAlcada(c, autor, true);
        }
        evento(c, 'orcamento', autor, { orcamento_id: o.id, acao: cm[4] });
      } else {
        let p = prestadores.find(p => p.id === d.prestador_id);
        if (d.valor_centavos != null && !dinheiro(d.valor_centavos) || d.prazo_dias != null && !dinheiro(d.prazo_dias) ||
          d.prestador_id != null && !p || !p && !texto(d.prestador_nome) || d.visita_em != null && !iso(d.visita_em)) erro(422, 'dados_invalidos', { orcamento: 'Orçamento inválido.' });
        if (!p) {
          const chave = v => normalizar(v).trim().replace(/\s+/g, ' ');
          p = prestadores.find(p => chave(p.nome) === chave(d.prestador_nome));
          if (!p) { p = { id: proximoPrestador++, nome: d.prestador_nome.trim(), ativo: true, categorias: [], criado_por: autor, criado_em: instante() }; prestadores.push(p); }
        }
        const o = { id: proximoOrcamento++, chamado_id: c.id, prestador_id: p?.id ?? null, prestador_nome: p?.nome || d.prestador_nome,
          valor_centavos: d.valor_centavos ?? null, prazo_dias: d.prazo_dias ?? null, visita_em: d.visita_em ?? null, observacao: d.observacao ?? null,
          escolhido: false, criado_por: autor, criado_em: instante() };
        arr.push(o); evento(c, 'orcamento', autor, { orcamento_id: o.id }); return resposta({ ok: true, orcamento: o }, 201);
      }
    }
    if (acao === 'aprovacao') {
      avaliarAlcada(c, autor);
      if (c.aprovacao.status === 'recusada' && d.acao === 'aprovada') erro(409, 'aprovacao_recusada');
      if (c.aprovacao.status === 'nao_necessaria') erro(409, 'aprovacao_nao_necessaria');
      if (!['enviada', 'aprovada', 'recusada'].includes(d.acao)) erro(422, 'dados_invalidos', { acao: 'Ação inválida.' });
      if (d.acao === 'enviada') c.aprovacao.enviada_em = instante();
      else { c.aprovacao.status = d.acao; c.aprovacao.resposta_em = instante(); c.aprovacao.por = d.por ?? null; }
      c.aprovacao.canal = d.canal ?? null; c.aprovacao.observacao = d.observacao ?? null;
      if (d.acao === 'recusada' && c.status !== 'aprovacao') mudarStatus(c, 'aprovacao', 'Orçamento recusado', autor);
      evento(c, 'aprovacao', autor, { acao: d.acao });
    }
    return resposta({ ok: true, chamado: objeto(c) });
  }
  function contarAbertos(id) { return chamados.filter(c => c.locacao_id === Number(id) && aberto(c)).length; }
  function responder(method, rota, q = new URLSearchParams(), d = {}, autor = 'Agente Demonstração') {
    const chave = method + ' ' + rota; requisicoes.set(chave, (requisicoes.get(chave) || 0) + 1);
    // Uma recusa não pode deixar meia gravação, nem mesmo no simulador.
    const anterior = copia({ chamados, prestadores, config, eventos, anexos, orcamentos, pausas, numero, proximo, proximoPrestador, proximoOrcamento, proximoEvento, proximoAnexo });
    try {
      if (!d || typeof d !== 'object' || Array.isArray(d)) erro(422, 'dados_invalidos', { corpo: 'Informe um objeto.' });
      return executar(method, rota, q, d, autor);
    } catch (e) {
      ({ chamados, prestadores, config, eventos, anexos, orcamentos, pausas, numero, proximo, proximoPrestador, proximoOrcamento, proximoEvento, proximoAnexo } = anterior);
      if (e.status) return e;
      throw e;
    }
  }
  if (!semFixtures) {
    for (let i = 0; i < 4; i++) responder('POST', '/prestadores', undefined, { nome: 'Prestador Demonstração ' + (i + 1), categorias: [CATEGORIAS[i]], telefone: '00000000000', email: 'prestador' + i + '@example.invalid' });
    STATUS.forEach((status, i) => {
      const l = locacoes[i % locacoes.length];
      const c = criar({ locacao_id: l.id, titulo: 'Manutenção Demonstração ' + (i + 1), descricao: 'Relato sintético sem correspondência real.',
        categoria: CATEGORIAS[i], prioridade: ['emergencia', 'alta', 'normal'][i % 3],
        solicitante: { contato_id: i === 0 ? 9903 : l.contatos[0].contato_id, nome: i === 0 ? 'Proprietário Demonstração' : l.contatos[0].nome, telefone: '00000000000' },
        atendente: { user_id: 9999, nome: 'Agente Demonstração' }, atendimento: { chat_id: 8801 + i % 3, protocolo: 'DEMO-P' + (8801 + i % 3), canal: 'WhatsApp', fila: 'Fila Demonstração', iniciado_em: instante() } }, 'Agente Demonstração');
      if (i === 0) { c.criado_em = new Date(agora() - 200 * 3600000).toISOString(); prazos(c); }
      if (status === 'aprovacao') {
        c.quem_paga = 'proprietario';
        const o = responder('POST', '/chamados/' + c.id + '/orcamentos', undefined, { prestador_id: 1, valor_centavos: 50000 }).corpo.orcamento;
        responder('POST', '/chamados/' + c.id + '/orcamentos/' + o.id + '/escolher', undefined, {});
      }
      if (['agendado', 'execucao'].includes(status)) c.visita = { inicio: new Date(agora() + 86400000).toISOString(), fim: null };
      if (status !== 'novo') mudarStatus(c, status, 'Exemplo sintético', 'Agente Demonstração');
    });
  }
  return { responder, contarAbertos, requisicoes, falharUpload: n => { falhasUpload = n; } };
}
