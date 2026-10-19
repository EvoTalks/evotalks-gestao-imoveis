/* Capturas das telas reais, sem substituir DOM, CSS ou respostas do host. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { abrirExtensao } from './roteiros.mjs';
import { abrirAmbiente, capturar, SAIDA, geometria } from './ambiente.mjs';
import { lerDesenho, seletorDesenho } from './desenho.mjs';
const desenho = await abrirAmbiente();
let capturas = 0;
try {
  await lerDesenho({ browser: desenho });
  for (const quadro of ['lista', 'novo', 'modal']) {
    const r = await geometria(desenho, seletorDesenho(quadro));
    const sessao = await abrirExtensao(quadro, { largura: Math.ceil(r.width), altura: Math.ceil(r.height) });
    try {
      for (const tema of ['light', 'dark']) {
        await sessao.b.cdp('Emulation.setEmulatedMedia', { features: [{ name:'prefers-color-scheme', value:tema }] });
        await mkdir(path.join(SAIDA,'chamados-variantes'), { recursive:true });
        await capturar(sessao.b, sessao.seletor, path.join(SAIDA,'chamados-variantes',quadro+'-'+tema+'.png'));
        const cores = await sessao.b.avaliar(() => {
          const c = getComputedStyle(document.querySelector('.gi-modal') || document.body);
          return { fundo:c.backgroundColor, texto:c.color };
        });
        assert.notEqual(cores.fundo, cores.texto, quadro + ': texto legível');
        if (tema === 'dark') assert.notEqual(cores.fundo,'rgb(255, 255, 255)', quadro + ': fundo escuro');
        capturas++;
      }
      assert.deepEqual(sessao.b.erros, []);
    } finally { await sessao.fechar(); }
  }
  process.stdout.write(capturas + ' capturas reais: lista, novo e modal em claro/escuro; sem exceções.\n');
} finally { await desenho.fechar(); }
