import dados from './dados-desenho.json' with { type: 'json' };
export const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const centavos = v => Math.round(Number(String(v).replace(/[^\d,]/g, '').replace(',', '.')) * 100);
export const produtos = dados.imoveis.tabelas[0].map((r, i) => ({ id: i + 1, internalcode: r[0].ajuda,
  name: r[1].principal, category: [r[1].ajuda, r[2].principal].join(' > '), brand: '', value: centavos(r[3].principal) }));
export const usuarios = ['Marina', 'Tiago'].map((name, i) => ({ id: 531 + i, name, type: 2 }));
export const fixture = { produtos, usuarios, contatos: [], chats: [], mensagens: {} };
