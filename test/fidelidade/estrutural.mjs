import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { abrirAmbiente, estilos, geometria, SAIDA, principal } from './ambiente.mjs';
import { lerDesenho, seletorDesenho } from './desenho.mjs';
import { abrirExtensao } from './roteiros.mjs';
import { PARES } from './pares.mjs';

export function diferencasEstilos(nome,a,b) {
  if(!a||!b)return [{par:nome,propriedade:'elemento',desenho:a?'presente':'ausente',extensao:b?'presente':'ausente'}];
  return Object.keys(a).filter(p=>a[p]!==b[p]).map(p=>({par:nome,propriedade:p,desenho:a[p],extensao:b[p]}));
}
export async function compararEstrutura() {
  const b=await abrirAmbiente(),diferencas=[];
  try {
    await lerDesenho({browser:b});
    for(const q of [...new Set(PARES.map(p=>p.quadro))]) {
      const pares=PARES.filter(p=>p.quadro===q);
      const tamanho=await geometria(b,seletorDesenho(q));
      // :is inclui também o próprio cartão modal (não apenas descendentes).
      const ref=p=>p.desenho==='.gi-modal'?seletorDesenho(q):seletorDesenho(q)+' '+p.desenho;
      const a=await estilos(b,pares.map(ref));
      const s=await abrirExtensao(q,{largura:Math.ceil(tamanho.width),altura:Math.ceil(tamanho.height)});
      try {
        const atual=await estilos(s.b,pares.map(p=>p.extensao));
        for(const p of pares)diferencas.push(...diferencasEstilos(q+'/'+p.nome,a[ref(p)],atual[p.extensao]));
      } finally {await s.fechar();}
    }
    await mkdir(SAIDA,{recursive:true});await writeFile(path.join(SAIDA,'estrutural.json'),JSON.stringify({pares:PARES.length,diferencas},null,2)+'\n');
    for(const d of diferencas)process.stdout.write(`${d.par} | ${d.propriedade} | ${d.desenho} | ${d.extensao}\n`);
    process.stdout.write(diferencas.length?`${PARES.length} pares; ${diferencas.length} diferenças estruturais.\n`:'igual\n');
    return diferencas;
  } finally {await b.fechar();}
}
if(principal(import.meta.url))await compararEstrutura();
