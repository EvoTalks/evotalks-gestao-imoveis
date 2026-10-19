import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { abrirAmbiente, SAIDA, AGORA, principal } from './ambiente.mjs';
import { QUADROS, lerDesenho, capturarDesenho } from './desenho.mjs';
import { abrirExtensao, capturarExtensao, capturarSucesso } from './roteiros.mjs';
import { compararArquivos } from './pixels.mjs';
import { LIMITACOES, validarFixture } from './fixture-desenho.mjs';

export function argumentos(args) {
  const op={quadros:[],soDesenho:false,limite:null};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--so-desenho')op.soDesenho=true;
    else if(args[i]==='--limite') { const valor=args[++i]; op.limite=Number(valor); if(valor===undefined||!Number.isFinite(op.limite)||op.limite<0||op.limite>100)throw new Error('--limite exige número entre 0 e 100'); }
    else if(QUADROS.includes(args[i]))op.quadros.push(args[i]);
    else throw new Error('Quadro/opção desconhecido: '+args[i]);
  }
  if(!op.quadros.length)op.quadros=[...QUADROS];
  op.quadros=[...new Set(op.quadros)];return op;
}
const dimensao=t=>t.largura+'×'+t.altura;
export function tabela(rows) {
  return ['| quadro | desenho | extensão | diferentes | alcançável | mascarados |','|---|---|---|---:|---|---:|',
    ...rows.map(r=>`| ${r.quadro} | ${dimensao(r.desenho)} | ${dimensao(r.extensao)} | ${r.percentual.toFixed(4)} % | ${r.alcancavel?'sim':'não'} | ${r.mascarados} px |`)].join('\n');
}
export const reprovado=(rows,limite)=>limite!==null&&rows.some(r=>r.percentual>limite);
export async function executarComparacao(op=argumentos([])) {
  const b=await abrirAmbiente(),rows=[];
  try {
    const d=await lerDesenho({browser:b});
    const avisosFixture=validarFixture(d);
    if(avisosFixture.length)throw new Error(avisosFixture.join('\n'));
    for(const q of op.quadros) {
      const tamanho=await capturarDesenho(b,q);
      let extensao,alcancavel=true,motivos=[];
      if(op.soDesenho) {
        // Reabre o arquivo e recongela a página: testa também estabilidade entre cargas.
        await lerDesenho({browser:b});
        await capturarDesenho(b,q,'desenho-repetido');
        extensao=path.join(SAIDA,'desenho-repetido',q+'.png');
      } else {
        const s=await abrirExtensao(q,tamanho);
        try {
          await capturarExtensao(s); extensao=path.join(SAIDA,'extensao',q+'.png');
          alcancavel=s.alcancavel;motivos=s.motivos;
          await capturarSucesso(s);
          if(s.b.erros.length)throw new Error('Exceção na extensão: '+s.b.erros.join('\n'));
        } finally { await s.fechar(); }
      }
      const mascaras=d.mascaradas.filter(r=>r.quadro===q);
      const {diff,...medidas}=await compararArquivos(b,path.join(SAIDA,'desenho',q+'.png'),extensao,mascaras);
      const pasta=path.join(SAIDA,op.soDesenho?'autocomparacao':'',q);await mkdir(pasta,{recursive:true});
      await copyFile(path.join(SAIDA,'desenho',q+'.png'),path.join(pasta,'desenho.png'));
      await copyFile(extensao,path.join(pasta,'extensao.png'));
      await writeFile(path.join(pasta,'diff.png'),Buffer.from(diff.split(',')[1],'base64'));
      rows.push({quadro:q,...medidas,alcancavel,motivos,mascaras});
    }
    const manifest=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url),'utf8'));
    const relatorio={versao:manifest.version,agora:AGORA,fuso:'America/Sao_Paulo',dpr:1,tolerancia:8,limite:op.limite,soDesenho:op.soDesenho,
      fonte:d.arquivo,sha256:createHash('sha256').update(await readFile(d.arquivo)).digest('hex'),viewport:d.viewport,quadros:rows,limitacoes:LIMITACOES};
    const resumo=`${rows.length} recortes; ${rows.filter(r=>r.percentual<=.5).length} dentro de 0,5 %; ${rows.filter(r=>!r.alcancavel).length} estados com limitações.`;
    const md=tabela(rows)+'\n\n'+resumo+'\n\n'+rows.flatMap(r=>r.motivos.map(m=>'- '+r.quadro+': '+m)).join('\n')+'\n\n'+LIMITACOES.map(m=>'- '+m).join('\n')+'\n';
    const nome=op.soDesenho?'relatorio-autocomparacao':'relatorio';
    await mkdir(SAIDA,{recursive:true});await writeFile(path.join(SAIDA,nome+'.json'),JSON.stringify(relatorio,null,2)+'\n');await writeFile(path.join(SAIDA,nome+'.md'),md);
    process.stdout.write(tabela(rows)+'\n'+resumo+'\n');
    return relatorio;
  } finally { await b.fechar(); }
}
if(principal(import.meta.url)) {
  try {const op=argumentos(process.argv.slice(2));const r=await executarComparacao(op);if(reprovado(r.quadros,op.limite))process.exitCode=1;}
  catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
}
