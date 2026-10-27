import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const s=criarServidor({campos:[{id:1,rotulo:'Possui restrição?',tipo:'checkbox',ativo:true}],valoresColunas:{'DEMO-001':{'1':{valor:{valor_texto:'sim'},texto:'Sim'}}}});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
let b;let falhas=0;
try {
 b=await abrirChromium();const url='http://127.0.0.1:'+s.address().port+'/app/imoveis.html?perfil=admin';
 const abrir=async()=>{await b.navegar(url);await b.esperar(()=>!!document.querySelector('[data-excluir="DEMO-001"]'));
 await b.avaliar(()=>new Promise(resolve=>{let timer;const observer=new MutationObserver(adiar);function adiar(){clearTimeout(timer);timer=setTimeout(()=>{observer.disconnect();resolve();},150);}observer.observe(document.querySelector('#gi-lista'),{childList:true,subtree:true});adiar();}));};
 for (const largura of [1600,1366]) {
 try {
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:largura,height:1000,deviceScaleFactor:1,mobile:false});
 await abrir();await b.avaliar(()=>sessionStorage.clear());
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-col-padrao'));await b.clicar('#gi-col-padrao');
 await b.esperar(()=>document.querySelector('th').dataset.coluna==='capa');
 await b.clicar('.gi-modal [data-cancelar]');await abrir();
 const medidas=await b.avaliar(()=>Array.from(document.querySelectorAll('th[data-coluna]')).filter(h=>h.querySelector('[data-funil]')).map(h=>{const t=h.querySelector('.gi-col-titulo'),f=h.querySelector('[data-funil]'),a=t.getBoundingClientRect(),z=f.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(t);const texto=range.getBoundingClientRect(),estilo=getComputedStyle(h),disponivel=h.getBoundingClientRect().width-parseFloat(estilo.paddingLeft)-parseFloat(estilo.paddingRight)-10;return {id:h.dataset.coluna,texto:texto.width,disponivel:disponivel,folga:disponivel-texto.width,separado:a.right<=z.left};}));
 assert.equal(medidas.length,7);
 for (const m of medidas) assert.ok(m.folga>=4&&m.separado,largura+'px '+JSON.stringify(m));
 console.log('PASS Correção 4 cabeçalhos padrão '+largura+'px '+JSON.stringify(medidas));
 }catch(e){falhas++;console.log('FAIL Correção 4 cabeçalhos padrão '+largura+'px: '+e.message);}
 }
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 for(const caso of [1,2,3,4,5]) {try {
 await abrir();await b.avaliar(()=>sessionStorage.clear());await abrir();
 if(caso===1){
 await b.preencher('#f-estado','preenchido');await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('1 imóve'));
 await b.esperar(()=>!!document.querySelector('[data-excluir="DEMO-001"]:not(:disabled)'));await b.clicar('[data-excluir="DEMO-001"]');await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 await b.esperar(()=>!document.querySelector('[data-excluir="DEMO-001"]'));
 assert.match(await b.avaliar(()=>document.querySelector('#gi-resumo').textContent),/0 imóveis/);
 } else if(caso===2){
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.clicar('[data-todos]');await b.clicar('[data-valor="001"]');await b.clicar('[data-funil="codigo"]');
 await b.preencher('#f-termo','DEMO-002');await b.clicar('#b-buscar');
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-valor="002"]'));
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!document.querySelector('.gi-col-popover'));
 assert.equal(await b.avaliar(()=>!!document.querySelector('[data-excluir="DEMO-002"]')),false);
 } else if(caso===3){
 const r=await b.avaliar(()=>{const t=document.querySelector('th[data-coluna="valor"] .gi-col-titulo').getBoundingClientRect(),f=document.querySelector('[data-funil="valor"]').getBoundingClientRect();return {dy:Math.abs(t.y+t.height/2-f.y-f.height/2),dx:f.x-t.right};});
 assert.ok(r.dy<2&&r.dx>=0&&r.dx<10,JSON.stringify(r));
 await writeFile(new URL('../resultados-colunas/correcao-cabecalho-horizontal.png',import.meta.url),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-editor-colunas'));
 await b.avaliar(()=>[...document.querySelectorAll('.gi-col-editor-linha')].find(l=>l.textContent.includes('Valor')).querySelector('[data-vertical]').click());await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 const v=await b.avaliar(()=>{const h=document.querySelector('th[data-coluna="valor"]').getBoundingClientRect(),t=document.querySelector('th[data-coluna="valor"] .gi-col-titulo').getBoundingClientRect(),f=document.querySelector('[data-funil="valor"]').getBoundingClientRect();return {dy:f.y-t.bottom,dx:Math.abs(f.x+f.width/2-h.x-h.width/2)};});
 assert.ok(v.dy>=0&&v.dx<2,JSON.stringify(v));
 await writeFile(new URL('../resultados-colunas/correcao-cabecalho-vertical.png',import.meta.url),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
 } else if(caso===5){
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-visivel]'));
 await b.avaliar(()=>{const l=Array.from(document.querySelectorAll('.gi-col-editor-linha')).find(l=>l.textContent.includes('Possui restrição?'));l.querySelector('[data-visivel]').click();const i=l.querySelector('[data-largura]');i.value='140';i.dispatchEvent(new Event('input',{bubbles:true}));});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!!document.querySelector('[data-funil="campo:1"]'));
 const r=await b.avaliar(()=>{const h=document.querySelector('th[data-coluna="campo:1"]'),t=h.querySelector('.gi-col-titulo'),f=h.querySelector('button'),a=t.getBoundingClientRect(),z=f.getBoundingClientRect(),q=h.getBoundingClientRect();return {right:a.right,left:z.left,end:z.right,limit:q.right,title:h.title,overflow:getComputedStyle(t).textOverflow};});
 assert.ok(r.right<=r.left&&r.end<=r.limit,JSON.stringify(r));assert.equal(r.title,'Possui restrição?');assert.equal(r.overflow,'ellipsis');
 } else {
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-editor-colunas') && !!document.querySelector('.gi-modal').style.top);
 assert.equal(await b.avaliar(()=>!!document.querySelector('[data-arrastar]')),true,'alça de arraste presente');
 const p=await b.avaliar(()=>{const a=document.querySelectorAll('[data-arrastar]');const r=a[1].getBoundingClientRect(),t=a[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,tx:t.x+t.width/2,ty:t.y+t.height/2};});
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
 await b.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.tx,y:p.ty,buttons:1});
 await b.esperar(()=>!!document.querySelector('.gi-col-editor-destino'));
 await b.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.tx,y:p.ty,button:'left',clickCount:1});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>document.querySelector('th').dataset.coluna==='codigo');
 await abrir();assert.equal(await b.avaliar(()=>document.querySelector('th').dataset.coluna),'codigo');assert.equal(await b.avaliar(()=>document.querySelector('th:last-child').dataset.coluna),'funcoes');
 }
 console.log('PASS Correção '+(caso===5?'2 item 3':'1 item '+caso));
 }catch(e){falhas++;console.log('FAIL Correção '+(caso===5?'2 item 3':'1 item '+caso)+': '+e.message);}}
}finally{if(b)await b.fechar();s.closeAllConnections();await new Promise(r=>s.close(r));}
if(falhas)process.exitCode=1;
