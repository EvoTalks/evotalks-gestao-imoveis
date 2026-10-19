import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { abrirAmbiente, capturar, geometria, SAIDA, principal } from './ambiente.mjs';

export const QUADROS = ['lista', 'novo', 'modal', 'locados', 'marcar', 'imoveis', 'cockpit-chamados', 'cockpit-novo', 'cockpit-confirma'];
export const seletorDesenho = q => q.startsWith('cockpit-') ? `[data-evox="mnt-cp-${q.slice(8)}"] .panel` :
  `section[data-evox="mnt-art-${q}"] ${['novo', 'modal', 'marcar'].includes(q) ? '.gi-modal' : '.gi'}`;
export async function abrirDesenho(b) {
  const arquivo = process.env.TELA_HTML || '/srv/devhome/dev-marco-souza/design/tela.html';
  await readFile(arquivo); // Erro explícito, sem fallback para fotografia histórica.
  await b.navegar(pathToFileURL(arquivo).href);
  const largura = await b.avaliar(() => {
    const canvas = document.querySelector('.canvas'), art = document.querySelector('[data-evox="mnt-art-lista"] .gi');
    if (!canvas || !art) throw new Error('Desenho sem canvas ou quadro lista');
    const c = getComputedStyle(canvas);
    return Math.ceil(Math.max(parseFloat(c.minWidth) || 0, art.getBoundingClientRect().width + parseFloat(c.paddingLeft) + parseFloat(c.paddingRight)));
  });
  await b.viewport(largura, 1100);
  return { arquivo, viewport: { largura, altura: 1100 } };
}
export async function lerDesenho({ browser } = {}) {
  const b = browser || await abrirAmbiente();
  try {
    const meta = await abrirDesenho(b);
    const quadros = await b.avaliar(mapa => Object.fromEntries(Object.entries(mapa).map(([q, s]) => {
      const el = document.querySelector(s);
      if (!el) throw new Error('Quadro ausente no desenho: ' + q);
      const campos = [...el.querySelectorAll('input,textarea,select')].map(c => ({ rotulo: c.closest('.gi-campo-caixa,.gi-campo')?.querySelector('label')?.textContent.trim() || '', valor: c.value }));
      const folhas = [...el.querySelectorAll('*')].flatMap(n => [...n.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent.trim())).filter(Boolean);
      const tabelas = [...el.querySelectorAll('table')].map(t => [...t.querySelectorAll('tbody > tr')].map(tr => [...tr.cells].map(td => ({
        texto: td.innerText.trim(), principal: [...td.childNodes].filter(x => !(x.nodeType === 1 && x.classList.contains('gi-ajuda'))).map(x => x.textContent).join('').trim(), ajuda: td.querySelector('.gi-ajuda')?.innerText.trim() || ''
      }))));
      return [q, { dom: el.outerHTML, texto: el.textContent + '\n' + campos.map(c => c.valor).join('\n'), campos, folhas, tabelas }];
    })), Object.fromEntries(QUADROS.map(q => [q, seletorDesenho(q)])));
    const mascaradas = await regioesMascaradas(b);
    const css = await b.avaliar(() => [...document.querySelectorAll('style')].filter(s => s.id !== 'fidelidade-estabilidade').map(s => s.textContent).join('\n'));
    return { ...meta, css, quadros, texto: Object.values(quadros).map(q => q.texto).join('\n'), mascaradas };
  } finally { if (!browser) await b.fechar(); }
}
export async function regioesMascaradas(b) {
  const painel = await geometria(b, seletorDesenho('cockpit-chamados'));
  const botao = await geometria(b, '[data-evox="mnt-cp-btn-abrir"]');
  return [{ quadro: 'cockpit-chamados', seletor: '[data-evox="mnt-cp-btn-abrir"]', motivo: 'Pedido explícito: usar somente a aba Novo',
    x: botao.x - painel.x, y: botao.y - painel.y, width: botao.width, height: botao.height }];
}
export async function capturarDesenho(b, q, pasta = 'desenho') {
  return capturar(b, seletorDesenho(q), path.join(SAIDA, pasta, q + '.png'));
}
if (principal(import.meta.url)) {
  const b = await abrirAmbiente();
  try {
    const d = await lerDesenho({ browser: b });
    for (const q of QUADROS) process.stdout.write(q + ' ' + JSON.stringify(await capturarDesenho(b, q)) + '\n');
    process.stdout.write('Viewport descoberto: ' + JSON.stringify(d.viewport) + '\n');
  } finally { await b.fechar(); }
}
