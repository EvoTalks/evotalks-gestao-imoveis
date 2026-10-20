import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { abrirAmbiente, capturar, geometria, SAIDA, principal } from './ambiente.mjs';

export const QUADROS = ['lista', 'novo', 'modal', 'imoveis', 'cockpit-chamados', 'cockpit-novo', 'cockpit-confirma', 'cockpit-sucesso'];
// .panel mede 315 px: .phone (317 px) menos as bordas de 1 px do .host.
export const seletorDesenho = q => q.startsWith('cockpit-') ? `[data-evox="mnt-cp-${(q === 'cockpit-sucesso' ? 'confirma' : q.slice(8))}"] .panel` :
  `section[data-evox="mnt-art-${q}"] ${['novo', 'modal'].includes(q) ? '.gi-modal' : '.gi'}`;
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
      let dom = el.outerHTML;
      if (q === 'cockpit-confirma' || q === 'cockpit-sucesso') {
        // Consumidores de DOM (CSS puro) recebem o mesmo estado do recorte PNG.
        // O texto integral continua disponível para validar os dados do fixture.
        const recorte = el.cloneNode(false), primeiro = el.querySelector(q === 'cockpit-sucesso' ? '.ok' : '.pc');
        if (q === 'cockpit-sucesso') {
          // Mesmo contexto do app: cabeçalho .pc oculto no resultado.
          const contexto = el.querySelector('.pc').cloneNode(true); contexto.hidden = true; recorte.append(contexto);
        }
        recorte.append(primeiro.cloneNode(true), primeiro.nextElementSibling.cloneNode(true));
        dom = recorte.outerHTML;
      }
      return [q, { dom, texto: el.textContent + '\n' + campos.map(c => c.valor).join('\n'), campos, folhas, tabelas }];
    })), Object.fromEntries(QUADROS.map(q => [q, seletorDesenho(q)])));
    const mascaradas = await regioesMascaradas(b);
    const css = await b.avaliar(() => [...document.querySelectorAll('style')].filter(s => s.id !== 'fidelidade-estabilidade').map(s => s.textContent).join('\n'));
    const sprite = await b.avaliar(() => document.querySelector('body > svg:has(symbol)').outerHTML);
    return { ...meta, css, sprite, quadros, texto: Object.values(quadros).map(q => q.texto).join('\n'), mascaradas };
  } finally { if (!browser) await b.fechar(); }
}
export async function regioesMascaradas(b) {
  const painel = await geometria(b, seletorDesenho('cockpit-chamados'));
  const botao = await geometria(b, '[data-evox="mnt-cp-btn-abrir"]');
  return [{ quadro: 'cockpit-chamados', seletor: '[data-evox="mnt-cp-btn-abrir"]', motivo: 'Pedido explícito: usar somente a aba Novo',
    x: botao.x - painel.x, y: botao.y - painel.y, width: botao.width, height: botao.height }];
}
export async function capturarDesenho(b, q, pasta = 'desenho') {
  if (!['cockpit-confirma', 'cockpit-sucesso'].includes(q)) return capturar(b, seletorDesenho(q), path.join(SAIDA, pasta, q + '.png'));
  // O desenho reúne confirmação e resultado na mesma moldura. A extensão os
  // apresenta sucessivamente: recortes disjuntos, com o padding lido do arquivo vivo.
  // Sem alterar o arquivo vivo, a tolerância ou a máscara do botão final.
  const { mkdir, writeFile } = await import('node:fs/promises');
  const painel = seletorDesenho(q);
  const clip = await b.avaliar((s, sucesso) => {
    const el = document.querySelector(s), primeiro = el.querySelector(sucesso ? '.ok' : '.pc');
    const ultimo = primeiro.nextElementSibling;
    const p = el.getBoundingClientRect(), a = primeiro.getBoundingClientRect(), z = ultimo.getBoundingClientRect(), css = getComputedStyle(el);
    const topo=parseFloat(css.paddingTop), base=parseFloat(css.paddingBottom);
    return { x:p.x+scrollX, y:a.y+scrollY-topo, width:Math.ceil(p.width), height:Math.ceil(z.bottom-a.top+topo+base), scale:1 };
  }, painel, q === 'cockpit-sucesso');
  const { data } = await b.cdp('Page.captureScreenshot', {format:'png', captureBeyondViewport:true, clip});
  const destino=path.join(SAIDA,pasta,q+'.png');
  await mkdir(path.dirname(destino),{recursive:true});await writeFile(destino,Buffer.from(data,'base64'));
  return {largura:clip.width,altura:clip.height};
}
if (principal(import.meta.url)) {
  const b = await abrirAmbiente();
  try {
    const d = await lerDesenho({ browser: b });
    for (const q of QUADROS) process.stdout.write(q + ' ' + JSON.stringify(await capturarDesenho(b, q)) + '\n');
    process.stdout.write('Viewport descoberto: ' + JSON.stringify(d.viewport) + '\n');
  } finally { await b.fechar(); }
}

/* Compara o componente no mesmo contexto do iframe real (origem 0,0).
 * O canvas vivo começa em y=7275,0625: cruzar a metade de um pixel desloca
 * bordas e glifos em 1px apesar de TODAS as geometrias relativas coincidirem.
 * Renderiza DOM + CSS + sprite INTEGRAIS extraídos ao vivo, sem sobrescrever
 * estilos, redimensionar imagens, trocar textos ou acrescentar máscaras.
 * O recorte original do canvas é preservado pelo chamador para auditoria.
 */
export async function capturarCockpitIsolado(b, d, q, tamanho) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const pasta = path.join(SAIDA, 'referencia-iframe');
  await mkdir(pasta, { recursive: true });
  const arquivo = path.join(pasta, q + '.html');
  await writeFile(arquivo, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' + d.css + '</style></head><body>' + d.sprite + (['novo','modal'].includes(q) ? '<div class="gi gi-palco">' + d.quadros[q].dom + '</div>' : d.quadros[q].dom) + '</body></html>');
  await b.viewport(tamanho.largura, Math.max(1100, tamanho.altura));
  await b.navegar(pathToFileURL(arquivo).href);
  const dimensoes = await capturar(b, q.startsWith('cockpit-') ? '.panel' : ['novo','modal'].includes(q) ? '.gi-modal' : '.gi', path.join(SAIDA, 'desenho', q + '.png'));
  if (dimensoes.largura !== tamanho.largura || dimensoes.altura !== tamanho.altura) throw new Error('Isolamento alterou as dimensões do desenho: ' + q);
  await abrirDesenho(b);
  return dimensoes;
}
