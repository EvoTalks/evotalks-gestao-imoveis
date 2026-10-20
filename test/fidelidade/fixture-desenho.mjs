/**
 * Fixture fixado a partir do DOM vivo em 19/10/2026, sem copiar HTML/CSS.
 * Agora: sáb 17/10/2026 20:41 -03, determinado por "atualizado às 20:41",
 * 14/11 menos "28 dias", prazo era 15/10 + "atrasada há 2d" e 1042 aberta
 * 17/10 14:20 + "há 6 horas" (arredondamento). "parada há 4d" => 13/10;
 * "vence em 6h" => 18/10 02:41; visita qua 21/10 é coerente com 2026.
 * Inconsistências do desenho são registradas em LIMITACOES, nunca corrigidas:
 * hoje às 21:12 é futuro; lista 1042 "1d 4h" diverge do cockpit ter 20/10 15:05.
 * Date é injetado ANTES dos scripts; intervalos desativados, timeouts funcionais
 * preservados. IDs técnicos de contatos/locações não são dados do cliente.
 */
import dados from './dados-desenho.json' with { type: 'json' };
import { AGORA } from './ambiente.mjs';
export { AGORA };
export const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const centavos = v => Math.round(Number(String(v).replace(/[^\d,]/g, '').replace(',', '.')) * 100);
const isoData = d => d.split('/').reverse().join('-');
const dataHora = (d, hora = '00:00') => isoData(d.length === 5 ? d + '/2026' : d) + 'T' + hora + ':00-03:00';
const campo = (q, rotulo) => dados[q].campos.find(c => c.rotulo === rotulo)?.valor ?? '';
const status = { Novo: 'novo', Triagem: 'triagem', Orçamento: 'orcamento', Aprovação: 'aprovacao', Agendado: 'agendado', 'Em execução': 'execucao', Concluído: 'concluido', Cancelado: 'cancelado' };
const garantias = { Fiador: 'fiador', Caução: 'caucao', 'Seguro fiança': 'seguro_fianca', 'Título de capitalização': 'titulo_capitalizacao' };
export const LIMITACOES = [
  'Horários incompatíveis: agora 17/10 20:41; Novo mostra hoje às 21:12 (futuro).',
  '1042: lista vence em 1d 4h; cockpit ter 20/10 15:05. Fixture usa o prazo absoluto do cockpit; abertura 14:20 e triagem 15:05 preservadas.',
  '1049/1044: frases vence em 6h/3h não correspondem a 72h desde as aberturas mostradas; fixture deriva os prazos das frases relativas.',
  'Desenho mostra 1757 imóveis mas só fornece seis linhas; fixture não inventa os outros 1751. Também não fornece as definições dos 11 campos em uso.',
  '1042 já excede a alçada e pertence ao proprietário: o contrato marca aprovação pendente mesmo antes de enviar, somando três pendentes; o desenho resume só dois.',
  'Fotos do desenho são tiles ilustrados, sem bytes de fotografia/vídeo; fixture fornece apenas os três nomes, não inventa imagens.',
  'Desenho confirma e mostra sucesso na mesma tela; extensão 0.24.0 apresenta estados sucessivos. Captura principal é a confirmação, sucesso é capturado separadamente.',
  'Novo deriva o título da descrição; Editar mantém o título em Mais opções.',
  'Histórico do portal não guarda valores sugeridos na abertura, decisão de quem paga ou SLA no evento de status; esses subtextos são omitidos. O desenho fornece dois nomes dos cinco prestadores de Hidráulica; os outros três registros da fixture têm apenas ID técnico e categoria, sem nome nem situação inventados; a contagem usa a lista completa do contrato.',
  'Região do botão Abrir chamado mascarada só no cockpit Chamados por pedido explícito; nenhuma outra região é mascarada.'
];
export const locacoes = dados.locados.tabelas[0].map((r, i) => ({
  id: i + 1, imovel_codigo: /cód\./.test(r[0].ajuda) ? '535' + r[0].ajuda.match(/\d+/)[0] : null,
  imovel_titulo: r[0].principal, contrato_numero: r[3].principal, garantia: garantias[r[3].ajuda],
  inicio: isoData(r[4].principal.split(' a ')[0]), fim: isoData(r[4].principal.split(' a ')[1]),
  valor_aluguel_centavos: centavos(r[5].principal), origem: normalizar(r[6].principal),
  dia_vencimento: r[0].principal === 'Ed. Jasmim · ap. 304' ? Number(campo('marcar', 'Dia do vencimento')) : null,
  observacao: null, encerrada_em: null,
  contatos: [{ contato_id: 100 + i, papel: 'locatario', nome: r[1].principal, telefone: r[1].ajuda },
    { contato_id: 200 + i, papel: 'proprietario', nome: r[2].principal }],
  chamados_abertos: Number.parseInt(r[7].principal) || 0,
  vence_em_dias: Math.round((Date.parse(isoData(r[4].principal.split(' a ')[1])) - Date.parse('2026-10-17')) / 86400000)
}));
export const contatos = locacoes.flatMap(l => l.contatos.map(c => ({ id: c.contato_id, name: c.nome, phone: c.telefone || '',
  ...(c.nome === 'Carla Menezes' ? { document: '***.456.789-**' } : {}) })));
