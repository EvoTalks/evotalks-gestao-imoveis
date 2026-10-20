/* DOM vivo + sprite SVG do desenho, mas APENAS folhas externas reais de app/.
 * Sem scripts de app, CSS do desenho, pacote npm ou modificação dos recortes.
 * Os <use href="#i-…"> continuam resolvendo o sprite body > svg:has(symbol),
 * incluído inteiro antes do componente; seu style original só o posiciona.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirAmbiente, capturar, SAIDA, principal, AGORA } from './ambiente.mjs';
import { lerDesenho, capturarDesenho, seletorDesenho } from './desenho.mjs';
import { argumentos, tabela, reprovado } from './comparar.mjs';
import { compararArquivos } from './pixels.mjs';

const APP = fileURLToPath(new URL('../../app/', import.meta.url));
const escapar = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export async function folhasDoQuadro(q) {
  const pagina = q.startsWith('cockpit-') ? 'painel' : ['lista', 'novo', 'modal'].includes(q) ? 'chamados' : 'imoveis';
  const html = await readFile(path.join(APP, pagina + '.html'), 'utf8');
  return [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m => {
    const arquivo = m[1].split('?')[0];
    if (!/^[\w-]+\.css$/.test(arquivo)) throw new Error('Folha local inesperada: ' + arquivo);
    return arquivo;
  });
}
export async function verificarVariantes(b, quadros) {
  const resultados = [];
  for (const tema of ['light', 'dark']) for (const q of quadros.filter(q => q.startsWith('cockpit-'))) for (const largura of [260, 300, 317, 334]) {
    await b.viewport(largura, 2200);
    await b.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] });
    await b.navegar(pathToFileURL(path.join(SAIDA, 'css-puro', q + '.html')).href);
    await b.avaliar(() => {
      // Nas variantes, o iframe ocupa a largura inteira, sem o palco do desenho.
      const palco = document.querySelector('body > div');
      palco.style.left = '0'; palco.style.top = '0'; palco.style.width = '100%';
    });
    const r = await b.avaliar(() => {
      const raiz = document.documentElement;
      const controles = [...document.querySelectorAll('.panel button,.panel input,.panel textarea,.panel select')];
      return { largura: raiz.clientWidth, rolagem: raiz.scrollWidth,
        cortados: controles.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent.trim()),
        fundo: getComputedStyle(document.querySelector('.pc')).backgroundColor,
        texto: getComputedStyle(document.querySelector('.panel')).color };
    });
    if (r.rolagem > largura || r.cortados.length) throw new Error('Cockpit com overflow: ' + JSON.stringify({ q, tema, largura, ...r }));
    if (tema === 'dark' && r.fundo === 'rgb(255, 255, 255)') throw new Error('Superfície não adotou tema escuro: ' + q);
    await capturar(b, '.panel', path.join(SAIDA, 'css-puro', tema, q + '-' + largura + '.png'));
    resultados.push({ quadro: q, tema, ...r });
  }
  // Uma instância pode fornecer tokens próprios, inclusive no modo escuro.
  // Sucesso só tem botões secundários. Checar a ação primária num estado que a
  // contém, em vez de depender do último quadro solicitado pelo chamador.
  const comPrimario = quadros.find(q => ['cockpit-chamados','cockpit-novo','cockpit-confirma'].includes(q));
  if (comPrimario) {
    await b.navegar(pathToFileURL(path.join(SAIDA, 'css-puro', comPrimario + '.html')).href);
    const tema = { '--ext-color-surface': '#203040', '--ext-color-text': '#e0e1e2', '--ext-color-primary': '#8899aa', '--ext-color-on-primary': '#101112' };
    const recebidos = await b.avaliar(tema => {
      for (const [k, v] of Object.entries(tema)) document.documentElement.style.setProperty(k, v);
      const primario = document.querySelector('.btn--primary');
      return { fundo: getComputedStyle(document.querySelector('.pc')).backgroundColor, texto: getComputedStyle(document.querySelector('.panel')).color,
        acao: getComputedStyle(primario).backgroundColor, sobreAcao: getComputedStyle(primario).color };
    }, tema);
    if (JSON.stringify(recebidos) !== JSON.stringify({ fundo: 'rgb(32, 48, 64)', texto: 'rgb(224, 225, 226)', acao: 'rgb(136, 153, 170)', sobreAcao: 'rgb(16, 17, 18)' })) throw new Error('Tokens do host não prevaleceram: ' + JSON.stringify(recebidos));
  }
  return resultados;
}
export async function executarCssPuro(op = argumentos([])) {
  const b = await abrirAmbiente(), rows = [];
  const pasta = path.join(SAIDA, 'css-puro');
  await mkdir(pasta, { recursive: true });
  try {
    const d = await lerDesenho({ browser: b });
    const sprite = await b.avaliar(() => {
      const s = document.querySelector('body > svg:has(symbol)');
      if (!s) throw new Error('Sprite SVG ausente no desenho');
      return s.outerHTML;
    });
    // Capturar todas as referências antes de sair do documento vivo.
    // Preserva a origem fracionária do palco: rasterização de fontes/bordas
    // depende do subpixel global, mesmo com dimensões e computed styles iguais.
    // A montagem mantém só a fase fracionária ORIGINAL, sem alinhar imagens.
    const origens = await b.avaliar(mapa => Object.fromEntries(Object.entries(mapa).map(([q, s]) => {
      const el = document.querySelector(s), palco = el.closest('.gi') || el;
      const r = palco.getBoundingClientRect();
      return [q, { x: r.x + scrollX, y: r.y + scrollY, width: r.width }];
    })), Object.fromEntries(op.quadros.map(q => [q, seletorDesenho(q)])));
    const tamanhos = {};
    for (const q of op.quadros) tamanhos[q] = await capturarDesenho(b, q, 'css-puro/desenho');
    for (const q of op.quadros) {
      const folhas = await folhasDoQuadro(q), cockpit = q.startsWith('cockpit-');
      const modal = ['novo', 'modal'].includes(q);
      const links = folhas.map(f => '<link rel="stylesheet" href="' + escapar(pathToFileURL(path.join(APP, f)).href) + '">').join('\n');
      const dom = d.quadros[q].dom;
      const componente = cockpit ? dom : modal ? '<main class="gi gi-palco">' + dom + '</main>' : dom;
      const origem = origens[q];
      const conteudo = '<div style="position:absolute;left:' + (origem.x % 1) + 'px;top:' + (origem.y % 1) + 'px;width:' + origem.width + 'px">' + componente + '</div>';
      const pagina = path.join(pasta, q + '.html');
      await writeFile(pagina, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + links + '</head><body>' + sprite + conteudo + '</body></html>');
      await b.viewport(cockpit ? tamanhos[q].largura : d.viewport.largura, Math.max(1100, Math.ceil(tamanhos[q].altura / .7) + 300));
      await b.navegar(pathToFileURL(pagina).href);
      await b.avaliar(n => {
        if (document.querySelectorAll('link[rel="stylesheet"]').length !== n || document.styleSheets.length !== n) throw new Error('CSS real não carregado');
      }, folhas.length);
      const seletor = cockpit ? '.panel' : modal ? '.gi-modal' : '.gi';
      const extensao = path.join(pasta, q + '.png');
      await capturar(b, seletor, extensao);
      const mascaras = d.mascaradas.filter(m => m.quadro === q);
      const { diff, ...medidas } = await compararArquivos(b, path.join(pasta, 'desenho', q + '.png'), extensao, mascaras);
      await writeFile(path.join(pasta, q + '-diff.png'), Buffer.from(diff.split(',')[1], 'base64'));
      rows.push({ quadro: q, ...medidas, alcancavel: true, folhas, origem });
    }
    const variantes = op.variantes ? await verificarVariantes(b, op.quadros) : [];
    const relatorio = { variantes, fonte: d.arquivo, agora: AGORA, tolerancia: 8, limite: op.limite ?? .5, quadros: rows };
    await writeFile(path.join(pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2) + '\n');
    await writeFile(path.join(pasta, 'relatorio.md'), tabela(rows) + '\n');
    process.stdout.write(tabela(rows) + '\n');
    if (op.variantes) process.stdout.write('Variantes: ' + variantes.length + ' capturas sem rolagem horizontal ou controles cortados; tokens do host preservados.\n');
    return relatorio;
  } finally { await b.fechar(); }
}
if (principal(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const op = { ...argumentos(args.filter(a => a !== '--variantes')), variantes: args.includes('--variantes') };
    if (op.soDesenho) throw new Error('css-puro sempre usa CSS real da extensão');
    const r = await executarCssPuro(op);
    if (reprovado(r.quadros, op.limite ?? .5)) process.exitCode = 1;
  } catch (e) { process.stderr.write(e.stack + '\n'); process.exitCode = 1; }
}
