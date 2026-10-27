import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarServidor} from './servidor.mjs';
import {abrirChromium} from './chromium.mjs';
const s=criarServidor({campos:Array.from({length:6},(_,i)=>({id:i+1,rotulo:'Campo adicional '+i,tipo:'texto',ativo:true}))});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const b=await abrirChromium();let falhas=0,passes=0;
const dir=new URL('../resultados-colunas/0.33.1/',import.meta.url);await mkdir(dir,{recursive:true});
const abrir=async()=>{await b.navegar('http://127.0.0.1:'+s.address().port+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-excluir]'));};
const limpo=async()=>{await b.avaliar(()=>sessionStorage.clear());await abrir();};
const foto=async nome=>writeFile(new URL(nome+'.png',dir),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
async function caso(nome,fn){try{await fn();passes++;console.log('PASS '+nome);}catch(e){falhas++;console.log('FAIL '+nome+': '+e.stack);}}
try{
for(const width of [1600,1366])await caso('separadores e largura '+width,async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await abrir();
 const r=await b.avaliar(()=>[...document.querySelectorAll('th[data-coluna]')].map(h=>{const a=h.querySelector('[data-redimensionar]'),p=a&&getComputedStyle(a,'::after');return {id:h.dataset.coluna,w:h.getBoundingClientRect().width,line:p&&parseFloat(p.width),cor:p&&p.backgroundColor,fundo:getComputedStyle(h).backgroundColor};}));
 assert.equal(r.at(-1).w,104);for(const h of r.slice(0,-1))assert.ok(h.line>=1&&h.cor!==h.fundo,JSON.stringify(h));
 assert.equal(await b.avaliar(()=>!!document.querySelector('th:last-child [data-redimensionar]')),false);await foto('padrao-'+width);
});
await caso('Funções fixa no editor e rolagem',async()=>{
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 assert.deepEqual(await b.avaliar(()=>{const e=[...document.querySelectorAll('.gi-col-editor-linha')].at(-1).querySelector('[data-largura]');return [e.disabled,e.value];}),[true,'104']);
 await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha'))if(l.textContent.includes('Campo adicional'))l.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:1"]'));
 for(const frac of [0,.5,1]){
 await b.avaliar(f=>{const e=document.querySelector('.gi-tabela-rolagem');e.scrollLeft=(e.scrollWidth-e.clientWidth)*f;},frac);
 const r=await b.avaliar(()=>{const e=document.querySelector('.gi-tabela-rolagem'),lim=e.getBoundingClientRect().right;return [...document.querySelectorAll('[data-coluna="funcoes"]')].filter(e=>e.tagName!=='COL').map(h=>({w:h.getBoundingClientRect().width,delta:Math.abs(h.getBoundingClientRect().right-lim),opaco:getComputedStyle(h).backgroundColor,click:[...h.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})}));});
 assert.ok(r.length>1);for(const h of r){assert.equal(h.w,104);assert.ok(h.delta<=1&&h.click,JSON.stringify(h));assert.notEqual(h.opaco,'rgba(0, 0, 0, 0)');}if(frac===.5)await foto('rolagem-meio');
 }
});
await caso('funil instantâneo e catálogo reaproveitado',async()=>{
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 assert.doesNotMatch(await b.avaliar(()=>document.querySelector('.gi-col-popover').textContent),/Alinhar|Texto vertical|Ocultar|Limpar|Cancelar|OK/);
 await b.preencher('.gi-col-popover input[type=search]','00');
 const rede=await b.avaliar(()=>bancada.rede.length);
 const avant=await b.avaliar(()=>{const liste=document.querySelector('.gi-col-valores');liste.style.maxHeight='20px';liste.scrollTop=10;const p=document.querySelector('.gi-col-popover').getBoundingClientRect();return {scroll:liste.scrollTop,x:p.x,y:p.y};});
 await b.avaliar(()=>{const e=document.querySelector('[data-valor]');e.focus({preventScroll:true});e.click();});
 await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('2 imóveis'));
 assert.deepEqual(await b.avaliar(()=>[!!document.querySelector('.gi-col-popover'),document.activeElement.hasAttribute('data-valor'),document.querySelector('.gi-col-popover input[type=search]').value]),[true,true,'00']);
 assert.deepEqual(await b.avaliar(()=>{const p=document.querySelector('.gi-col-popover').getBoundingClientRect();return {scroll:document.querySelector('.gi-col-valores').scrollTop,x:p.x,y:p.y};}),avant);
 await b.clicar('[data-ordem="desc"]');await b.esperar(()=>document.querySelector('#gi-corpo tr').textContent.includes('DEMO-003'));
 assert.equal(await b.avaliar(()=>document.querySelector('[data-ordem="desc"]').getAttribute('aria-pressed')),'true');
 await b.clicar('[data-ordem="desc"]');await b.esperar(()=>document.querySelector('[data-ordem="desc"]').getAttribute('aria-pressed')==='false');
 await b.preencher('.gi-col-popover input[type=search]','002');
 assert.match(await b.avaliar(()=>document.querySelector('[data-todos]').parentElement.textContent),/Selecionar todos os resultados/);
 await b.clicar('[data-todos]');await b.clicar('[data-todos]');await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('1 imóveis'));
 assert.equal(await b.avaliar(()=>bancada.rede.length),rede);
 await b.avaliar(()=>{document.querySelector('.gi-col-valores').style.maxHeight='';});
 await foto('funil-aberto');await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await b.avaliar(()=>!!document.querySelector('.gi-col-popover')),false);assert.match(await b.avaliar(()=>document.querySelector('#gi-corpo').textContent),/DEMO-002/);
});

