/* Áreas de diagnóstico: não mascaram nem alteram pixels ou tolerância. */
import { abrirAmbiente, SAIDA } from './ambiente.mjs';
import { lerDesenho, seletorDesenho } from './desenho.mjs';
import { contarRegioes } from './regioes.mjs';
import { executarComparacao, argumentos } from './comparar.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
await executarComparacao(argumentos(['--origem-comum','lista','novo','modal']));
const b=await abrirAmbiente(), resultados=[];
try {
  await lerDesenho({browser:b});
  const grupos={
    lista:[['Cantos arredondados: fundo do palco externo','@cantos'],['Contagens do contrato','.gi-sub'],['Cabeçalho: colunas automáticas por texto do contrato','thead'],...['O.S.','Chamado','Imóvel','Atendimento','Prioridade','Prazo do contrato','Prestador/cotações do contrato','Status','Funções'].map((n,i)=>[n,`tbody td:nth-child(${i+1})`])],
    novo:[['Cantos arredondados: fundo do palco externo','@cantos'],['Gênero não informado no SDK','[data-evox="mnt-novo-problema"] > :last-child label'],['Portal aceita fotos; não promete vídeo','[data-evox="mnt-novo-problema"] + p'],['Mais opções preservado no rodapé','.gi-modal-rodape']],
    modal:[['Cantos arredondados: fundo do palco externo','@cantos'],['Relato: atalho ver a conversa preservado','.gi-secao:has(+ [data-evox="mnt-modal-relato"])'],['Orçamentos: sem meta no contrato','.gi-secao:has(+ [data-evox="mnt-modal-orcamentos"])'],['Sem meta de três cotações no contrato','.trail'],['Atendimento: mensagem e ações do SDK','[data-evox="mnt-modal-atendimento"]'],['Dados: datetime-local real e gênero ausente','[data-evox="mnt-modal-campos"]'],['Repasse: checkbox real','.chk:first-of-type'],['Relato: gênero ausente e conversa acessível','[data-evox="mnt-modal-relato"]'],['Fotos: portal não aceita vídeo','.photos'],['Orçamentos: sem meta nem contagem de serviços; outra cotação','[data-evox="mnt-modal-orcamentos"]'],['Acesso preservado à decisão do proprietário','.gi-aprov'],['Histórico: três subtextos não gravados nos eventos','[data-evox="mnt-modal-historico"]'],['Nota: controle real','[data-evox="mnt-modal-historico"] ~ .chk'],['Mais opções preservado no rodapé','.gi-modal-rodape']]
  };
  for(const [q,gs] of Object.entries(grupos)){
    const regioes=await b.avaliar((raiz,grupos)=>{
      const r=document.querySelector(raiz).getBoundingClientRect();
      return grupos.flatMap(([causa,s])=>{
        if(s==='@cantos')return [{causa:causa+' (topo)',x:0,y:0,width:r.width,height:10},{causa:causa+' (base)',x:0,y:Math.ceil(r.height)-10,width:r.width,height:10}];
        const rs=[...document.querySelector(raiz).querySelectorAll(s)].map(n=>n.getBoundingClientRect()).filter(a=>a.width&&a.height);
        if(!rs.length)return [];
        const x=Math.min(...rs.map(a=>a.x)),y=Math.min(...rs.map(a=>a.y)),right=Math.max(...rs.map(a=>a.right)),bottom=Math.max(...rs.map(a=>a.bottom));
        return [{causa,x:x-r.x,y:y-r.y,width:right-x,height:bottom-y}];
      });
    },seletorDesenho(q),gs);
    const rows=await contarRegioes(b,path.join(SAIDA,'desenho',q+'.png'),path.join(SAIDA,'extensao',q+'.png'),regioes);
    for(const r of rows)if(r.diferentes)resultados.push({quadro:q,...r});
  }
  await writeFile(path.join(SAIDA,'residuos-chamados.json'),JSON.stringify(resultados,null,2)+'\n');
  console.log('| quadro | região/causa | área | divergentes |');console.log('|---|---|---:|---:|');
  for(const r of resultados)console.log(`| ${r.quadro} | ${r.causa} | ${r.area} px | ${r.diferentes} px |`);
}finally{await b.fechar();}
