// Ajuste 0.33.3: duplo clique real, zona morta de 4 px, redesenho no meio do arraste, desenhar() idempotente, Imóvel oculto.
import assert from 'node:assert/strict';
import {criarServidor} from './servidor.mjs';
import {abrirChromium} from './chromium.mjs';
const s=criarServidor({campos:Array.from({length:6},(_,i)=>({id:i+1,rotulo:'Campo adicional '+i,tipo:'texto',ativo:true}))});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const b=await abrirChromium();let falhas=0,passes=0;
const abrir=async()=>{await b.navegar('http://127.0.0.1:'+s.address().port+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-excluir]'));};
const zerar=async()=>{await abrir();await b.avaliar(()=>GI.salvarLayoutColunas(null));await b.avaliar(()=>sessionStorage.clear());await abrir();};
const tela=async w=>{await b.cdp('Emulation.setDeviceMetricsOverride',{width:w||1600,height:1000,deviceScaleFactor:1,mobile:false});};
const medir=()=>b.avaliar(()=>{const t=document.querySelector('.gi-tabela-rolagem'),c=t.getBoundingClientRect();const o={};for(const h of document.querySelectorAll('th[data-coluna]')){const r=h.getBoundingClientRect();o[h.dataset.coluna]={l:r.left,r:r.right,w:r.width};}
 const e=document.querySelector('th[data-espacador]');return {cols:o,esp:e?e.getBoundingClientRect().width:null,cont:c.right,sw:t.scrollWidth,cw:t.clientWidth,fixo:getComputedStyle(document.querySelector('#gi-lista table')).tableLayout};});
const perto=(a,b2,m,tol=1)=>assert.ok(Math.abs(a-b2)<=tol,m+': '+a+' vs '+b2);
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const ponto=(id,alvo)=>b.avaliar((i,a)=>{const e=document.querySelector(a?'th[data-coluna="'+i+'"] [data-redimensionar]':'th[data-coluna="'+i+'"] .gi-col-titulo').getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2};},id,alvo);
const ev=(type,x,y,extra={})=>b.cdp('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra});
async function arrasto(id,dx,{passos=8,antes}={}){
 const p=await ponto(id,true);
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 await ev('mousePressed',p.x,p.y);
 for(let i=1;i<=passos;i++){await ev('mouseMoved',p.x+dx*i/passos,p.y);if(i===1&&antes)await antes();}
 await ev('mouseReleased',p.x+dx,p.y);
}
async function duploClique(id){
 const p=await ponto(id,true);
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 for(const n of [1,2]){await ev('mousePressed',p.x,p.y,{clickCount:n});await ev('mouseReleased',p.x,p.y,{clickCount:n});}
}
const layoutSalvo=()=>b.avaliar(()=>GI.layoutColunas());
async function caso(nome,fn){try{await fn();passes++;console.log('PASS '+nome);}catch(e){falhas++;console.log('FAIL '+nome+': '+e.stack);}}
try{
await caso('1) duplo clique real volta à largura numérica padrão',async()=>{
 await tela();await zerar();
 // layout nunca mexido: nada muda e nada grava
 const orig=await medir();
 await duploClique('imovel');await duploClique('bairro');await espera(1000);
 assert.equal(await layoutSalvo(),null,'não grava');
 const n=await medir();assert.equal(n.fixo,'auto');perto(n.cols.imovel.w,orig.cols.imovel.w,'Imóvel',1);perto(n.cols.bairro.w,orig.cols.bairro.w,'Bairro');
 // layout mexido: Bairro e Imóvel voltam
 await arrasto('bairro',60);
 await duploClique('bairro');
 await b.esperar(()=>Math.round(document.querySelector('th[data-coluna="bairro"]').getBoundingClientRect().width)===140);
 await arrasto('imovel',-120);
 await duploClique('imovel');
 await b.esperar(()=>Math.round(document.querySelector('th[data-coluna="imovel"]').getBoundingClientRect().width)===300);
 const d=await medir();assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções');
 await espera(1000);
 const salvo=await layoutSalvo();
 assert.equal(salvo.find(c=>c.id==='imovel').largura,300);assert.equal(salvo.find(c=>c.id==='bairro').largura,140);
});
await caso('2a) clique e tremor de 1 a 3 px não congelam nem gravam',async()=>{
 await tela();await zerar();
 const antes=await medir();
 for(const dx of [0,1,2,3]){await arrasto('bairro',dx,{passos:Math.max(dx,1)});}
 await espera(1000);
 const d=await medir();assert.equal(d.fixo,'auto','layout continua automático');
 for(const id of Object.keys(antes.cols)){perto(d.cols[id].l,antes.cols[id].l,id+' l');perto(d.cols[id].w,antes.cols[id].w,id+' w');}
 assert.equal(await layoutSalvo(),null,'nada gravado');
});
for(const width of [1600,1366])await caso('2b) arraste de +4 px muda só a coluna arrastada '+width,async()=>{
 await tela(width);await zerar();
 const antes=await medir();
 await arrasto('bairro',4,{passos:4});
 const d=await medir();
 perto(d.cols.bairro.l,antes.cols.bairro.l,'esquerda');perto(d.cols.bairro.w,antes.cols.bairro.w+4,'largura de Bairro');
 for(const id of ['capa','codigo','imovel'])perto(d.cols[id].w,antes.cols[id].w,id+' w');
 for(const id of ['valor','preenchido','status','situacao'])perto(d.cols[id].w,antes.cols[id].w,id+' w');
 assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções');
 await espera(1000);assert.ok(await layoutSalvo(),'gravou');
});
await caso('3a) redesenho assíncrono no meio do redimensionar',async()=>{
 await tela();await zerar();
 const antes=await medir();
 await arrasto('bairro',60,{antes:async()=>{await b.avaliar(()=>document.getElementById('b-buscar').click());await espera(500);}});
 const d=await medir();
 perto(d.cols.bairro.l,antes.cols.bairro.l,'esquerda');perto(d.cols.bairro.w,antes.cols.bairro.w+60,'largura de Bairro');
 assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções');
 await espera(1000);
 const salvo=await layoutSalvo();assert.ok(salvo,'gravou');
 perto(salvo.find(c=>c.id==='bairro').largura,antes.cols.bairro.w+60,'largura gravada');
 assert.equal(await b.avaliar(()=>document.querySelectorAll('tbody tr:first-child td[data-coluna]').length),9);
});
await caso('3b) redesenho assíncrono no meio da reordenação',async()=>{
 await tela();await zerar();
 const a=await ponto('bairro',false),v=await ponto('status',false);
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x,y:a.y});
 await ev('mousePressed',a.x,a.y);
 await ev('mouseMoved',a.x+10,a.y);
 await b.avaliar(()=>document.getElementById('b-buscar').click());await espera(500);
 await ev('mouseMoved',v.x,v.y);await ev('mouseReleased',v.x,v.y);
 const ordem=await b.avaliar(()=>[...document.querySelectorAll('th[data-coluna]')].map(h=>h.dataset.coluna));
 assert.ok(ordem.indexOf('status')>ordem.indexOf('valor')&&ordem.indexOf('bairro')>ordem.indexOf('valor'),ordem.join());
 await espera(1000);const salvo=await layoutSalvo();assert.ok(salvo.map(c=>c.id).indexOf('valor')<salvo.map(c=>c.id).indexOf('bairro'));
});
await caso('4) desenhar() é idempotente',async()=>{
 await tela();await zerar();
 const r=await b.avaliar(()=>{
  const lay=GIColunas.padrao([]).map(GIColunas.copiar);lay.find(c=>c.id==='imovel').largura=300;
  const antes=document.querySelector('tbody tr').textContent;
  const t=GI.iniciarColunas({estado:{campos:[],itens:[],valores:{},pagina:1,porPagina:25},layout:lay,redesenhar(){},carregar(){return Promise.resolve();},quantos(){return 0;},situacao(){return 'disponivel';}});
  t.desenhar();const a=[...document.querySelectorAll('tbody tr')].map(x=>x.querySelectorAll('td[data-coluna]').length);
  t.desenhar();const c=[...document.querySelectorAll('tbody tr')].map(x=>x.querySelectorAll('td[data-coluna]').length);
  return {a,c,antes,depois:document.querySelector('tbody tr').textContent,cs:Math.max(...[...document.querySelectorAll('tbody td')].map(x=>x.colSpan)),esp:document.querySelectorAll('tbody tr:first-child td[data-espacador]').length,ths:document.querySelectorAll('thead th[data-espacador]').length};
 });
 assert.ok(r.a.every(n=>n===9),'1ª '+r.a);assert.ok(r.c.every(n=>n===9),'2ª '+r.c);
 assert.equal(r.cs,1,'nenhuma linha tratada como vazia (colSpan)');assert.equal(r.antes,r.depois);assert.equal(r.esp,1);assert.equal(r.ths,1);
});
await caso('5) Imóvel oculto: Funções 104 px na borda, antes e depois do arraste',async()=>{
 await tela();await zerar();
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha'))if(l.querySelector('label').textContent.trim()==='Imóvel')l.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal')&&!document.querySelector('th[data-coluna="imovel"]'));
 const antes=await medir();
 assert.equal(antes.fixo,'fixed');assert.equal(antes.cols.funcoes.w,104);perto(antes.cols.funcoes.r,antes.cont,'Funções antes');assert.ok(antes.esp>0);
 await arrasto('bairro',60);
 const d=await medir();
 assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções depois');
 perto(d.cols.bairro.l,antes.cols.bairro.l,'esquerda');perto(d.cols.bairro.w,antes.cols.bairro.w+60,'largura de Bairro');
 for(const id of ['capa','codigo'])perto(d.cols[id].w,antes.cols[id].w,id);
});
}finally{await b.fechar();s.closeAllConnections();await new Promise(r=>s.close(r));}
console.log(`Ajuste 0.33.3: PASS ${passes}; FAIL ${falhas}`);if(falhas)process.exitCode=1;
