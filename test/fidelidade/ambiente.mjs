import { abrirChromium } from '../bancada/chromium.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SAIDA = fileURLToPath(new URL('./saida/', import.meta.url));
export const AGORA = '2026-10-17T20:41:00-03:00';
export const PROPRIEDADES = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border', 'padding', 'margin', 'border-radius', 'gap', 'box-shadow', 'width', 'height'];
export function scriptRelogio(dados) {
  return `(() => {
    const Original = Date, agora = ${Date.parse(AGORA)};
    function Congelada(...args) {
      if (!new.target) return new Original(agora).toString();
      return Reflect.construct(Original, args.length ? args : [agora], new.target);
    }
    Object.setPrototypeOf(Congelada, Original); Congelada.prototype = Original.prototype;
    Congelada.now = () => agora; window.Date = Congelada;
    window.setInterval = () => 0; window.bancada = {};
    window.fixtureDesenho = ${JSON.stringify(dados || null)};
  })();`;
}
export async function abrirAmbiente(dados) {
  const b = await abrirChromium({ antesDeCarregar: scriptRelogio(dados) });
  await b.cdp('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' });
  await b.cdp('Emulation.setScrollbarsHidden', { hidden: true });
  await b.cdp('Network.enable');
  // Arquivo vivo e servidor de loopback são os únicos destinos permitidos.
  await b.cdp('Network.setBlockedURLs', { urls: ['https://*', 'http://*'], urlPatterns: [
    { urlPattern: 'http://127.0.0.1:*/*', block: false }, { urlPattern: 'http://*', block: true }, { urlPattern: 'https://*', block: true }
  ] });
  return b;
}
export async function estabilizar(b) {
  await b.avaliar(async () => {
    await document.fonts.ready;
    if (!document.getElementById('fidelidade-estabilidade')) {
      const s = document.createElement('style'); s.id = 'fidelidade-estabilidade';
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
      document.head.append(s);
    }
    document.activeElement?.blur();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
export async function geometria(b, seletor) {
  return b.avaliar(s => {
    const el = document.querySelector(s);
    if (!el) throw new Error('Recorte ausente: ' + s);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) throw new Error('Recorte invisível: ' + s);
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }, seletor);
}
export async function capturar(b, seletor, destino, deslocar = 0) {
  await estabilizar(b);
  const r = await geometria(b, seletor);
  const { data } = await b.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { ...r, x: r.x + deslocar, width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 } });
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(data, 'base64'));
  return { largura: Math.ceil(r.width), altura: Math.ceil(r.height) };
}
export async function estilos(b, seletores) {
  return b.avaliar((ss, props) => Object.fromEntries(ss.map(s => {
    const el = document.querySelector(s);
    return [s, el ? Object.fromEntries(props.map(p => [p, getComputedStyle(el).getPropertyValue(p)])) : null];
  })), seletores, PROPRIEDADES);
}
export const principal = url => process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
