/* Quadro 1 congelado contra a janela real: sem máscaras; origem em pixel inteiro. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { abrirAmbiente, capturar, geometria, estabilizar, SAIDA, AGORA } from './ambiente.mjs';
import { compararArquivos } from './pixels.mjs';
import { criarServidor } from '../bancada/servidor.mjs';
const desenho = '/srv/devhome/dev-marco-souza/fluxo/william-visualizacao/desenho/tela-3.html';
const saida = path.join(SAIDA, 'visualizacao');
const seletor = '[data-evox="vis-modal"]';
// A única substituição visual permitida: todas as fotos recebem o mesmo SVG sólido.
const bloco = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><path fill="#c5cbd0" d="M0 0h640v480H0z"/></svg>').toString('base64');
async function fotosNeutras(b) {
  await b.avaliar(async src => {
    const fotos = [...document.querySelectorAll('[data-evox="vis-modal"] .dv-foto img')];
    await Promise.all(fotos.map(img => { img.src = src; return img.decode().then(()=>img.parentNode.classList.remove('dv-foto-quebrada')); }));
  }, bloco);
}
// Aguarda inclusive o posicionamento por IntersectionObserver/ResizeObserver.
async function recorteEstavel(b, dinamico = false) {
  await estabilizar(b);
  if (dinamico) await b.esperar(()=>!!document.querySelector('[data-evox="vis-modal"]').style.top);
  await b.avaliar(async seletor => {
    let anterior = '', iguais = 0;
    for (let quadro = 0; quadro < 120; quadro++) {
      await new Promise(requestAnimationFrame);
      const r = document.querySelector(seletor).getBoundingClientRect();
      const atual = JSON.stringify([r.x,r.y,r.width,r.height]);
      iguais = atual === anterior ? iguais + 1 : 1;
      anterior = atual;
      if (iguais >= 3) return;
    }
    throw new Error('Geometria do recorte não estabilizou');
  }, seletor);
}
async function capturarEstavel(b, destino, dinamico = false) {
  await recorteEstavel(b,dinamico);
  let r = await geometria(b,seletor);
  // Ajusta a paridade do viewport, sem alterar CSS ou deslocar o recorte.
  if (dinamico && !Number.isInteger(r.y)) {
    const viewport = await b.avaliar(()=>({w:innerWidth,h:innerHeight}));
    await b.viewport(viewport.w,viewport.h+1);
    await recorteEstavel(b,dinamico);
    r = await geometria(b,seletor);
  }
  if (!dinamico) {
    // O documento estático pode começar numa fração de linha do cabeçalho.
    // Arredonda só a origem, preservando dimensões e todo o layout interno.
    await b.avaliar(s=>{const m=document.querySelector(s),r=m.getBoundingClientRect();m.style.top=((parseFloat(getComputedStyle(m).top)||0)+Math.round(r.y)-r.y)+'px';},seletor);
    await recorteEstavel(b);
    r = await geometria(b,seletor);
  }
  assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y),'recorte posicionado em pixels inteiros');
  return capturar(b,seletor,destino);
}
let b, servidor;
try {
  b = await abrirAmbiente(); await b.viewport(1400,2200);
  await b.navegar(pathToFileURL(desenho).href);
  const referencia = await b.avaliar(() => {
    const m = document.querySelector('[data-evox="vis-modal"]');
    return { titulo:m.querySelector('.dv-titulo').textContent,
      descricao:[...m.querySelectorAll('.dv-texto p')].map(p=>p.textContent).join('\n'),
      fotos:[...m.querySelectorAll('.dv-foto img')].map(i=>i.src),
      fonte:getComputedStyle(m).fontFamily };
  });
  await fotosNeutras(b);
  await capturarEstavel(b,path.join(saida,'desenho.png'));
  const campos = ['IPTU','Seguro incêndio','Taxa de administração','Taxa de contrato','Vagas extras','Aceita pet','Mobiliado','Observação da administração'].map((rotulo,i)=>({id:i+1,rotulo,tipo:i<4?'valor':i===6?'checkbox':'texto',ativo:true,ordem:i+1}));
  const valores = [184000,4200,52000,35000].map((valor_centavos,i)=>({campo_id:i+1,valor_centavos,recorrencia:['anual','mensal','mensal','unica'][i]})).concat([
    {campo_id:6,valor_texto:'Sim, até 10kg'}, {campo_id:7,valor_texto:'sim'}, {campo_id:8,valor_texto:'Visitas com 24 h de antecedência.'}
  ]);
  const produtos = Array.from({length:248},(_,i)=>({id:9100+i,internalcode:i===11?'5357422':'535'+(8000+i),name:i===11?referencia.titulo.toUpperCase():'Imóvel '+i,category:'Apartamento > Brusque > Centro',description:'[Locacao]',value:650000,brand:'DEMONSTRACAO'}));
  const imovel = {codigo:'5357422',titulo:referencia.titulo.toUpperCase(),bairro:'Centro',cidade:'Brusque',tipo:'Apartamento',transacao:'Locacao',area_m2:107.3,quartos:3,suites:1,banheiros:3,vagas:null,valor_aluguel:650000,condominio:50000,descricao:referencia.descricao,link:'https://www.williamimoveis.com.br/imovel/7422',caracteristicas:['Gourmet Area','Kitchen','Balcony','Party Room','BBQ','Elevator','Pets Allowed'],imagem_principal:referencia.fotos[0],imagens:Array.from({length:13},(_,i)=>referencia.fotos[i%5]+'?foto='+i),primeiro_visto_em:'2026-07-15T07:51:00Z',atualizado_em:'2026-10-20T09:00:00Z'};
  // Capa + doze outras URLs distintas = treze fotos.
  imovel.imagens=imovel.imagens.slice(1);
  servidor=criarServidor({portalRealUrl:null,campos,detalhes:{5357422:{imovel,valores}},produtosSinteticos:produtos});
  await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
  await b.viewport(1400,2200);
  await b.navegar('http://127.0.0.1:'+servidor.address().port+'/app/imoveis.html?perfil=admin');
  await b.esperar(()=>!!document.querySelector('[data-detalhe="5357422"]'));
  await b.avaliar(()=>{const cfg=GI.cfg;GI.cfg=(k,d)=>k==='prefixoCodigo'?'535':cfg(k,d);});
  // Seleção de tamanho da lista no host sintético; não altera a janela capturada.
  await b.avaliar(()=>{const s=document.querySelector('#f-porpagina');s.add(new Option('248','248'));s.value='248';s.dispatchEvent(new Event('change'));});
  await b.esperar(()=>document.querySelectorAll('.gi-capa[data-detalhe]').length===248);
  await b.clicar('.gi-capa[data-detalhe="5357422"]');
  await b.esperar(()=>!!document.querySelector('.dv-cabeca'));
  assert.equal(await b.avaliar(()=>document.querySelector('[data-evox="vis-topo-posicao"]').textContent),'12 de 248');
  assert.equal(await b.avaliar(()=>getComputedStyle(document.querySelector('[data-evox="vis-modal"]')).fontFamily),referencia.fonte);
  await fotosNeutras(b);
  await capturarEstavel(b,path.join(saida,'extensao.png'),true);
  const {diff,...medidas}=await compararArquivos(b,path.join(saida,'desenho.png'),path.join(saida,'extensao.png'));
  await mkdir(saida,{recursive:true});
  await writeFile(path.join(saida,'diferenca.png'),Buffer.from(diff.split(',')[1],'base64'));
  const resultado={...medidas,limite:2.5,aprovado:medidas.percentual<=2.5,agora:AGORA,fonte:referencia.fonte,referencia:desenho,sha256:createHash('sha256').update(await readFile(desenho)).digest('hex'),tolerancia:8,mascaras:[],fotos:'bloco sólido #c5cbd0 nos dois lados',rede:'somente loopback; HTTP(S) externo bloqueado'};
  await writeFile(path.join(saida,'resultado.json'),JSON.stringify(resultado,null,2)+'\n');
  process.stdout.write(`${resultado.aprovado?'PASS':'FAIL'} fidelidade visualizacao: ${medidas.percentual.toFixed(4)} % de pixels diferentes; limite 2,5 %\n`);
  if(!resultado.aprovado)process.exitCode=1;
} catch(e) {process.stderr.write(e.stack+'\n');process.exitCode=1;}
finally {if(b)await b.fechar();if(servidor){servidor.closeAllConnections();await new Promise(r=>servidor.close(r));}}
