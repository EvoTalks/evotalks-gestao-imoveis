import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarServidor} from './servidor.mjs';
import {abrirChromium} from './chromium.mjs';
const longo='Campo adicional 6 com um nome extremamente comprido para provar que a ficha quebra a linha em vez de criar rolagem horizontal na janela de colunas ocultas';
const campos=[...Array.from({length:6},(_,i)=>({id:i+1,rotulo:'Campo adicional '+i,tipo:'texto',ativo:true})),{id:7,rotulo:longo,tipo:'texto',ativo:true}];
const s=criarServidor({campos});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const produtos=Array.from({length:100},(_,i)=>({id:i+1,internalcode:'DEMO-'+String(i+1).padStart(3,'0'),name:'Imóvel '+String(i+1).padStart(3,'0'),description:'[Locacao] Casa',category:'Casa > Cidade > Bairro '+(i%2?'B':'A'),value:(i+1)*10000,brand:'DEMONSTRACAO'}));
const grande=criarServidor({produtosSinteticos:produtos,campos});
await new Promise(r=>grande.listen(0,'127.0.0.1',r));
let srv=s;
const b=await abrirChromium();let falhas=0,passes=0;
const dir=new URL('../resultados-colunas/0.35.0/',import.meta.url);await mkdir(dir,{recursive:true});
const PADRAO='capa,codigo,imovel,bairro,valor,preenchido,status,situacao,funcoes';
const pausa=ms=>new Promise(r=>setTimeout(r,ms));
const perto=(a,b2,m,tol=1)=>assert.ok(Math.abs(a-b2)<=tol,m+': '+a+' vs '+b2);
const url=()=>'http://127.0.0.1:'+srv.address().port+'/app/imoveis.html?perfil=admin';
const abrir=async()=>{await b.navegar(url());await b.esperar(()=>!!document.querySelector('[data-excluir]')&&!!document.querySelector('th[data-coluna="funcoes"]'));};
const zerar=async()=>{await abrir();await b.avaliar(()=>GI.salvarLayoutColunas(null));await b.avaliar(()=>sessionStorage.clear());await abrir();};
const foto=async nome=>writeFile(new URL(nome+'.png',dir),Buffer.from((await b.cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
const tela=(width,height=1000)=>b.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
// ---- medidas
const ths=()=>b.avaliar(()=>{const th={},ordem=[];for(const h of document.querySelectorAll('th[data-coluna]')){const r=h.getBoundingClientRect(),t=h.querySelector('.gi-col-titulo').getBoundingClientRect();th[h.dataset.coluna]={l:r.left,r:r.right,w:r.width,m:r.left+r.width/2,tx:t.left+t.width/2,ty:t.top+t.height/2};ordem.push(h.dataset.coluna);}
 const rolagem=document.querySelector('.gi-tabela-rolagem'),rol=rolagem.getBoundingClientRect(),cab=document.querySelector('#gi-lista thead').getBoundingClientRect(),tab=document.querySelector('#gi-lista table').getBoundingClientRect();
 return {th,ordem,rol:{l:rol.left,r:rol.right,t:rol.top,b:rol.bottom},cab:{t:cab.top,b:cab.bottom},tab:{b:tab.bottom},sl:rolagem.scrollLeft,sw:rolagem.scrollWidth,cw:rolagem.clientWidth};});
const ordemTela=async()=>(await ths()).ordem.join();
const sobre=()=>b.avaliar(()=>{const r=e=>{const x=e.getBoundingClientRect(),c=getComputedStyle(e);return {l:x.left,r:x.right,t:x.top,b:x.bottom,w:x.width,h:x.height,pos:c.position,pe:c.pointerEvents,bg:c.backgroundColor,disp:c.display,texto:e.textContent,classes:e.className,noBody:e.parentNode===document.body};};
 return {linhas:[...document.querySelectorAll('.gi-col-indicador')].map(r),fantasmas:[...document.querySelectorAll('.gi-col-fantasma')].map(r),origem:[...document.querySelectorAll('th.gi-col-origem')].map(h=>h.dataset.coluna)};});
const posts=()=>b.avaliar(()=>bancada.chamadas.filter(c=>c.method==='POST'&&c.caminho.endsWith('/colunas/eu')).map(c=>JSON.parse(c.body)));
const layoutSalvo=()=>b.avaliar(()=>GI.layoutColunas());
const idsDe=l=>l.map(c=>c.id).join();
// o layout gravado leva também os campos adicionais ocultos, sempre antes de Funções (ou onde o usuário os pôs)
const CAMPOS=Array.from({length:7},(_,i)=>'campo:'+(i+1)).join();
const gravado=visiveis=>visiveis.replace(',funcoes',','+CAMPOS+',funcoes');
// "nada gravado": nenhuma chamada nova de gravação e o layout do portal igual, depois de passar o atraso de 600 ms
async function semGravar(n0,l0,msg){await pausa(900);assert.equal((await posts()).length,n0,msg+': houve gravação');assert.deepEqual(await layoutSalvo(),l0,msg+': layout salvo mudou');}
async function gravouNovo(n0){await b.esperar(n=>bancada.chamadas.filter(c=>c.method==='POST'&&c.caminho.endsWith('/colunas/eu')).length>n,n0);return (await posts()).at(-1);}
// ---- ponteiro e teclado reais (CDP)
const apertar=(x,y)=>b.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
const mover=(x,y,segurando=true)=>b.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:segurando?'left':'none',buttons:segurando?1:0});
const soltar=(x,y)=>b.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
async function levar(de,para,passos=10){for(let i=1;i<=passos;i++)await mover(de.x+(para.x-de.x)*i/passos,de.y+(para.y-de.y)*i/passos);}
const VK={Escape:27,ArrowLeft:37,ArrowRight:39};
async function tecla(key,{alt=false}={}){const p={key,code:key,windowsVirtualKeyCode:VK[key],nativeVirtualKeyCode:VK[key],modifiers:alt?1:0};await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',...p});await b.cdp('Input.dispatchKeyEvent',{type:'keyUp',...p});}
const centro=sel=>b.avaliar(q=>{const e=document.querySelector(q);if(!e)throw new Error('ausente: '+q);e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},sel);
async function clicarReal(sel){const p=await centro(sel);await mover(p.x,p.y,false);await apertar(p.x,p.y);await soltar(p.x,p.y);}
// arrasta o título de `id` até `alvo`; `meio` roda com o botão ainda pressionado
async function arrasto(id,alvo,{passos=10,solta=true,meio}={}){
 const g=await ths(),o={x:g.th[id].tx,y:g.th[id].ty};
 await mover(o.x,o.y,false);await apertar(o.x,o.y);await levar(o,alvo,passos);
 if(meio)await meio();
 if(solta)await soltar(alvo.x,alvo.y);
 return o;
}
const alca=id=>b.avaliar(i=>{const a=document.querySelector('th[data-coluna="'+i+'"] [data-redimensionar]').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2};},id);
const ligarCampos=async()=>{await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));await b.avaliar(()=>{for(const l of document.querySelectorAll('.gi-col-editor-linha'))if(l.textContent.includes('Campo adicional'))l.querySelector('[data-visivel]').click();});await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:7"]'));await pausa(300);};
const abrirEditor=async()=>{await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-editor-colunas .gi-col-editor-linha')&&!!document.querySelector('#gi-col-fichas'));};
const fichas=()=>b.avaliar(()=>[...document.querySelectorAll('#gi-col-fichas .gi-col-ficha')].map(f=>f.textContent));
async function caso(nome,fn){try{await fn();passes++;console.log('PASS '+nome);}catch(e){falhas++;console.log('FAIL '+nome+': '+e.stack);}}
try{
// ===================================================================== 1
for(const width of [800,1366,1920])await caso('1) Bairro solto logo depois do meio de Valor, '+width+': linha, fantasma, ordem e reabrir',async()=>{
 srv=s;await tela(width);await zerar();
 let g=await ths();
 const falta=g.th.valor.m+4-(g.th.funcoes.l-60);
 if(falta>0){await b.avaliar(f=>{document.querySelector('.gi-tabela-rolagem').scrollLeft+=f;},falta);g=await ths();}
 assert.ok(g.th.bairro.tx>g.rol.l+5,'título de Bairro visível: '+g.th.bairro.tx);
 const alvo={x:g.th.valor.m+4,y:g.th.bairro.ty},n0=(await posts()).length;
 assert.ok(alvo.x<g.th.funcoes.l-1,'ponto de soltura antes de Funções');
 await arrasto('bairro',alvo,{solta:false,meio:async()=>{
  const o=await sobre(),g2=await ths();
  assert.equal(o.linhas.length,1,'uma linha azul');assert.equal(o.fantasmas.length,1,'um fantasma');assert.deepEqual(o.origem,['bairro'],'título de origem marcado');
  const l=o.linhas[0],f=o.fantasmas[0];
  assert.equal(l.pos,'fixed');assert.equal(l.pe,'none');assert.equal(l.bg,'rgb(25, 118, 210)');perto(l.w,2,'espessura da linha',0.01);assert.ok(l.noBody,'linha no mesmo pai do popover');
  perto(l.t,g2.cab.t,'topo da linha = topo do cabeçalho');perto(l.b,Math.min(g2.tab.b,g2.rol.b),'fim da linha = fim da parte visível da tabela');
  assert.ok(l.r<=g2.th.funcoes.l+0.5,'linha nunca à direita da borda esquerda de Funções: '+l.r+' > '+g2.th.funcoes.l);
  const esperado=Math.max(g2.rol.l,Math.min(g2.th.preenchido.l,g2.th.funcoes.l-1));
  perto((l.l+l.r)/2,esperado,'linha no ponto onde cai (antes de Preenchido)',1.5);
  assert.equal(f.texto,'Bairro');assert.equal(f.pos,'fixed');assert.equal(f.pe,'none');assert.ok(f.noBody);assert.ok(!f.classes.includes('gi-col-fantasma-fora'),'fantasma com destino');
  perto(f.l,alvo.x+12,'fantasma segue o ponteiro (x)');perto(f.t,alvo.y+12,'fantasma segue o ponteiro (y)');
  assert.ok(f.r<=width&&f.b<=1000&&l.t>=0,'sem corte na janela');
  await foto('arraste-'+width);
 }});
 await soltar(alvo.x,alvo.y);
 const depois=await sobre();assert.equal(depois.linhas.length+depois.fantasmas.length+depois.origem.length,0,'linha, fantasma e marca somem ao soltar');
 const esperada='capa,codigo,imovel,valor,bairro,preenchido,status,situacao,funcoes';
 assert.equal(await ordemTela(),esperada);
 assert.equal(idsDe((await gravouNovo(n0)).layout),gravado(esperada),'layout gravado');
 await abrir();assert.equal(await ordemTela(),esperada,'reabrir mantém a ordem');
 const g3=await ths();perto(g3.th.funcoes.w,104,'Funções 104 px');
});
// ===================================================================== 2
await caso('2) Status solto na metade esquerda de Bairro fica antes dele; na metade direita fica depois',async()=>{
 srv=s;await tela(1600);await zerar();
 let g=await ths();
 await arrasto('status',{x:g.th.bairro.l+10,y:g.th.bairro.ty},{meio:async()=>{
  const o=await sobre(),g2=await ths();assert.equal(o.linhas.length,1);perto((o.linhas[0].l+o.linhas[0].r)/2,g2.th.bairro.l,'linha na borda esquerda de Bairro',1.5);assert.equal(o.fantasmas[0].texto,'Status');
 }});
 await b.esperar(()=>document.querySelector('th[data-coluna="status"]')?.previousElementSibling?.dataset.coluna==='imovel');
 assert.equal(await ordemTela(),'capa,codigo,imovel,status,bairro,valor,preenchido,situacao,funcoes');
 await zerar();g=await ths();
 await arrasto('status',{x:g.th.bairro.l+g.th.bairro.w-10,y:g.th.bairro.ty});
 await b.esperar(()=>document.querySelector('th[data-coluna="status"]')?.previousElementSibling?.dataset.coluna==='bairro');
 assert.equal(await ordemTela(),'capa,codigo,imovel,bairro,status,valor,preenchido,situacao,funcoes','soltar na metade direita da vizinha agora move');
});
// ===================================================================== 3
await caso('3) Solto sobre Funções: vira a última antes de Funções, que segue 104 px na borda',async()=>{
 srv=s;await tela(1600);await zerar();
 const g=await ths(),alvo={x:g.th.funcoes.l+95,y:g.th.capa.ty},n0=(await posts()).length;
 await arrasto('capa',alvo,{solta:false,meio:async()=>{
  const o=await sobre(),g2=await ths();assert.equal(o.linhas.length,1);
  assert.ok(o.linhas[0].r<=g2.th.funcoes.l+0.5,'linha nunca à direita da borda esquerda de Funções: '+o.linhas[0].r+' > '+g2.th.funcoes.l);
  perto((o.linhas[0].l+o.linhas[0].r)/2,g2.th.funcoes.l-1,'linha colada em Funções',1.5);
  const f=await b.avaliar(()=>{const r=document.querySelector('.gi-col-fantasma').getBoundingClientRect();return {l:r.left,r:r.right,vw:innerWidth};});
  assert.ok(f.r<=f.vw&&f.l>=0,'título dentro da janela perto da borda direita: '+JSON.stringify(f));
  await foto('soltar-sobre-funcoes');
 }});
 await soltar(alvo.x,alvo.y);
 const esperada='codigo,imovel,bairro,valor,preenchido,status,situacao,capa,funcoes';
 assert.equal(await ordemTela(),esperada);
 const g3=await ths();perto(g3.th.funcoes.w,104,'Funções 104 px');perto(g3.th.funcoes.r,g3.rol.r,'Funções na borda direita');
 const salvo=await gravouNovo(n0);assert.equal(idsDe(salvo.layout),'codigo,imovel,bairro,valor,preenchido,status,situacao,'+CAMPOS+',capa,funcoes','a coluna solta entra logo antes de Funções');assert.equal(salvo.layout.at(-1).id,'funcoes');assert.equal(salvo.layout.at(-1).largura,104);
});
// ===================================================================== 4
await caso('4) Esc no meio do arraste e depois soltar (e pointercancel): ordem igual, nada gravado, sem linha nem fantasma',async()=>{
 srv=s;await tela(1600);await zerar();
 const n0=(await posts()).length,l0=await layoutSalvo(),g=await ths(),alvo={x:g.th.codigo.l+5,y:g.th.codigo.ty};
 await arrasto('valor',alvo,{solta:false,meio:async()=>{const o=await sobre();assert.equal(o.linhas.length,1,'a linha existia antes do Esc');assert.equal(o.fantasmas.length,1);}});
 await tecla('Escape');
 let o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0,'Esc limpa linha, fantasma e marca');
 await mover(alvo.x+20,alvo.y);o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length,0,'depois do Esc o movimento não recria nada');
 await soltar(alvo.x+20,alvo.y);
 assert.equal(await ordemTela(),PADRAO,'ordem igual');
 await semGravar(n0,l0,'Esc');
 // pointercancel: o gesto é abortado pelo navegador, nada se move
 await arrasto('valor',alvo,{solta:false,meio:async()=>{assert.equal((await sobre()).linhas.length,1);}});
 await b.avaliar(()=>document.querySelector('th[data-coluna="valor"]').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
 o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0,'pointercancel limpa tudo');
 await soltar(alvo.x,alvo.y);
 assert.equal(await ordemTela(),PADRAO,'ordem igual após pointercancel');
 await semGravar(n0,l0,'pointercancel');
});
// ===================================================================== 5
await caso('5) Solto a mais de 44 px abaixo do cabeçalho (ou acima): ordem igual, nada gravado',async()=>{
 srv=s;await tela(1600);await zerar();
 const n0=(await posts()).length,l0=await layoutSalvo(),g=await ths(),x=g.th.codigo.l+5;
 // 40 px abaixo ainda é destino; 50 px abaixo não é
 await arrasto('valor',{x,y:g.cab.b+40},{solta:false,meio:async()=>{const o=await sobre();assert.equal(o.linhas.length,1,'+40 px ainda tem destino');assert.equal(o.linhas[0].disp==='none',false);assert.ok(!o.fantasmas[0].classes.includes('gi-col-fantasma-fora'));}});
 await mover(x,g.cab.b+50);
 let o=await sobre();assert.equal(o.linhas[0].disp,'none','+50 px: linha some');assert.ok(o.fantasmas[0].classes.includes('gi-col-fantasma-fora'),'fantasma ganha gi-col-fantasma-fora');
 await foto('arraste-fora');
 await mover(x,g.cab.b+60);await soltar(x,g.cab.b+60);
 o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0);
 assert.equal(await ordemTela(),PADRAO);await semGravar(n0,l0,'abaixo');
 // acima do cabeçalho
 await arrasto('valor',{x,y:g.cab.t-20},{solta:false,meio:async()=>{const o2=await sobre();assert.equal(o2.linhas[0].disp,'none','acima: linha some');assert.ok(o2.fantasmas[0].classes.includes('gi-col-fantasma-fora'));}});
 await soltar(x,g.cab.t-20);
 assert.equal(await ordemTela(),PADRAO);await semGravar(n0,l0,'acima');
});
// ===================================================================== 6
await caso('6) Clique simples não move; clique no funil abre o funil; a borda segue mudando só a largura',async()=>{
 srv=s;await tela(1600);await zerar();
 const n0=(await posts()).length,l0=await layoutSalvo();
 let g=await ths();const v={x:g.th.valor.tx,y:g.th.valor.ty};
 await mover(v.x,v.y,false);await apertar(v.x,v.y);await soltar(v.x,v.y);
 let o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0,'clique simples não cria nada');
 assert.equal(await ordemTela(),PADRAO);
 // tremor de 3 px fica dentro da zona morta de 4 px
 await mover(v.x,v.y,false);await apertar(v.x,v.y);await mover(v.x+3,v.y);
 o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0,'tremor de 3 px não inicia o arraste');
 await soltar(v.x+3,v.y);assert.equal(await ordemTela(),PADRAO);
 await semGravar(n0,l0,'clique e tremor');
 // arraste que termina no mesmo lugar: a ordem não muda, então nada é gravado
 await arrasto('valor',{x:g.th.valor.l+10,y:v.y},{meio:async()=>{assert.equal((await sobre()).linhas.length,1,'o arraste estava ativo');}});
 assert.equal(await ordemTela(),PADRAO);await semGravar(n0,l0,'arraste que volta ao mesmo lugar');
 // um arraste completo cancelado deixa o Esc livre para o funil
 await arrasto('valor',{x:g.th.codigo.l+5,y:v.y},{solta:false});await tecla('Escape');await soltar(g.th.codigo.l+5,v.y);
 await clicarReal('th[data-coluna="bairro"] [data-funil]');
 await b.esperar(()=>!!document.querySelector('.gi-col-popover [data-valor]'));
 assert.equal(await b.avaliar(()=>document.querySelector('.gi-col-popover').getAttribute('aria-label')),'Filtro de Bairro');
 o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length,0,'abrir o funil não arrasta');assert.equal(await ordemTela(),PADRAO);
 await tecla('Escape');await b.esperar(()=>!document.querySelector('.gi-col-popover'));
 await semGravar(n0,l0,'funil');
 // borda: só a largura
 g=await ths();const a=await alca('bairro');
 await mover(a.x,a.y,false);await apertar(a.x,a.y);await levar(a,{x:a.x+60,y:a.y},8);
 o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0,'redimensionar não mostra linha nem fantasma');
 await soltar(a.x+60,a.y);
 const salvo=await gravouNovo(n0),g4=await ths();
 assert.equal(g4.ordem.join(),PADRAO);perto(g4.th.bairro.w,g.th.bairro.w+60,'Bairro +60');
 for(const id of ['codigo','valor','preenchido','status','situacao'])perto(g4.th[id].w,g.th[id].w,'largura de '+id+' intacta');
 assert.equal(idsDe(salvo.layout),gravado(PADRAO));perto(salvo.layout.find(c=>c.id==='bairro').largura,g.th.bairro.w+60,'largura gravada de Bairro',1.5);
});
// ===================================================================== 7
await caso('7) Largura 800 com campos ligados: parado perto de Funções rola sozinho; ao soltar, Funções segue a última e na borda',async()=>{
 srv=s;await tela(800);await zerar();await ligarCampos();
 await b.avaliar(()=>{document.querySelector('.gi-tabela-rolagem').scrollLeft=0;});
 let g=await ths();assert.ok(g.sw>g.cw+300,'rolagem horizontal real: '+g.sw+' vs '+g.cw);
 const y=g.th.codigo.ty,o0={x:g.th.codigo.tx,y},perto_fr={x:g.th.funcoes.l-12,y};
 await mover(o0.x,o0.y,false);await apertar(o0.x,o0.y);await levar(o0,perto_fr,12);
 const a0=(await ths()).sl;await pausa(500);const g1=await ths(),a1=g1.sl;
 assert.ok(a1>=a0+64,'scrollLeft aumenta com o ponteiro parado: '+a0+' -> '+a1);
 assert.equal((a1-a0)%16,0,'rola em passos de 16 px: '+(a1-a0));
 const ov=await sobre();assert.equal(ov.linhas.length,1);assert.ok(ov.linhas[0].r<=g1.th.funcoes.l+0.5,'linha não passa de Funções durante a rolagem');
 await foto('rolagem-800');
 // perto da borda esquerda da tabela: rola de volta
 const esq={x:g1.rol.l+10,y};await levar(perto_fr,esq,10);
 const e0=(await ths()).sl;await pausa(500);const e1=(await ths()).sl;
 assert.ok(e1<=e0-64,'scrollLeft diminui perto da borda esquerda: '+e0+' -> '+e1);assert.equal((e0-e1)%16,0);
 // volta para perto de Funções e solta
 await levar(esq,perto_fr,10);await pausa(200);await soltar(perto_fr.x,perto_fr.y);
 const s0=(await ths()).sl;await pausa(400);const g2=await ths();
 assert.equal(g2.sl,s0,'a rolagem automática para ao soltar');
 const o=await sobre();assert.equal(o.linhas.length+o.fantasmas.length+o.origem.length,0);
 assert.equal(g2.ordem.at(-1),'funcoes','Funções segue a última');assert.ok(g2.ordem.indexOf('codigo')>1,'Código saiu do lugar: '+g2.ordem.join());
 perto(g2.th.funcoes.w,104,'Funções 104 px');perto(g2.th.funcoes.r,g2.rol.r,'Funções na borda direita');
 const salvo=(await posts()).at(-1);assert.equal(salvo.layout.at(-1).id,'funcoes');assert.equal(salvo.layout.at(-1).largura,104);
});
// ===================================================================== 8
await caso('8) Teclado: Alt+setas trocam com a vizinha visível, foco e anúncio, pontas, oculta no meio, seta sem Alt, Funções sem tabindex',async()=>{
 srv=s;await tela(1600);await zerar();
 const anuncio=()=>b.avaliar(()=>document.querySelector('.gi-col-anuncio').textContent);
 const limpar=()=>b.avaliar(()=>{document.querySelector('.gi-col-anuncio').textContent='';});
 const focar=id=>b.avaliar(i=>{document.querySelector('th[data-coluna="'+i+'"]').focus();return document.activeElement.dataset.coluna;},id);
 const ativo=()=>b.avaliar(()=>({coluna:document.activeElement.dataset&&document.activeElement.dataset.coluna,th:document.activeElement.tagName==='TH',ligado:document.activeElement.isConnected}));
 // atributos e região de anúncio
 const attrs=await b.avaliar(()=>[...document.querySelectorAll('th[data-coluna]')].map(h=>({id:h.dataset.coluna,tab:h.getAttribute('tabindex'),ks:h.getAttribute('aria-keyshortcuts'),title:h.getAttribute('title')})));
 for(const a of attrs){if(a.id==='funcoes'){assert.equal(a.tab,null,'Funções sem tabindex');assert.equal(a.ks,null);}else{assert.equal(a.tab,'0','tabindex em '+a.id);assert.equal(a.ks,'Alt+ArrowLeft Alt+ArrowRight');}assert.ok(a.title,'title mantido em '+a.id);}
 assert.equal(await focar('funcoes'),undefined,'Funções não recebe foco');
 const reg=await b.avaliar(()=>{const r=[...document.querySelectorAll('.gi-col-anuncio')];const e=r[0].getBoundingClientRect();return {n:r.length,role:r[0].getAttribute('role'),live:r[0].getAttribute('aria-live'),pai:r[0].parentNode.id,w:e.width,h:e.height};});
 assert.deepEqual({n:reg.n,role:reg.role,live:reg.live,pai:reg.pai},{n:1,role:'status',live:'polite',pai:'gi-lista'});assert.ok(reg.w<=1&&reg.h<=1,'visualmente oculta: '+reg.w+'x'+reg.h);
 let n0=(await posts()).length;const l0=await layoutSalvo();
 // Alt+→ em Valor
 await focar('valor');await limpar();await tecla('ArrowRight',{alt:true});
 assert.equal(await ordemTela(),'capa,codigo,imovel,bairro,preenchido,valor,status,situacao,funcoes');
 assert.deepEqual(await ativo(),{coluna:'valor',th:true,ligado:true},'foco volta ao título refeito');
 assert.equal(await anuncio(),'Coluna Valor movida: posição 6 de 8.');
 const foco=await b.avaliar(()=>{const c=getComputedStyle(document.activeElement);return {estilo:c.outlineStyle,cor:c.outlineColor,largura:c.outlineWidth};});
 assert.deepEqual(foco,{estilo:'solid',cor:'rgb(25, 118, 210)',largura:'2px'},'foco visível com contorno azul');
 await foto('teclado-foco');
 // Alt+← volta
 await limpar();await tecla('ArrowLeft',{alt:true});
 assert.equal(await ordemTela(),PADRAO);assert.deepEqual(await ativo(),{coluna:'valor',th:true,ligado:true});
 assert.equal(await anuncio(),'Coluna Valor movida: posição 5 de 8.');
 await gravouNovo(n0);
 // pontas: não muda e não grava
 n0=(await posts()).length;const l1=await layoutSalvo();
 await focar('capa');await limpar();await tecla('ArrowLeft',{alt:true});
 assert.equal(await anuncio(),'Coluna Capa já está na ponta.');assert.equal(await ordemTela(),PADRAO);
 await focar('situacao');await limpar();await tecla('ArrowRight',{alt:true});
 assert.equal(await anuncio(),'Coluna Situação já está na ponta.','a última visível não passa por Funções');assert.equal(await ordemTela(),PADRAO);
 // seta sem Alt e Alt com o foco no funil
 await focar('valor');await limpar();await tecla('ArrowRight');await tecla('ArrowLeft');
 assert.equal(await anuncio(),'','seta sem Alt não anuncia');assert.equal(await ordemTela(),PADRAO);
 await b.avaliar(()=>document.querySelector('th[data-coluna="valor"] [data-funil]').focus());await tecla('ArrowRight',{alt:true});
 assert.equal(await anuncio(),'','Alt+seta só vale com o foco no próprio título');assert.equal(await ordemTela(),PADRAO);
 await semGravar(n0,l1,'pontas, seta sem Alt e foco no funil');
 // oculta entre as duas: troca com a vizinha visível
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('[data-largura]'));
 await b.avaliar(()=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(x=>x.textContent.includes('Preenchido'));l.querySelector('[data-visivel]').click();});
 n0=(await posts()).length;await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('th[data-coluna="preenchido"]'));await gravouNovo(n0);
 assert.equal(await ordemTela(),'capa,codigo,imovel,bairro,valor,status,situacao,funcoes');
 n0=(await posts()).length;await focar('valor');await limpar();await tecla('ArrowRight',{alt:true});
 assert.equal(await ordemTela(),'capa,codigo,imovel,bairro,status,valor,situacao,funcoes','troca com a visível, pulando a oculta');
 assert.equal(await anuncio(),'Coluna Valor movida: posição 6 de 7.');
 const salvo=await gravouNovo(n0);
 assert.equal(idsDe(salvo.layout),gravado('capa,codigo,imovel,bairro,status,preenchido,valor,situacao,funcoes'));assert.equal(salvo.layout.find(c=>c.id==='preenchido').visivel,false,'a oculta continua oculta');
});
// ===================================================================== 9
await caso('9) Fichas das ocultas no editor: aparecem, tiram a ficha, desmarcar cria a ficha sem perder o foco, Salvar aplica, Cancelar não muda, sem ocultas e sem rolagem horizontal',async()=>{
 srv=s;await tela(1366);await zerar();
 let n0=(await posts()).length;const l0=await layoutSalvo();
 await abrirEditor();
 const nomes=[...Array.from({length:6},(_,i)=>'Campo adicional '+i),longo];
 assert.deepEqual(await fichas(),nomes,'uma ficha por oculta, na ordem do rascunho');
 const cab=await b.avaliar(()=>({titulo:document.querySelector('#gi-col-fichas strong').textContent,dica:document.querySelector('#gi-col-fichas small').textContent,ids:[...document.querySelectorAll('.gi-col-ficha')].map(f=>f.dataset.mostrar),linhas:document.querySelectorAll('.gi-col-editor-linha').length,antes:document.querySelector('#gi-col-fichas').nextElementSibling.id}));
 assert.equal(cab.titulo,'Colunas ocultas');assert.equal(cab.dica,'Para mudar a ordem, arraste o título no cabeçalho ou use Alt+← e Alt+→ com o título em foco.');
 assert.deepEqual(cab.ids,['campo:1','campo:2','campo:3','campo:4','campo:5','campo:6','campo:7']);assert.equal(cab.linhas,16,'a lista completa continua igual');assert.equal(cab.antes,'gi-editor-colunas','fichas acima da lista');
 // clicar na ficha 2 (Campo adicional 1)
 await clicarReal('.gi-col-ficha[data-mostrar="campo:2"]');
 assert.deepEqual(await fichas(),nomes.filter(n=>n!=='Campo adicional 1'),'a ficha some');
 const r1=await b.avaliar(()=>{const ls=[...document.querySelectorAll('.gi-col-editor-linha')],pen=ls[ls.length-2];return {texto:pen.textContent,marcada:pen.querySelector('[data-visivel]').checked,ultima:ls.at(-1).textContent.includes('Funções'),foco:document.activeElement.dataset.mostrar};});
 assert.ok(r1.texto.includes('Campo adicional 1'),'a linha vai para antes de Funções');assert.equal(r1.marcada,true,'caixa marcada');assert.equal(r1.ultima,true);assert.equal(r1.foco,'campo:3','foco na próxima ficha');
 // última ficha: sem próxima, o foco vai ao Salvar
 await clicarReal('.gi-col-ficha[data-mostrar="campo:7"]');
 assert.equal(await b.avaliar(()=>document.activeElement.matches('.gi-modal [data-ok]')),true,'sem próxima ficha, foco em Salvar');
 // desmarcar Situação: cria a ficha sem recriar a lista e sem perder o foco
 await b.avaliar(()=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(x=>x.textContent.includes('Situação'));l.__marca=1;l.querySelector('[data-visivel]').__marca=1;});
 await clicarReal('.gi-col-editor-linha:nth-child(8) [data-visivel]');
 const r2=await b.avaliar(()=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(x=>x.textContent.includes('Situação'));return {lista:l.__marca===1&&l.isConnected,caixa:l.querySelector('[data-visivel]').__marca===1,foco:document.activeElement===l.querySelector('[data-visivel]'),marcada:l.querySelector('[data-visivel]').checked};});
 assert.deepEqual(r2,{lista:true,caixa:true,foco:true,marcada:false},'lista intacta e foco mantido');
 assert.deepEqual(await fichas(),['Situação','Campo adicional 0','Campo adicional 2','Campo adicional 3','Campo adicional 4','Campo adicional 5'],'ficha de Situação aparece na ordem do rascunho');
 assert.equal((await posts()).length,n0,'tudo é rascunho até Salvar');assert.deepEqual(await layoutSalvo(),l0);
 // Salvar aplica
 await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));await gravouNovo(n0);
 const aplicada='capa,codigo,imovel,bairro,valor,preenchido,status,campo:2,campo:7,funcoes';
 assert.equal(await ordemTela(),aplicada,'Salvar aplica: Situação oculta, campos 2 e 7 antes de Funções');
 // Cancelar não muda nada
 n0=(await posts()).length;const l1=await layoutSalvo();
 await abrirEditor();assert.equal((await fichas()).length,6);
 await clicarReal('.gi-col-ficha[data-mostrar="campo:1"]');await clicarReal('.gi-col-ficha[data-mostrar="campo:3"]');await b.avaliar(()=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(x=>x.textContent.includes('Capa'));l.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal [data-cancelar]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 assert.equal(await ordemTela(),aplicada,'Cancelar não muda a tela');await semGravar(n0,l1,'Cancelar');
 await abrirEditor();assert.equal((await fichas()).length,6,'o rascunho descartado não volta');
 // sem ocultas
 for(let i=0;i<6;i++)await b.clicar('#gi-col-fichas .gi-col-ficha');
 const vazio=await b.avaliar(()=>({texto:document.querySelector('#gi-col-fichas').textContent,fichas:document.querySelectorAll('.gi-col-ficha').length}));
 assert.equal(vazio.fichas,0);assert.ok(vazio.texto.includes('Todas as colunas estão visíveis.'));assert.ok(vazio.texto.includes('Para mudar a ordem, arraste o título'));
 await b.clicar('.gi-modal [data-cancelar]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 await semGravar(n0,l1,'sem ocultas');
 // sem rolagem horizontal e fichas inteiras em 800, 1366 e 1920
 await zerar();
 for(const width of [800,1366,1920]){
  await tela(width);await abrir();await abrirEditor();
  const m=await b.avaliar(()=>{const q=s=>document.querySelector(s),caixa=q('#gi-col-fichas').getBoundingClientRect(),fs=[...document.querySelectorAll('.gi-col-ficha')].map(f=>{const r=f.getBoundingClientRect();return {l:r.left,r:r.right,h:r.height};});
   return {modal:[q('.gi-modal').scrollWidth,q('.gi-modal').clientWidth],corpo:[q('.gi-modal-corpo').scrollWidth,q('.gi-modal-corpo').clientWidth],fichas:[q('#gi-col-fichas').scrollWidth,q('#gi-col-fichas').clientWidth],pagina:[document.documentElement.scrollWidth,innerWidth],caixa:{l:caixa.left,r:caixa.right},fs};});
  assert.ok(m.modal[0]<=m.modal[1],'modal sem rolagem horizontal em '+width+': '+m.modal);assert.ok(m.corpo[0]<=m.corpo[1],'corpo sem rolagem em '+width+': '+m.corpo);assert.ok(m.fichas[0]<=m.fichas[1],'fichas sem rolagem em '+width+': '+m.fichas);assert.ok(m.pagina[0]<=m.pagina[1],'página sem rolagem em '+width+': '+m.pagina);
  assert.equal(m.fs.length,7);for(const f of m.fs)assert.ok(f.l>=m.caixa.l-1&&f.r<=m.caixa.r+1,'ficha dentro da caixa em '+width+': '+JSON.stringify(f));
  const alturas=m.fs.map(f=>f.h);assert.ok(Math.max(...alturas)>=Math.min(...alturas)*1.5,'a ficha comprida quebra linha em '+width+': '+alturas);
  await foto('fichas-'+width);await b.clicar('.gi-modal [data-cancelar]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 }
});
// ===================================================================== 10
await caso('10) Coluna oculta não filtra: filtro e ordenação saem ao ocultar e ao restaurar padrão, ao abrir, e a falha de gravação mantém tudo',async()=>{
 srv=grande;await tela(1600);await zerar();
 const sessao=()=>b.avaliar(()=>JSON.parse(sessionStorage.getItem('gi.filtros.'+GI.idUsuarioColunas())));
 const resumo=()=>b.avaliar(()=>document.querySelector('#gi-resumo').textContent);
 const primeira=()=>b.avaliar(()=>document.querySelector('#gi-corpo tr [data-detalhe]').dataset.detalhe);
 const codigos=()=>b.avaliar(()=>[...new Set([...document.querySelectorAll('#gi-corpo tr [data-detalhe]')].map(e=>e.dataset.detalhe))]);
 const pagina=()=>b.avaliar(()=>document.querySelector('#gi-pagina').textContent);
 const aguardarSemFiltro=()=>b.esperar(()=>!document.querySelector('#gi-resumo').textContent.includes('passam no filtro')&&document.querySelectorAll('#gi-corpo tr [data-detalhe]').length>=25);
 const salvarEditor=async()=>{await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));};
 const desmarcar=async(texto)=>b.avaliar(t=>{const l=[...document.querySelectorAll('.gi-col-editor-linha')].find(x=>x.textContent.includes(t));l.querySelector('[data-visivel]').click();},texto);
 const filtrarBairroA=async()=>{await clicarReal('th[data-coluna="bairro"] [data-funil]');await b.esperar(()=>!!document.querySelector('.gi-col-popover [data-valor]'));await b.clicar('[data-todos]');await b.clicar('[data-valor="Bairro A"]');await tecla('Escape');await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('50 imóveis passam no filtro'));};
 await aguardarSemFiltro();
 // a) filtro + página 2, ocultar Bairro e Salvar
 await filtrarBairroA();assert.deepEqual((await sessao()).filtros,{bairro:['Bairro A']});
 await b.clicar('#b-proxima');await b.esperar(()=>document.querySelector('#gi-pagina').textContent==='2');
 await abrirEditor();await desmarcar('Bairro');
 assert.deepEqual((await sessao()).filtros,{bairro:['Bairro A']},'antes de Salvar o filtro segue valendo');
 await salvarEditor();await b.esperar(()=>!document.querySelector('th[data-coluna="bairro"]'));await aguardarSemFiltro();
 assert.equal(await pagina(),'1','volta para a página 1');assert.ok((await codigos()).includes('DEMO-002'),'lista volta ao total (Bairro B aparece)');assert.deepEqual((await sessao()).filtros,{},'filtro saiu da sessão');
 await abrir();assert.deepEqual((await sessao()).filtros,{});assert.ok((await codigos()).includes('DEMO-002'),'reabrir não restaura o filtro');
 await abrirEditor();await clicarReal('.gi-col-ficha[data-mostrar="bairro"]');await salvarEditor();await b.esperar(()=>!!document.querySelector('th[data-coluna="bairro"]'));await aguardarSemFiltro();
 assert.equal(await b.avaliar(()=>document.querySelector('th[data-coluna="bairro"] [data-funil]').classList.contains('gi-col-ativo')),false,'Bairro volta sem filtro');assert.ok((await codigos()).includes('DEMO-002'));
 // b) ordenação
 await clicarReal('th[data-coluna="bairro"] [data-funil]');await b.esperar(()=>!!document.querySelector('.gi-col-popover [data-ordem="desc"]'));await b.clicar('[data-ordem="desc"]');await tecla('Escape');
 await b.esperar(()=>(document.querySelector('#gi-corpo tr td[data-coluna="bairro"]')||{}).textContent==='Bairro B');
 assert.deepEqual((await sessao()).ordem,{id:'bairro',desc:true});assert.equal(await primeira(),'DEMO-002','ordenado por Bairro Z→A');
 await abrirEditor();await desmarcar('Bairro');await salvarEditor();await b.esperar(()=>!document.querySelector('th[data-coluna="bairro"]'));
 await b.esperar(()=>((document.querySelector('#gi-corpo tr [data-detalhe]')||{}).dataset||{}).detalhe==='DEMO-001');
 assert.equal((await sessao()).ordem,null,'ordenação saiu da sessão');
 await abrir();assert.equal((await sessao()).ordem,null);assert.equal(await primeira(),'DEMO-001','reabrir não restaura a ordenação');
 await abrirEditor();await clicarReal('.gi-col-ficha[data-mostrar="bairro"]');await salvarEditor();await b.esperar(()=>!!document.querySelector('th[data-coluna="bairro"]'));
 assert.equal(await primeira(),'DEMO-001');assert.equal(await b.avaliar(()=>document.querySelector('th[data-coluna="bairro"] [data-funil]').classList.contains('gi-col-ativo')),false);
 // c) gravação falhando: filtro e layout continuam
 await filtrarBairroA();
 const l0=await layoutSalvo(),n0=(await posts()).length;
 await b.avaliar(()=>{window.__salvar=GI.salvarLayoutColunas;GI.salvarLayoutColunas=()=>Promise.reject(new Error('Falha simulada da gravação'));});
 await abrirEditor();await desmarcar('Bairro');await b.clicar('.gi-modal [data-ok]');
 await b.esperar(()=>((document.querySelector('.gi-modal-recado')||{}).textContent||'').length>0);
 assert.equal(await b.avaliar(()=>!!document.querySelector('.gi-modal')),true,'o modal segue aberto');
 const estado=async()=>({filtros:(await sessao()).filtros,resumo:await resumo(),bairro:await b.avaliar(()=>!!document.querySelector('th[data-coluna="bairro"]'))});
 assert.deepEqual(await estado(),{filtros:{bairro:['Bairro A']},resumo:'50 imóveis passam no filtro',bairro:true},'Salvar falhando mantém filtro, lista e coluna');
 await b.clicar('#gi-col-padrao');await pausa(500);
 assert.deepEqual(await estado(),{filtros:{bairro:['Bairro A']},resumo:'50 imóveis passam no filtro',bairro:true},'Restaurar padrão falhando mantém tudo');
 await b.clicar('.gi-modal [data-cancelar]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 await b.avaliar(()=>{GI.salvarLayoutColunas=window.__salvar;});
 assert.deepEqual(await layoutSalvo(),l0,'layout salvo intacto');assert.equal((await posts()).length,n0);
 // d) na abertura: filtro e ordenação de coluna oculta vindos da sessão saem
 await abrir();
 await b.avaliar(()=>sessionStorage.setItem('gi.filtros.'+GI.idUsuarioColunas(),JSON.stringify({filtros:{'campo:1':['Sim'],bairro:['Bairro A']},ordem:{id:'campo:1',desc:false}})));
 await abrir();await b.esperar(()=>document.querySelector('#gi-resumo').textContent.includes('50 imóveis passam no filtro'));
 const aberta=await sessao();assert.deepEqual(aberta.filtros,{bairro:['Bairro A']},'sai só o filtro da coluna oculta (campo:1)');assert.equal(aberta.ordem,null,'sai a ordenação da coluna oculta');
 // e) Restaurar padrão com sucesso tira o filtro da coluna que ficou oculta
 await ligarCampos();
 await b.avaliar(()=>sessionStorage.setItem('gi.filtros.'+GI.idUsuarioColunas(),JSON.stringify({filtros:{'campo:1':['Sim']},ordem:{id:'campo:1',desc:true}})));
 await b.navegar(url());await b.esperar(()=>!!document.querySelector('th[data-coluna="campo:1"]')&&document.querySelector('#gi-resumo').textContent.includes('0 imóveis passam no filtro'));
 assert.deepEqual((await sessao()).filtros,{'campo:1':['Sim']},'coluna visível mantém o filtro na abertura');
 await abrirEditor();await b.clicar('#gi-col-padrao');
 await aguardarSemFiltro();
 assert.equal(await b.avaliar(()=>!!document.querySelector('th[data-coluna="campo:1"]')),false);assert.deepEqual((await sessao()).filtros,{});assert.equal((await sessao()).ordem,null);assert.equal(await pagina(),'1');
 await b.clicar('.gi-modal [data-cancelar]');await b.esperar(()=>!document.querySelector('.gi-modal'));
});
}finally{await b.fechar();s.closeAllConnections();grande.closeAllConnections();await new Promise(r=>s.close(r));await new Promise(r=>grande.close(r));}
console.log(`Ajuste 0.35.0: PASS ${passes}; FAIL ${falhas}`);if(falhas)process.exitCode=1;