export const produtos = dados.imoveis.tabelas[0].map((r, i) => ({ id: i + 1, internalcode: r[0].ajuda,
  name: r[1].principal, category: [r[1].ajuda, r[2].principal].join(' > '), brand: '', value: centavos(r[3].principal) }));
export const usuarios = ['Marina', 'Tiago'].map((name, i) => ({ id: 531 + i, name, type: 2 }));
export const formulario = { descricao: campo('novo', 'Descrição'), categoria: normalizar(campo('novo', 'Categoria')), prioridade: normalizar(campo('novo', 'Prioridade')),
  disponibilidade: campo('novo', 'Quando dá para entrar'), sem_cliente: false };
export const chamados = dados.lista.tabelas[0].map(r => {
  const l = locacoes.find(l => l.imovel_titulo === r[2].principal);
  if (!l) throw new Error('Imóvel sem locação no fixture: ' + r[2].principal);
  const [data, hora] = r[0].ajuda.split(' · '), [canal, atendente] = r[3].ajuda.includes(' · ') ? r[3].ajuda.split(' · ') : [null, r[3].ajuda];
  const criado = dataHora(data, hora), numero = Number(r[0].principal), s = status[r[7].principal];
  let prazo = null, visita = null;
  if (numero === 1042) prazo = dataHora('20/10', '15:05');
  if (/vence em \dh/.test(r[5].principal)) prazo = new Date(Date.parse(AGORA) + Number(r[5].principal.match(/\d+/)[0]) * 3600000).toISOString();
  if (numero === 1012) prazo = dataHora('15/10');
  if ([1018,1031].includes(numero)) prazo = dataHora('21/10', '09:00');
  if (numero === 1010) prazo = dataHora('17/10');
  if ([1031,1042].includes(numero)) visita = dataHora(numero === 1031 ? '21/10' : '20/10', numero === 1031 ? '09:00' : '14:00');
  return { id: numero, numero, locacao_id: l.id, titulo: r[1].principal, descricao: numero === 1042 ? campo('modal', 'O que a cliente contou') : null,
    categoria: normalizar(r[1].ajuda.split(' · ')[0]), prioridade: normalizar(r[4].principal), status: s,
    origem: /via IA/.test(r[1].ajuda) ? 'ia' : 'gestao', criado_em: criado, atualizado_em: numero === 1042 ? dataHora('17/10', '17:25') : criado,
    criado_por: /via IA/.test(r[1].ajuda) ? 'Williane (IA)' : atendente,
    status_desde: numero === 1040 ? dataHora('13/10') : numero === 1035 ? dataHora('16/10') : criado,
    concluido_em: s === 'concluido' ? dataHora('02/09') : null, cancelado_em: s === 'cancelado' ? dataHora('10/10') : null,
    solicitante: { contato_id: l.contatos[0].contato_id, nome: r[2].ajuda, telefone: l.contatos[0].telefone },
    atendente: { user_id: usuarios.find(u => u.name === atendente)?.id, nome: atendente },
    atendimento: r[3].principal.startsWith('#') ? { chat_id: Number(r[3].principal.slice(1)), canal, protocolo: null, fila: 'Fila Locação', iniciado_em: numero === 1042 ? dataHora('17/10', '14:08') : null } : null,
    imovel: { codigo: l.imovel_codigo, titulo: l.imovel_titulo, fora_do_catalogo: !l.imovel_codigo }, contrato_numero: l.contrato_numero,
    quem_paga: numero === 1042 || s === 'aprovacao' ? 'proprietario' : null,
    valor_estimado_centavos: /R\$/.test(r[6].ajuda) ? centavos(r[6].ajuda) : null,
    prestador: !['a definir', '2 de 3 cotações', '—'].includes(r[6].principal) ? { id: numero, nome: r[6].principal } : numero === 1042 ? { id: 1, nome: campo('modal', 'Prestador') } : null,
    visita: { inicio: visita, fim: visita ? dataHora(numero === 1031 ? '21/10' : '20/10', numero === 1031 ? '11:00' : '16:00') : null },
    acesso: { disponibilidade: numero === 1042 ? campo('modal', 'Quando dá para entrar') : null, sem_cliente: false, chaves: null },
    sla: { prazo_resposta_em: numero === 1051 ? criado : null, prazo_solucao_em: prazo, primeira_resposta_em: s === 'novo' ? null : numero === 1042 ? dataHora('17/10', '15:05') : criado,
      pausado: s === 'aprovacao', pausado_desde: s === 'aprovacao' ? dataHora(numero === 1040 ? '13/10' : '16/10') : null },
    aprovacao: { status: s === 'aprovacao' || numero === 1042 ? 'pendente' : 'nao_necessaria', enviada_em: null },
    anexos_total: numero === 1042 ? 3 : 0, orcamentos_total: numero === 1042 ? 2 : 0, repasse: numero === 1042
  };
});
export const orcamentos = dados.modal.tabelas[0].slice(0,2).map((r,i) => ({ id: i+1, chamado_id: 1042, prestador_id: i+1,
  prestador_nome: r[0].principal, valor_centavos: centavos(r[1].principal), prazo_dias: Number.parseInt(r[2].principal),
  visita_em: dataHora(i ? '21/10' : '20/10'), escolhido: i === 0, observacao: null }));
