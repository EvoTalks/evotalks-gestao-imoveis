/* Diagnóstico por área; não modifica tolerância, máscaras ou imagens. */
import path from 'node:path';
import { abrirAmbiente, SAIDA } from './ambiente.mjs';
import { lerDesenho, seletorDesenho } from './desenho.mjs';
import { contarRegioes } from './regioes.mjs';
import { executarComparacao, argumentos } from './comparar.mjs';
await executarComparacao(argumentos(['--origem-comum','locados','marcar','imoveis']));
const b = await abrirAmbiente();
try {
  await lerDesenho({ browser:b });
  const grupos = {
    locados:[['Prazo derivado dos dias do contrato','tbody td:nth-child(5)']],
    marcar:[['Cidade ausente na categoria do fixture','.gi-modal-imovel .gi-ajuda'],['Datas nativas preservadas','input[type="text"][value="01/04/2026"],input[type="text"][value="31/03/2027"]']],
    imoveis:[['Campos não definidos no fixture','.gi-sub'],['Total derivado das seis linhas e próxima desabilitada pelo contrato','.gi-rodape']]
  };
  process.stdout.write('| quadro | região/causa | área | divergentes |\n|---|---|---:|---:|\n');
  for (const [q, gs] of Object.entries(grupos)) {
    const caixas = await b.avaliar((raiz, grupos) => {
      const r = document.querySelector(raiz).getBoundingClientRect();
      return [['Cantos do palco: topo','@topo'],['Cantos do palco: base','@base'],...grupos].flatMap(([causa, s]) => {
        if (s === '@topo' || s === '@base') return [{ causa,x:0,y:s === '@topo' ? 0 : Math.ceil(r.height)-10,width:r.width,height:10 }];
        return [...document.querySelector(raiz).querySelectorAll(s)].map(e => {
          const a = e.getBoundingClientRect(); return { causa,x:a.x-r.x,y:a.y-r.y,width:a.width,height:a.height };
        });
      });
    }, seletorDesenho(q), gs);
    for (const r of await contarRegioes(b,path.join(SAIDA,'desenho',q+'.png'),path.join(SAIDA,'extensao',q+'.png'),caixas)) {
      if (r.diferentes) process.stdout.write(`| ${q} | ${r.causa} | ${r.area} px | ${r.diferentes} px |\n`);
    }
  }
} finally { await b.fechar(); }
