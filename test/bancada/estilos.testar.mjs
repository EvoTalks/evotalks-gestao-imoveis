// Compara todas as propriedades computadas com o CSS da base aprovada, no mesmo DOM.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const anterior = execFileSync('git', ['show', '47498a9:app/chamados.css'], { encoding: 'utf8' });
const atual = readFileSync(new URL('../../app/compartilhado.css', import.meta.url), 'utf8');
const s = criarServidor();
await new Promise(r => s.listen(0, '127.0.0.1', r));
let b, casos = 0;
try {
  b = await abrirChromium();
  for (const largura of [260, 300, 334, 1360]) {
    await b.viewport(largura, 900);
    for (const tema of ['claro', 'escuro']) for (const tela of ['imoveis', 'campos', 'historico', 'config']) {
      await b.navegar('http://127.0.0.1:' + s.address().port + '/app/' + tela + '.html?perfil=admin&tema=' + tema);
      await b.esperar(() => !document.body.classList.contains('gi-permissoes-pendentes') && document.querySelector('#gi-nav .gi-nav-ativo'));
      if (tela === 'imoveis') await b.esperar(() => !!document.querySelector('[data-abrir]'));
      await comparar(tela + '/' + tema + '/' + largura);
      if (tela === 'imoveis') {
        await b.clicar('[data-abrir]');
        await b.esperar(() => !!document.querySelector('#gi-editar-situacao'));
        await comparar('editar/' + tema + '/' + largura);
      }
    }
  }
  assert.deepEqual(b.erros, []);
  process.stdout.write('Estilos: ' + casos + ' estados, todas as propriedades e pseudoelementos idênticos à base 47498a9.\n');
} finally { if (b) await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
async function comparar(nome) {
  const resultado = await b.avaliar(async ({ anterior, atual }) => {
    await document.fonts.ready;
    // As capas redesenham a tabela: compare o mesmo DOM depois da carga assíncrona.
    await new Promise(resolve => {
      let timer; const observer = new MutationObserver(adiar);
      function adiar() { clearTimeout(timer); timer = setTimeout(() => { observer.disconnect(); resolve(); },150); }
      observer.observe(document.body,{childList:true,subtree:true}); adiar();
    });
    let link = document.querySelector('link[href^="compartilhado.css"]');
    const style = document.createElement('style'); link.replaceWith(style);
    const elementos = [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE'].includes(e.tagName));
    elementos.unshift(document.body);
    const ler = () => elementos.flatMap(e => [null, '::before', '::after'].map(pseudo => {
      const css = getComputedStyle(e, pseudo);
      return Object.fromEntries([...css].map(k => [k, css.getPropertyValue(k)]));
    }));
    const esperar = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    style.textContent = anterior; await esperar(); const antes = ler();
    style.textContent = atual; await esperar(); const depois = ler();
    const diferencas = [];
    antes.forEach((props, i) => Object.keys(props).forEach(k => {
      if (props[k] !== depois[i][k]) diferencas.push({ elemento: elementos[Math.floor(i / 3)].outerHTML.slice(0, 140), pseudo: i % 3, propriedade: k, antes: props[k], depois: depois[i][k] });
    }));
    // Keep the same stylesheet position for the next modal comparison.
    link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'compartilhado.css?v=0.32.0'; style.replaceWith(link);
    await new Promise(r => { link.onload = r; link.onerror = r; });
    return diferencas.slice(0, 20);
  }, { anterior, atual });
  assert.deepEqual(resultado, [], nome); casos++;
}
