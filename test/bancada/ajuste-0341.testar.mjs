import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarServidor} from './servidor.mjs';
import {abrirChromium} from './chromium.mjs';
const campos=Array.from({length:6},(_,i)=>({id:i+1,rotulo:'Campo adicional '+i,tipo:'texto',ativo:true}));
const s=criarServidor({campos});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const produtos=Array.from({length:65},(_,i)=>({id:i+1,internalcode:'DEMO-'+String(i+1).padStart(3,'0'),name:'Imóvel '+String(i+1).padStart(3,'0'),description:'[Locacao] Casa',category:'Casa > Cidade > Bairro',value:(i+1)*10000,brand:'DEMONSTRACAO'}));
const grande=criarServidor({produtosSinteticos:produtos,campos});
await new Promise(r=>grande.listen(0,'127.0.0.1',r));
let srv=s;
const b=await abrirChromium();let falhas=0,passes=0;
const dir=new URL('../resultados-colunas/0.34.1/',import.meta.url);await mkdir(dir,{recursive:true});
const abrir=async()=>{await b.navegar('http://127.0.0.1:'+srv.address().port+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-excluir]'));};
const zerar=async()=>{await abrir();await b.avaliar(()=>GI.salvarLayoutColunas(null));await b.avaliar(()=>sessionStorage.clear());await abrir();};
const foto=async nome=>writeFile(new URL(nome+'.png',dir),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
const medir=()=>b.avaliar(()=>{const t=document.querySelector('.gi-tabela-rolagem'),c=t.getBoundingClientRect();const o={};for(const h of document.querySelectorAll('th[data-coluna]')){const r=h.getBoundingClientRect();o[h.dataset.coluna]={l:r.left,r:r.right,w:r.width};}
 const e=document.querySelector('th[data-espacador]');return {cols:o,esp:e?e.getBoundingClientRect().width:null,cont:c.right,sw:t.scrollWidth,cw:t.clientWidth,sl:t.scrollLeft,tabela:getComputedStyle(document.querySelector('#gi-lista table')).tableLayout};});
const medirRodape=()=>b.avaliar(()=>{const r=document.querySelector('.gi-rodape').getBoundingClientRect(),p=document.querySelector('#b-proxima').getBoundingClientRect(),o=document.querySelector('#gi-origem').getBoundingClientRect(),a=document.querySelector('#b-anterior').getBoundingClientRect();return {rodapeR:r.right,proximaR:p.right,origemL:o.left,anteriorL:a.left};});
const janela=async()=>b.avaliar(()=>[document.documentElement.scrollWidth,innerWidth]);
const mouseFora=()=>b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
const perto=(a,b2,m,tol=1)=>assert.ok(Math.abs(a-b2)<=tol,m+': '+a+' vs '+b2);
const ligarCampo=async()=>{await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha'))if(l.textContent.includes('Campo adicional 0'))l.querySelector('[data-visivel]').click();});await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:1"]'));await new Promise(r=>setTimeout(r,300));};
const alcaCentro=id=>b.avaliar(i=>{const a=document.querySelector('th[data-coluna="'+i+'"] [data-redimensionar]').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2};},id);
const corAfter=sel=>b.avaliar(q=>getComputedStyle(document.querySelector(q),'::after').backgroundColor,sel);
async function arrasto(id,dx,{passos=8,soltar=true,antes}={}){
 const p=await alcaCentro(id);
 const ev=(type,x,extra={})=>b.cdp('Input.dispatchMouseEvent',{type,x,y:p.y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra});
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 await ev('mousePressed',p.x);
 for(let i=1;i<=passos;i++){await ev('mouseMoved',p.x+dx*i/passos);if(i===1&&antes)await antes();}
 if(soltar)await ev('mouseReleased',p.x+dx);
}
async function caso(nome,fn){try{await fn();passes++;console.log('PASS '+nome);}catch(e){falhas++;console.log('FAIL '+nome+': '+e.stack);}}
try{
await caso('1) layout padrão sem espaçadora nos três tamanhos',async()=>{
 for(const width of [800,1366,1920]){
  await b.cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
  const m=await medir();assert.equal(m.esp,null,'espaçadora em '+width);
  assert.equal(m.cols.funcoes.w,104,'Funções '+width);
  const [sw,iw]=await janela();assert.ok(sw<=iw,'rolagem da página em '+width+': '+sw+' > '+iw);
  const r=await medirRodape();perto(r.proximaR,r.rodapeR,'próxima na borda direita em '+width);assert.ok(r.origemL<r.anteriorL,'origem à esquerda em '+width);
  await foto('layout-padrao-'+width);
 }
});
for(const width of [1366,1920])await caso('2) campo ligado sem arrastar '+width,async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await ligarCampo();
 const m=await medir();
 assert.equal(m.esp,null,'espaçadora');assert.equal(m.tabela,'fixed','tableLayout');
 if(width===1920)assert.ok(m.cols.imovel.w>300,'Imóvel '+m.cols.imovel.w);
 else {assert.ok(m.sw>m.cw,'1366 sem sobra: rolagem horizontal '+m.sw+' vs '+m.cw);perto(m.cols.imovel.w,300,'Imóvel no mínimo sem sobra');await b.avaliar(()=>{const e=document.querySelector('.gi-tabela-rolagem');e.scrollLeft=e.scrollWidth;});}
 const f=await medir();
 assert.equal(f.cols.funcoes.w,104,'Funções');perto(f.cols.funcoes.r,f.cont,'Funções na borda direita (fim da rolagem)');
 await foto('campo-sem-arrasto-'+width);
});
await caso('2) campo ligado sem arrastar 800 com rolagem',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:800,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await ligarCampo();
 const m=await medir();
 assert.ok(m.sw>m.cw,'rolagem horizontal: '+m.sw+' vs '+m.cw);
 perto(m.cols.imovel.w,300,'Imóvel estreito');
 await foto('campo-sem-arrasto-800');
});
await caso('3) primeiro arraste com campo ligado, sem salto em 1600',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await ligarCampo();
 const antes=await medir();
 await arrasto('bairro',60);
 const d=await medir();
 perto(d.cols.bairro.l,antes.cols.bairro.l,'esquerda de Bairro parada');
 perto(d.cols.bairro.r,antes.cols.bairro.r+60,'direita de Bairro +60');
 perto(d.cols.imovel.w,antes.cols.imovel.w,'largura de Imóvel sem salto');
});
await caso('4) espaçadora com a sobra, alça transparente e arraste da coluna',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 const antes=await medir();
 await arrasto('bairro',-100);
 const e=await medir();
 assert.ok(e.esp>0,'espaçadora '+e.esp);assert.equal(e.cols.funcoes.w,104,'Funções');perto(e.cols.funcoes.r,e.cont,'Funções na borda');
 perto(e.cols.bairro.l,antes.cols.bairro.l,'esquerda de Bairro parada');
 await mouseFora();
 const ultima=await b.avaliar(()=>document.querySelector('th[data-espacador]').previousElementSibling.dataset.coluna);
 console.log('  última coluna antes da espaçadora: '+ultima);
 assert.equal(await corAfter('th[data-coluna="'+ultima+'"] [data-redimensionar]'),'rgba(0, 0, 0, 0)','alça da última coluna com o mouse fora');
 assert.notEqual(await corAfter('th[data-coluna="bairro"] [data-redimensionar]'),'rgba(0, 0, 0, 0)','alça de Bairro deve seguir visível');
 await foto('espacadora-alca-transparente');
 const p=await alcaCentro(ultima);
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 assert.notEqual(await corAfter('th[data-coluna="'+ultima+'"] [data-redimensionar]'),'rgba(0, 0, 0, 0)','alça com o mouse em cima');
 const antes2=await medir();
 await arrasto('situacao',-40);
 const d=await medir();
 perto(d.cols.situacao.l,antes2.cols.situacao.l,'esquerda de Situação parada');
 perto(d.cols.situacao.r,antes2.cols.situacao.r-40,'direita de Situação −40');
});
await caso('5) paginação no canto direito com 65 imóveis',async()=>{
 srv=grande;
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await b.esperar(()=>document.querySelectorAll('#gi-corpo tr').length===25);
 await b.clicar('#b-proxima');
 await b.esperar(()=>document.querySelector('#gi-pagina').textContent==='2');
 assert.equal(await b.avaliar(()=>document.querySelector('#gi-pagina').textContent),'2');
 assert.equal(await b.avaliar(()=>document.querySelector('#b-anterior').disabled),false,'anterior habilitado');
 srv=s;
});
}finally{await b.fechar();s.closeAllConnections();grande.closeAllConnections();await new Promise(r=>s.close(r));await new Promise(r=>grande.close(r));}
console.log(`Ajuste 0.34.1: PASS ${passes}; FAIL ${falhas}`);if(falhas)process.exitCode=1;