export const totalPrestadoresHidraulica = Number.parseInt(dados.modal.folhas.find(v=>/prestadores de Hidráulica cadastrados/.test(v)));
export const anexos = dados.modal.folhas.filter(v => /\.jpg$/.test(v)).map((nome,i) => ({ id: i+1, nome, mimetype: 'image/jpeg', origem: 'chat', chat_id: 2641 }));
export const eventos = [
  { id: 1, tipo: 'criou', autor: 'Williane (IA)', em: dataHora('17/10','14:20'), detalhe: {} },
  { id: 2, tipo: 'status', autor: 'Marina', em: dataHora('17/10','15:05'), detalhe: { de: 'novo', para: 'triagem' } },
  { id: 3, tipo: 'status', autor: 'Marina', em: dataHora('17/10','16:40'), detalhe: { de: 'triagem', para: 'orcamento' } },
  { id: 4, tipo: 'orcamento', autor: 'Marina', em: dataHora('17/10','17:10'), detalhe: { acao: 'criou', orcamento_id: 2 } },
  { id: 5, tipo: 'nota', autor: 'Marina', em: dataHora('17/10','17:25'), texto: dados.modal.folhas.find(v => v.includes('Cliente só atende')).replace(/[“”]/g, ''), detalhe: null }
];
export const chats = [{ id: 2660, contactId: 103, userId: 531, queueId: 1, status: 'active', channel: 0, protocol: '', startedAt: Date.parse(dataHora('17/10','21:12')) / 1000 },
  ...chamados.filter(c => c.locacao_id === 4 && c.atendimento).map(c => ({ id: c.atendimento.chat_id, contactId: 103, userId: 531, queueId: 1,
    status: 'closed', channel: 0, protocol: c.atendimento.protocolo, startedAt: Date.parse(c.atendimento.iniciado_em || c.criado_em) / 1000 }))];
chats.find(c=>c.id===2121).startedAt = Date.parse(dataHora('28/08','10:02')) / 1000;
chats.find(c=>c.id===2121).userId = 532;
export const mensagens = Object.fromEntries([2660,2641,2121].map((id,i)=>[id,[{ id:'DESENHO-'+id, chatId:id, direction:'in', text:dados.novo.folhas.filter(v=>/^“/.test(v))[i].replace(/[“”]/g,''), at:new Date(chats.find(c=>c.id===id).startedAt*1000).toISOString() }]]));
export const fixture = { mensagens, contatos, produtos, usuarios, chats, formulario, locacoes, chamados };
export function valoresVisiveis() {
  return Object.entries(dados).flatMap(([quadro,d]) => [...d.folhas, ...d.campos.map(c => c.valor)].filter(Boolean).map(valor => ({ quadro, valor })));
}
export function validarFixture(desenho) {
  return valoresVisiveis().filter(({quadro}) => !['locados', 'marcar'].includes(quadro)).filter(({quadro,valor}) => !desenho.quadros[quadro]?.texto.includes(valor)).map(({quadro,valor}) => `${quadro}: valor sumiu do desenho: ${JSON.stringify(valor)}`);
}
