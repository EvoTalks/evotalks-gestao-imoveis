import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const produtos = Array.from({length:65},(_,i)=>({id:i+1,internalcode:'DEMO-'+String(i+1).padStart(3,'0'),name:'Imóvel '+String(i+1).padStart(3,'0'),description:'[Locacao] Casa',category:'Casa > Cidade > Bairro',value:(i+1)*10000,brand:'DEMONSTRACAO'}));
const valores = Object.fromEntries(produtos.map((p,i)=>[p.internalcode,{'1':{valor:{campo_id:1,valor_texto:i>=50?'sim':'nao',observacao:'Observação <segura>'},texto:i>=50?'sim':'não',observacao:'Observação <segura>'}}]));
const s = criarServidor({produtosSinteticos:produtos,campos:[{id:1,rotulo:'Possui restrição?',tipo:'checkbox',ativo:true}],valoresColunas:valores,situacoes:Object.fromEntries(produtos.slice(50).map(p=>[p.internalcode,'reservado']))});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
let b;
try {
 b=await abrirChromium(); const url='http://127.0.0.1:'+s.address().port+'/app/imoveis.html?perfil=admin';
 const esperar=()=>b.esperar(()=>document.querySelectorAll('#gi-corpo tr').length===25);
 const post=()=>b.avaliar(()=>bancada.chamadas.filter(c=>c.method==='POST'&&c.caminho.endsWith('/colunas/eu')).map(c=>JSON.parse(c.body)));
 await b.navegar(url); await esperar();
 assert.deepEqual(await b.avaliar(()=>[...document.querySelectorAll('col')].map(c=>c.style.width)),['88px','92px','','140px','115px','121px','115px','190px','104px']);
 assert.equal(await b.avaliar(()=>bancada.rede.some(r=>r.includes('limit=500'))),false,'padrão não carrega catálogo');
 async function arrastar(selector,dx,target) {
   const ponto=await b.avaliar(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);
   const fim=target?await b.avaliar(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},target):{x:ponto.x+dx,y:ponto.y};
   await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...ponto}); await b.cdp('Input.dispatchMouseEvent',{type:'mousePressed',...ponto,button:'left',clickCount:1});
   await b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...fim,button:'left',buttons:1}); await b.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...fim,button:'left',clickCount:1});
 }
 await arrastar('th[data-coluna="codigo"] [data-redimensionar]',35);
 await b.esperar(()=>bancada.chamadas.some(c=>c.method==='POST'&&c.caminho.endsWith('/colunas/eu')));
 assert.ok((await post()).at(-1).layout.find(c=>c.id==='codigo').largura>92);
 await arrastar('th[data-coluna="bairro"] .gi-col-titulo',0,'th[data-coluna="codigo"] .gi-col-titulo');
 await b.esperar(()=>document.querySelectorAll('th')[1].dataset.coluna==='bairro');
 await b.clicar('#b-colunas'); await b.esperar(()=>!!document.querySelector('[data-indice="8"]'));
 await b.avaliar(()=>{const linha=[...document.querySelectorAll('.gi-col-editor-linha')].find(e=>e.textContent.includes('Possui restrição?')); linha.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal-rodape [data-ok]');
 await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:1"]'));
 await b.navegar(url); await esperar(); assert.equal(await b.avaliar(()=>!!document.querySelector('th[data-coluna="campo:1"]')),true);
 await b.clicar('[data-funil="campo:1"]'); await b.esperar(()=>!!document.querySelector('[data-valor="Sim"]'));
 assert.match(await b.avaliar(()=>document.querySelector('.gi-col-valores').textContent),/Sim \(15\)/);
 await b.clicar('[data-todos]'); await b.clicar('[data-valor="Sim"]');
 await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 await b.esperar(()=>document.querySelectorAll('#gi-corpo tr').length===15);
 assert.equal(await b.avaliar(()=>[...document.querySelectorAll('[data-situacao]')].every(e=>Number(e.dataset.situacao.slice(-3))>=51)),true);
 assert.match(await b.avaliar(()=>document.querySelector('#gi-resumo').textContent),/15 imóveis/);
 await b.navegar(url);await b.esperar(()=>document.querySelectorAll('#gi-corpo tr').length===15);
 assert.equal(await b.avaliar(()=>document.querySelector('th:last-child').dataset.coluna),'funcoes');
 await b.clicar('[data-funil="campo:1"]');await b.esperar(()=>!!document.querySelector('.gi-col-popover input[type=search]'));
 await b.preencher('.gi-col-popover input[type=search]','Si');assert.equal(await b.avaliar(()=>document.querySelectorAll('.gi-col-valores label').length),1);
 await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await b.esperar(()=>!document.querySelector('.gi-col-popover'));
 assert.equal(await b.avaliar(()=>document.activeElement.dataset.funil),'campo:1');
 await b.clicar('[data-funil="campo:1"]');await b.esperar(()=>!!document.querySelector('.gi-col-popover'));await b.clicar('[data-funil="campo:1"]');assert.equal(await b.avaliar(()=>document.querySelectorAll('#gi-corpo tr').length),15);
 assert.ok((await post()).every(p=>!p.layout||p.layout.every(c=>Object.keys(c).sort().join(',')==='alinhamento,id,largura,vertical,visivel')),'portal recebe só layout');
 await b.clicar('[data-funil="imovel"]'); await b.esperar(()=>!!document.querySelector('[data-ordem="desc"]')); await b.clicar('[data-ordem="desc"]');
 await b.esperar(()=>document.querySelector('#gi-corpo tr').textContent.includes('DEMO-065'));
 await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-editor-colunas'));
 await b.avaliar(()=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(l=>l.textContent.includes('Possui restrição?'));l.querySelector('[data-vertical]').click();l.querySelector('[data-alinhamento="centro"]').click();});
 await b.clicar('.gi-modal [data-ok]');
 await b.esperar(()=>!document.querySelector('.gi-modal'));
 assert.equal(await b.avaliar(()=>document.querySelector('th[data-coluna="campo:1"]').classList.contains('gi-alinha-centro')),true);
 assert.equal(await b.avaliar(()=>getComputedStyle(document.querySelector('th[data-coluna="campo:1"] .gi-col-titulo')).writingMode),'vertical-rl');
 await b.clicar('#b-limpar'); await esperar();
 await b.preencher('#f-estado','preenchido'); await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('65 imóveis'));
 assert.match(await b.avaliar(()=>document.querySelector('#gi-origem').textContent),/65 no total/);
 await b.clicar('#b-limpar'); await esperar();
 await b.preencher('#f-situacao','reservado'); await b.esperar(()=>document.querySelectorAll('#gi-corpo tr').length===15);
 await b.clicar('#b-colunas'); await b.esperar(()=>!!document.querySelector('#gi-col-padrao')); await b.clicar('#gi-col-padrao');
 await b.esperar(()=>!document.querySelector('th[data-coluna="campo:1"]'));
 assert.equal((await post()).at(-1).layout,null);
 await b.clicar('.gi-modal-rodape [data-ok]');
 await b.navegar(url+'&tema=escuro'); await esperar();
 await b.clicar('[data-funil="codigo"]'); await b.esperar(()=>!!document.querySelector('.gi-col-popover input[type=search]'));
 assert.deepEqual(await b.avaliar(()=>{const e=getComputedStyle(document.querySelector('.gi-col-popover input[type=search]'));return [e.backgroundColor,e.color];}),['rgb(255, 255, 255)','rgb(0, 0, 0)']);
 assert.deepEqual(b.erros,[]);
 process.stdout.write('PASS colunas: 65 imóveis, padrão sem carga extra, resize e POST, arraste, editor e persistência, filtro da página 3, contagem, ordenação, alinhamento, vertical, Situação global, restaurar e tema escuro; FAIL 0\n');
} finally {if(b)await b.fechar();s.closeAllConnections();await new Promise(r=>s.close(r));}
// Endpoint de layout indisponível preserva padrão e permite consultar o catálogo.
const fora=criarServidor({colunasFora:true}); await new Promise(r=>fora.listen(0,'127.0.0.1',r));
try { b=await abrirChromium();await b.navegar('http://127.0.0.1:'+fora.address().port+'/app/imoveis.html');await b.esperar(()=>document.querySelectorAll('[data-abrir]').length===3);assert.equal(await b.avaliar(()=>document.querySelectorAll('th').length),9); process.stdout.write('PASS layout fora do ar: padrão e catálogo preservados\n'); }
finally {if(b)await b.fechar();fora.closeAllConnections();await new Promise(r=>fora.close(r));}
// Regressões da Correção 1 também fazem parte da bancada obrigatória de colunas.
await import('./correcao-colunas.testar.mjs');
