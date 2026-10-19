import assert from 'node:assert/strict';
import path from 'node:path';
import { abrirExtensao } from './roteiros.mjs';
import { capturar, SAIDA } from './ambiente.mjs';

let total = 0;
for (const q of ['cockpit-chamados', 'cockpit-novo', 'cockpit-confirma', 'cockpit-sucesso']) {
  const s = await abrirExtensao(q, { largura: 315, altura: 1100 });
  try {
    for (const tema of ['light', 'dark']) for (const largura of [260, 300, 317, 334]) {
      await s.b.viewport(largura, 2200);
      await s.b.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] });
      const medidas = await s.b.avaliar(() => ({
        largura: innerWidth, rolagem: document.documentElement.scrollWidth,
        cortados: [...document.querySelectorAll('#gi-cockpit button')].filter(el => el.checkVisibility() && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
        fundo: getComputedStyle(document.querySelector('.pc')).backgroundColor
      }));
      assert.ok(medidas.rolagem <= largura, q + ': rolagem horizontal');
      assert.deepEqual(medidas.cortados, [], q + ': botão cortado');
      if (tema === 'dark') assert.notEqual(medidas.fundo, 'rgb(255, 255, 255)', q + ': superfície clara no tema escuro');
      await capturar(s.b, '#gi-cockpit', path.join(SAIDA, 'cockpit-variantes', tema, q + '-' + largura + '.png'));
      total++;
    }
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
}
process.stdout.write(total + ' capturas do cockpit real em 260/300/317/334 px, claro/escuro; sem rolagem horizontal, botões cortados ou exceções.\n');