await caso('correção: catálogo aplicado não fica preso até as capas',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await limpo();
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.avaliar(()=>{document.querySelector('[data-todos]').click();});await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('0 imóveis'));
 await b.avaliar(()=>{document.querySelector('[data-valor]').click();});await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('1 imóveis'));
 await abrir();await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('1 imóveis'));
 await b.avaliar(()=>{window.__capas=GI.capasImoveis;GI.capasImoveis=()=>new Promise(r=>{window.__soltar=()=>r({});});});
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.avaliar(()=>{document.querySelectorAll('[data-valor]')[1].click();});
 await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('2 imóveis')&&!!window.__soltar);
 // capas pendentes: a nova busca precisa do termo novo, não do catálogo velho.
 await b.preencher('#f-termo','Casa');await b.clicar('#b-buscar');
 await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('1 imóveis'));
 const t=await b.avaliar(()=>document.querySelector('#gi-corpo').textContent);
 await b.avaliar(()=>{window.__soltar&&window.__soltar();GI.capasImoveis=window.__capas;});
 assert.match(t,/Beta/);assert.doesNotMatch(t,/Alfa|Gama/);
});
await caso('correção: sem filtro o funil volta ao caminho comum',async()=>{
 await limpo();
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.avaliar(()=>{document.querySelector('[data-valor]').click();});
 await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('passam no filtro'));
 await b.avaliar(()=>{document.querySelector('[data-valor]').click();});
 await b.esperar(()=>!document.querySelector('#gi-resumo').textContent.includes('passam no filtro'));
 assert.doesNotMatch(await b.avaliar(()=>document.querySelector('#gi-resumo').textContent),/passam no filtro/);
});
await caso('correção: fechar por clique fora não rola a tabela',async()=>{
 await limpo();
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.avaliar(()=>{const e=document.querySelector('.gi-tabela-rolagem');e.scrollLeft=e.scrollWidth;});
 const antes=await b.avaliar(()=>document.querySelector('.gi-tabela-rolagem').scrollLeft);assert.ok(antes>0);
 await b.avaliar(()=>{document.querySelector('#gi-resumo').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));});
 assert.equal(await b.avaliar(()=>!!document.querySelector('.gi-col-popover')),false);
 assert.equal(await b.avaliar(()=>document.querySelector('.gi-tabela-rolagem').scrollLeft),antes);
 await b.clicar('[data-funil="codigo"]');await b.esperar(()=>!!document.querySelector('[data-todos]'));
 await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await b.avaliar(()=>document.activeElement.getAttribute('data-funil')),'codigo');
});
await caso('correção: dois pedidos rápidos abrem só o último popover',async()=>{
 await abrir();
 await b.avaliar(()=>{document.querySelector('[data-funil="codigo"]').click();document.querySelector('[data-funil="bairro"]').click();});
 await b.esperar(()=>!!document.querySelector('.gi-col-popover'));await new Promise(r=>setTimeout(r,400));
 assert.deepEqual(await b.avaliar(()=>[...document.querySelectorAll('.gi-col-popover')].map(p=>p.getAttribute('aria-label'))),['Filtro de Bairro']);
});
await caso('Funções fica em 104 px com table-layout fixed e Imóvel largo',async()=>{
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await abrir();
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha')){const v=l.querySelector('[data-visivel]');if(l.textContent.includes('Campo adicional')&&v.checked)v.click();
  if(/^\s*⋮⋮\s*Imóvel/.test(l.textContent)||l.querySelector('label').textContent.trim()==='Imóvel'){const i=l.querySelector('[data-largura]');i.value='300';i.dispatchEvent(new Event('input',{bubbles:true}));}}});
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal')&&!document.querySelector('th[data-coluna="campo:1"]')&&!!document.querySelector('th[data-coluna="imovel"]'));
 const r=await b.avaliar(()=>{const t=document.querySelector('.gi-tabela-rolagem'),f=document.querySelector('th[data-coluna="funcoes"]').getBoundingClientRect();return {w:f.width,delta:Math.abs(f.right-t.getBoundingClientRect().right),sobra:t.scrollWidth-t.clientWidth,fixed:getComputedStyle(document.querySelector('#gi-lista table')).tableLayout};});
 assert.equal(r.fixed,'fixed');assert.equal(r.w,104,JSON.stringify(r));assert.ok(r.delta<=1,JSON.stringify(r));
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:1000,deviceScaleFactor:1,mobile:false});
 await b.esperar(()=>{const t=document.querySelector('.gi-tabela-rolagem');return t.scrollWidth>t.clientWidth;});
 const e=await b.avaliar(()=>({imovel:document.querySelector('th[data-coluna="imovel"]').getBoundingClientRect().width,funcoes:document.querySelector('th[data-coluna="funcoes"]').getBoundingClientRect().width}));
 assert.equal(Math.round(e.imovel),300,JSON.stringify(e));assert.equal(e.funcoes,104);
});
}finally{await b.fechar();s.closeAllConnections();await new Promise(r=>s.close(r));}
console.log(`Ajuste 0.33.1: PASS ${passes}; FAIL ${falhas}`);if(falhas)process.exitCode=1;
