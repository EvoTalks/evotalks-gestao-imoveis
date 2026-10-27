import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarServidor} from './servidor.mjs';
import {abrirChromium} from './chromium.mjs';
const s=criarServidor({campos:Array.from({length:6},(_,i)=>({id:i+1,rotulo:'Campo adicional '+i,tipo:'texto',ativo:true}))});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const b=await abrirChromium();let falhas=0,passes=0;
const dir=new URL('../resultados-colunas/0.33.2/',import.meta.url);await mkdir(dir,{recursive:true});
const abrir=async()=>{await b.navegar('http://127.0.0.1:'+s.address().port+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-excluir]'));};
const zerar=async()=>{await abrir();await b.avaliar(()=>GI.salvarLayoutColunas(null));await b.avaliar(()=>sessionStorage.clear());await abrir();};
const foto=async nome=>writeFile(new URL(nome+'.png',dir),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
const medir=()=>b.avaliar(()=>{const t=document.querySelector('.gi-tabela-rolagem'),c=t.getBoundingClientRect();const o={};for(const h of document.querySelectorAll('th[data-coluna]')){const r=h.getBoundingClientRect();o[h.dataset.coluna]={l:r.left,r:r.right,w:r.width};}
 const e=document.querySelector('th[data-espacador]');return {cols:o,esp:e?e.getBoundingClientRect().width:null,cont:c.right,sw:t.scrollWidth,cw:t.clientWidth,sl:t.scrollLeft};});
const perto=(a,b2,m,tol=1)=>assert.ok(Math.abs(a-b2)<=tol,m+': '+a+' vs '+b2);
async function arrasto(id,dx,{passos=8,soltar=true,antes}={}){
 const p=await b.avaliar(i=>{const a=document.querySelector('th[data-coluna="'+i+'"] [data-redimensionar]').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2};},id);
 const ev=(type,x,extra={})=>b.cdp('Input.dispatchMouseEvent',{type,x,y:p.y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra});
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 await ev('mousePressed',p.x);
 for(let i=1;i<=passos;i++){await ev('mouseMoved',p.x+dx*i/passos);if(i===1&&antes)await antes();}
 if(soltar)await ev('mouseReleased',p.x+dx);
}
async function caso(nome,fn){try{await fn();passes++;console.log('PASS '+nome);}catch(e){falhas++;console.log('FAIL '+nome+': '+e.stack);}}
try{
for(const width of [1600,1366])await caso('a) borda direita de Bairro '+width,async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 const antes=await medir();assert.equal(antes.esp,null);
 if(width===1600)await foto('antes-mais60');
 await arrasto('bairro',60);
 const d=await medir();console.log('  medidas',width,'antes',JSON.stringify(antes.cols.bairro),'depois',JSON.stringify(d.cols.bairro),'esp',d.esp);
 perto(d.cols.bairro.l,antes.cols.bairro.l,'esquerda de Bairro');perto(d.cols.bairro.r,antes.cols.bairro.r+60,'direita de Bairro');
 perto(d.cols.valor.l,d.cols.bairro.r,'Valor encosta em Bairro');
 for(const id of ['capa','codigo','imovel']){perto(d.cols[id].l,antes.cols[id].l,id+' l');perto(d.cols[id].w,antes.cols[id].w,id+' w');}
 assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções na borda');
 if(width===1600)await foto('depois-mais60');
 const meio=await medir();
 await arrasto('bairro',-100);
 const e=await medir();console.log('  menos100',JSON.stringify(e.cols.bairro),'esp',e.esp);
 perto(e.cols.bairro.l,antes.cols.bairro.l,'esquerda parada');perto(e.cols.bairro.r,meio.cols.bairro.r-100,'direita recuou');
 perto(e.cols.valor.l,e.cols.bairro.r,'Valor recuou');
 assert.ok(e.esp>0,'espaçador '+e.esp);assert.equal(e.cols.funcoes.w,104);perto(e.cols.funcoes.r,e.cont,'Funções na borda');
 assert.ok(e.sw<=e.cw+1);
 if(width===1600)await foto('depois-menos100');
});
await caso('c) layout personalizado com rolagem',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha'))if(l.textContent.includes('Campo adicional'))l.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:1"]'));
 const antes=await medir();assert.ok(antes.sw>antes.cw);
 await arrasto('situacao',-1,{passos:1});await arrasto('status',80);
 const d=await medir();
 perto(d.cols.status.l,antes.cols.status.l,'esquerda de Status');perto(d.cols.status.r,antes.cols.status.r+80,'direita de Status',2);
 perto(d.cols.situacao.l,d.cols.status.r,'Situação anda');perto(d.sw,antes.sw+80,'scrollWidth',3);
 assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'Funções presa');
 await b.avaliar(()=>{const e=document.querySelector('.gi-tabela-rolagem');e.scrollLeft=e.scrollWidth;});
 assert.ok(await b.avaliar(()=>[...document.querySelectorAll('td[data-coluna="funcoes"] button')].every(x=>{const r=x.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===x;})));
});
await caso('d) persistência sem espaçador e recarga idêntica',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await arrasto('bairro',-100);const antes=await medir();
 await new Promise(r=>setTimeout(r,1000));
 const salvo=await b.avaliar(()=>GI.layoutColunas());
 assert.ok(salvo&&salvo.length>=9&&!salvo.some(c=>/esp/i.test(c.id)),JSON.stringify(salvo));
 assert.ok(salvo.every(c=>c.visivel===false||c.id==='funcoes'||typeof c.largura==='number'),JSON.stringify(salvo));
 assert.equal(salvo.at(-1).largura,104);
 await abrir();const d=await medir();
 for(const id of Object.keys(antes.cols)){perto(d.cols[id].l,antes.cols[id].l,id+' l');perto(d.cols[id].w,antes.cols[id].w,id+' w');}
});
await caso('Funções 104 px, Imóvel 300 e espaçador com a sobra',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await zerar();
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha')){if(l.querySelector('label').textContent.trim()==='Imóvel'){const i=l.querySelector('[data-largura]');i.value='300';i.dispatchEvent(new Event('input',{bubbles:true}));}}});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal')&&!!document.querySelector('th[data-espacador]'));
 const d=await medir();
 assert.equal(await b.avaliar(()=>getComputedStyle(document.querySelector('#gi-lista table')).tableLayout),'fixed');
 perto(d.cols.imovel.w,300,'Imóvel');assert.ok(d.esp>0);assert.equal(d.cols.funcoes.w,104);perto(d.cols.funcoes.r,d.cont,'borda');
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:1000,deviceScaleFactor:1,mobile:false});
 await b.esperar(()=>{const t=document.querySelector('.gi-tabela-rolagem');return t.scrollWidth>t.clientWidth;});
 const e=await medir();perto(e.cols.imovel.w,300,'Imóvel estreito');assert.equal(e.cols.funcoes.w,104);assert.equal(e.esp,0);
});
}finally{await b.fechar();s.closeAllConnections();await new Promise(r=>s.close(r));}
console.log(`Ajuste 0.33.2: PASS ${passes}; FAIL ${falhas}`);if(falhas)process.exitCode=1;
