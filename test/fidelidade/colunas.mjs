import { compararArquivos } from './pixels.mjs';
import { abrirAmbiente } from './ambiente.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const b=await abrirAmbiente();
try {
 const resultados={antes:{claro:0,escuro:0},depois:{}};
 for(const tema of ['light','dark']) {
   const r=await compararArquivos(b,new URL('./antes-colunas/imoveis-'+tema+'.png',import.meta.url),new URL('./saida/gestao-variantes/imoveis-'+tema+'.png',import.meta.url));
   const fora = await compararArquivos(b,new URL('./antes-colunas/imoveis-'+tema+'.png',import.meta.url),new URL('./saida/gestao-variantes/imoveis-'+tema+'.png',import.meta.url),[{x:23,y:76,width:1314,height:68},{x:23,y:154,width:1314,height:47}]);
   // Correção 3: Preenchido passa de 105 para 116 px. A tabela compensa
   // na coluna automática Imóvel, deslocando Bairro/Valor/Preenchido.
   // O percentual bruto e a métrica anterior continuam registrados; só essa
   // faixa do corpo tem deslocamento autorizado. Os demais pixels mantêm 0,01%.
   const foraDeslocamento = await compararArquivos(b,new URL('./antes-colunas/imoveis-'+tema+'.png',import.meta.url),new URL('./saida/gestao-variantes/imoveis-'+tema+'.png',import.meta.url),[{x:23,y:76,width:1314,height:68},{x:23,y:154,width:1314,height:47},{x:494,y:201,width:381,height:551}]);
   // Mantém o orçamento original de pixels residuais (mesmo denominador).
   resultados.depois[tema]={diferencaPercentual:r.percentual,fidelidadePercentual:100-r.percentual,foraBarraECabecalho:fora.percentual,foraDeslocamentoAutorizado:foraDeslocamento.percentual,residuoNaAreaOriginal:foraDeslocamento.diferentes/fora.comparados*100};
   assert.ok(foraDeslocamento.diferentes/fora.comparados*100 <= 0.01,'layout padrão: resíduo inferior a 0,01% fora da barra/cabeçalho e deslocamento autorizado em '+tema);
   assert.ok(r.percentual<2.5,'diferença visual limitada ao botão/funis');
 }
 await writeFile(new URL('../resultados-colunas/fidelidade.json',import.meta.url),JSON.stringify(resultados,null,2));
 process.stdout.write('Fidelidade Imóveis: antes 0% de diferença (0.32.0 contra si); depois '+JSON.stringify(resultados.depois)+'; total sem máscaras; métricas anteriores preservadas; resíduo fora do deslocamento normalizado pela área original (limite 0,01%).\n');
} finally {await b.fechar();}
