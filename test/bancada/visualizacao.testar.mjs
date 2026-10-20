import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const hostil = '<img src=x onerror=window.__xss=1>';
const campos = [{id:1,rotulo:'IPTU',tipo:'valor',ativo:true},{id:2,rotulo:'Observação '+hostil,tipo:'texto',ativo:true},{id:3,rotulo:'Campo vazio',tipo:'texto',ativo:true},{id:4,rotulo:'Inativo',tipo:'texto',ativo:false},{id:5,rotulo:'Aceita pet',tipo:'checkbox',ativo:true}];
const produtos = ['5357422','5350262','5352765'].map((codigo,i)=>({id:9101+i,internalcode:codigo,name:['APARTAMENTO NO CENTRO DE BRUSQUE','Casa com piscina','Imóvel sem fotos'][i],category:'Apartamento > Brusque > Centro',description:'[Locacao]',value:650000,brand:'DEMONSTRACAO'}));
const detalhes = {};
for (const p of produtos) detalhes[p.internalcode] = {imovel:{codigo:p.internalcode,titulo:p.name,bairro:'Centro',cidade:'Brusque',tipo:'Apartamento',transacao:'Locacao',area_m2:107.3,quartos:3,suites:1,banheiros:3,vagas:null,valor_aluguel:650000,condominio:50000,descricao:'Descrição '+hostil+'\n'+'Descrição longa de teste. '.repeat(100),link:'https://example.invalid/anuncio',caracteristicas:p.internalcode==='5350262'?['Pool','Kitchen']:['Kitchen','Balcony','Pets Allowed'],imagens:[],atualizado_em:'2026-10-20T09:00:00Z'},valores:[{campo_id:1,valor_centavos:'184000',recorrencia:'anual',observacao:'Taxa sintética'},{campo_id:2,valor_texto:hostil},{campo_id:5,valor_texto:'nao'}]};
const servidor = criarServidor({campos,detalhes,produtosSinteticos:produtos});
await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
const origem='http://127.0.0.1:'+servidor.address().port;
for (const id of ['5357422','5350262']) {
  detalhes[id].imovel.imagem_principal=origem+'/app/icone-casa.svg?capa';
  detalhes[id].imovel.imagens=Array.from({length:7},(_,i)=>origem+'/app/icone-casa.svg?foto='+i).concat(['javascript:evil','data:evil']);
}
let b;
const abrir=async(id='5357422',indice=0)=>{await b.clicar('[data-detalhe="'+id+'"]'+(indice?'':'.gi-capa'));await b.esperar(()=>!!document.querySelector('.dv-cabeca'));};
const fechar=async()=>{await b.clicar('.gi-modal-x');await b.esperar(()=>!document.querySelector('.gi-modal'));};
const tecla=key=>b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:{Escape:27,ArrowRight:39,ArrowLeft:37}[key]});
try {
  b=await abrirChromium();
  for(const tema of ['claro','escuro']) {
    await b.viewport(1400,1000);await b.navegar(origem+'/app/imoveis.html?perfil=admin&tema='+tema);
    await b.esperar(()=>document.querySelectorAll('[data-detalhe]').length===9);
    await b.avaliar(()=>{const cfg=GI.cfg;GI.cfg=(k,d)=>k==='prefixoCodigo'?'535':cfg(k,d);});
    await abrir();
    assert.equal(await b.avaliar(()=>document.querySelector('.dv-titulo').textContent),'Apartamento no Centro de Brusque');
    assert.equal(await b.avaliar(()=>document.querySelector('[data-evox="vis-fato-piscina"] b').textContent),'Não');
    assert.equal(await b.avaliar(()=>document.querySelectorAll('.dv-foto').length),5);
    assert.match(await b.avaliar(()=>document.querySelector('.dv-foto-contador').textContent),/8 fotos/);
    assert.match(await b.avaliar(()=>document.querySelector('.dv-foto-mais').textContent),/\+3/);
    const geometria=await b.avaliar(()=>{const m=document.querySelector('.gi-visualizacao'),r=m.getBoundingClientRect();return {w:r.width,h:r.height,y:r.y,x:r.x,cols:getComputedStyle(m.querySelector('.dv-grade')).gridTemplateColumns,cor:getComputedStyle(m).color,bg:getComputedStyle(m).backgroundColor};});
    assert.equal(geometria.w,1120);assert.ok(geometria.h<=900);assert.equal(geometria.x,140);
    assert.match(geometria.cols,/340px$/);assert.notEqual(geometria.cor,geometria.bg);
    if(tema==='escuro') assert.notEqual(geometria.bg,'rgb(255, 255, 255)');
    assert.equal(await b.avaliar(()=>!!window.__xss||!!document.querySelector('.gi-modal [onerror]')),false);
    assert.match(await b.avaliar(()=>document.querySelector('.dv-internas').textContent),/Taxa sintética/);
    assert.match(await b.avaliar(()=>document.querySelector('.dv-internas').textContent),/\/ano/);
    assert.doesNotMatch(await b.avaliar(()=>document.querySelector('.dv-internas').textContent),/Inativo/);
    await b.clicar('[data-evox="vis-descricao-ler"]');assert.equal(await b.avaliar(()=>document.querySelector('.dv-ler').textContent),'Mostrar menos');
    const lateral=await b.avaliar(()=>document.querySelector('.dv-lado').getBoundingClientRect().top);
    const topo=await b.avaliar(()=>document.querySelector('.gi-modal-topo').getBoundingClientRect().top);
    await b.avaliar(()=>{document.querySelector('.gi-modal-corpo').scrollTop=200;});
    assert.equal(await b.avaliar(()=>document.querySelector('.gi-modal-topo').getBoundingClientRect().top),topo);
    assert.equal(await b.avaliar(()=>document.querySelector('.dv-lado').getBoundingClientRect().top),lateral);
    await b.clicar('[data-foto="0"]');assert.equal(await b.avaliar(()=>document.querySelector('.lb-contador').textContent),'1 / 8');
    await tecla('ArrowRight');assert.equal(await b.avaliar(()=>document.querySelector('.lb-contador').textContent),'2 / 8');
    await tecla('ArrowLeft');await tecla('ArrowLeft');assert.equal(await b.avaliar(()=>document.querySelector('.lb-contador').textContent),'8 / 8');
    await b.clicar('[data-mini="2"]');assert.equal(await b.avaliar(()=>document.querySelector('.lb-contador').textContent),'3 / 8');
    await tecla('Escape');assert.equal(await b.avaliar(()=>!!document.querySelector('.lb')),false);assert.equal(await b.avaliar(()=>!!document.querySelector('.gi-visualizacao')),true);
    const posts=()=>b.avaliar(()=>bancada.chamadas.filter(c=>c.method==='POST'&&/situacao$/.test(c.caminho)).length);
    let antes=await posts();
    await b.clicar('[data-sit="disponivel"]');assert.equal(await posts(),antes);
    await b.clicar('[data-sit="reservado"]');await b.esperar(()=>document.querySelector('[data-situacao-recado]').textContent==='Situação salva');
    assert.equal(await posts(),antes+1);assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-detalhe]').textContent),/Reservado/);
    assert.equal(await b.avaliar(()=>document.querySelector('[data-situacao="5357422"]').value),'reservado');
    await b.avaliar(()=>{window.salvarOriginal=GI.salvarSituacao;GI.salvarSituacao=()=>Promise.reject(new Error('Falha sintética'));});
    await b.clicar('[data-sit="indisponivel"]');await b.esperar(()=>!document.querySelector('[data-sit="indisponivel"]').disabled);
    assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-recado]').textContent),/Falha sintética/);
    assert.equal(await b.avaliar(()=>document.querySelector('[data-sit="reservado"]').getAttribute('aria-pressed')),'true');
    await b.avaliar(()=>{GI.salvarSituacao=salvarOriginal;});
    // A -> B -> A enquanto a resposta está pendente reconcilia a nova renderização.
    for (const falhar of [false,true]) {
      await b.avaliar(()=>{GI.salvarSituacao=()=>new Promise((resolve,reject)=>{window.concluirSituacao=resolve;window.falharSituacao=()=>reject(new Error('Falha ao voltar'));});});
      await b.clicar(falhar?'[data-sit="disponivel"]':'[data-sit="indisponivel"]');
      await b.clicar('[data-prox]');await b.esperar(()=>document.querySelector('.dv-titulo')?.textContent==='Casa com piscina');
      await b.clicar('[data-ant]');await b.esperar(()=>!!document.querySelector('[data-sit="reservado"]')?.disabled);
      await b.avaliar(erro=>erro?falharSituacao():concluirSituacao(),falhar);
      await b.esperar(()=>!document.querySelector('[data-sit="reservado"]').disabled);
      assert.equal(await b.avaliar(()=>document.querySelector('[data-sit="indisponivel"]').getAttribute('aria-pressed')),falhar?'false':'true');
      assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-detalhe]').textContent),falhar?/Reservado/:/Indisponível/);
      if(falhar) assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-recado]').textContent),/Falha ao voltar/);
      await b.avaliar(()=>{GI.salvarSituacao=salvarOriginal;});
      if(!falhar) {
        await b.clicar('[data-sit="reservado"]');await b.esperar(()=>!document.querySelector('[data-sit="reservado"]').disabled);
      }
    }

    // Fechar e reabrir cria outra instância enquanto a gravação está pendente.
    for (const falhar of [false,true]) {
      await b.avaliar(()=>{GI.salvarSituacao=()=>new Promise((resolve,reject)=>{window.concluirSituacao=resolve;window.falharSituacao=()=>reject(new Error('Falha ao reabrir'));});});
      await b.clicar('[data-sit="indisponivel"]');await fechar();await abrir();
      assert.equal(await b.avaliar(()=>[...document.querySelectorAll('[data-sit]')].every(b=>b.disabled)),true);
      await b.avaliar(erro=>erro?falharSituacao():concluirSituacao(),falhar);
      await b.esperar(()=>[...document.querySelectorAll('[data-sit]')].every(b=>!b.disabled));
      assert.equal(await b.avaliar(()=>document.querySelector('[data-sit="indisponivel"]').getAttribute('aria-pressed')),falhar?'false':'true');
      assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-detalhe]').textContent),falhar?/Reservado/:/Indisponível/);
      assert.match(await b.avaliar(()=>document.querySelector('[data-situacao-recado]').textContent),falhar?/Falha ao reabrir/:/Situação salva/);
      assert.equal(await b.avaliar(()=>document.querySelector('[data-situacao="5357422"]').value),falhar?'reservado':'indisponivel');
      await b.avaliar(()=>{GI.salvarSituacao=salvarOriginal;});
      if(!falhar) {await b.clicar('[data-sit="reservado"]');await b.esperar(()=>!document.querySelector('[data-sit="reservado"]').disabled);}
    }

    await b.clicar('[data-prox]');await b.esperar(()=>document.querySelector('.dv-titulo')?.textContent==='Casa com piscina');
    assert.equal(await b.avaliar(()=>document.querySelector('[data-evox="vis-fato-piscina"] b').textContent),'Sim');
    await b.clicar('[data-prox]');await b.esperar(()=>!!document.querySelector('.dv-sem-foto'));
    assert.match(await b.avaliar(()=>document.querySelector('.dv-sem-foto').textContent),/O anúncio não tem fotos/);
    await b.clicar('[data-ant]');await b.esperar(()=>!!document.querySelector('.dv-fatos'));
    await fechar();
    // Código e título mantêm o mesmo detalhe, com suporte nativo a Enter/Espaço.
    for(const indice of [1,2]) {
      await b.avaliar(i=>document.querySelectorAll('[data-detalhe="5357422"]')[i].focus(),indice);
      await b.tecla(indice===1?'Enter':'Space');await b.esperar(()=>!!document.querySelector('.dv-cabeca'));await tecla('Escape');
      await b.esperar(()=>!document.querySelector('.gi-modal'));
      assert.equal(await b.avaliar(()=>document.activeElement.getAttribute('data-detalhe')),'5357422');
    }
    await abrir();await b.avaliar(()=>document.querySelector('[data-prox]').focus());await b.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    assert.equal(await b.avaliar(()=>document.activeElement.matches('[data-copiar-link]')),true);
    await fechar();
    for(const largura of [800,390]) {
      await b.viewport(largura,900);await abrir();
      const r=await b.avaliar(()=>{const m=document.querySelector('.gi-visualizacao'),g=m.querySelector('.dv-grade'),l=m.querySelector('.dv-lado');return {col:getComputedStyle(g).gridTemplateColumns,overflow:m.scrollWidth>m.clientWidth,pos:getComputedStyle(l).position};});
      assert.equal(r.col.split(' ').length,1);assert.equal(r.overflow,false);assert.equal(r.pos,'static');await fechar();
    }
    // Restaura disponível para a próxima rodada de tema.
    await b.avaliar(()=>GI.salvarSituacao('5357422','disponivel'));
  }
  // As grades de 1 a 5 fotos preenchem a área sem células vazias.
  for (const quantidade of [1,2,3,4,5]) {
    await b.viewport(1400,1000);await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));
    await b.avaliar(n=>{const carregar=GI.detalheDoImovel;GI.detalheDoImovel=async id=>{const d=await carregar(id);d.imovel.imagem_principal=location.origin+'/app/icone-casa.svg?f=0';d.imovel.imagens=Array.from({length:n-1},(_,i)=>location.origin+'/app/icone-casa.svg?f='+(i+1));return d;};},quantidade);
    await abrir();
    const grade=await b.avaliar(()=>{const g=document.querySelector('.dv-galeria'),r=g.getBoundingClientRect();return {largura:r.width,altura:r.height,total:g.querySelectorAll('.dv-foto').length,preenchido:[.1,.4,.65,.9].every(x=>[.25,.75].every(y=>!!document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest('.dv-foto')))};});
    assert.ok(Math.abs(grade.altura-grade.largura*380/704)<=1,'galeria proporcional à largura real');assert.equal(grade.total,quantidade);assert.equal(grade.preenchido,true,'grade '+quantidade+' sem buracos');await fechar();
  }
  // Cópia mantém uma seleção disponível quando o iframe recusa o clipboard.
  await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));await abrir();
  await b.avaliar(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('bloqueado'))}});document.execCommand=()=>false;});
  await b.clicar('[data-copiar-link]');await b.esperar(()=>!!document.querySelector('.dv-copiar-fallback'));
  assert.equal(await b.avaliar(()=>document.querySelector('.dv-copiar-fallback').value),'https://example.invalid/anuncio');await fechar();
  await b.viewport(1400,1000);await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));
  await b.avaliar(()=>{const pode=GI.pode;GI.pode=chave=>chave==='editar_imoveis'?false:pode(chave);});await abrir();
  assert.equal(await b.avaliar(()=>!!document.querySelector('[data-editar-imovel]')),false);await fechar();
  await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));
  await b.preencher('#f-situacao','disponivel');await abrir();await b.clicar('[data-sit="indisponivel"]');await b.esperar(()=>document.querySelector('[data-situacao-recado]').textContent==='Situação salva');
  assert.equal(await b.avaliar(()=>!!document.querySelector('[data-situacao="5357422"]')),false);await fechar();

  // Faixa visível real: iframe de 3000px, rolado pelo host.
  await b.viewport(1400,900);await b.navegar(origem+'/app/imoveis.html?perfil=admin');
  await b.esperar(()=>!document.body.classList.contains('gi-permissoes-pendentes'));
  await b.avaliar(()=>{document.body.innerHTML='<iframe style="width:100%;height:3000px;border:0" src="/app/imoveis.html?perfil=admin"></iframe>';});
  await b.esperar(()=>!!document.querySelector('iframe').contentDocument.querySelector('[data-detalhe]'));
  assert.equal(await b.avaliar(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return r.width>0&&r.height===3000;}),true,'host inicializado mantém iframe visível');
  await b.avaliar(()=>window.scrollTo(0,900));
  await b.avaliar(()=>document.querySelector('iframe').contentDocument.querySelector('[data-detalhe="5357422"]').click());
  await b.esperar(()=>!!document.querySelector('iframe').contentDocument.querySelector('[data-foto="0"]'));
  await b.avaliar(()=>document.querySelector('iframe').contentDocument.querySelector('[data-foto="0"]').click());
  await b.esperar(()=>{const f=document.querySelector('iframe'),l=f.contentDocument.querySelector('.lb');return l&&l.getBoundingClientRect().top>800;});
  for(const scroll of [900,1400]) {
    await b.avaliar(y=>window.scrollTo(0,y),scroll);
    await b.esperar(()=>{const f=document.querySelector('iframe'),r=f.contentDocument.querySelector('.lb').getBoundingClientRect(),y=f.getBoundingClientRect().top;return Math.abs(r.top+y)<3&&r.height<=901;});
    assert.equal(await b.avaliar(()=>{const f=document.querySelector('iframe'),y=f.getBoundingClientRect().top;return ['[data-lb-fechar]','.lb-contador','[data-lb-original]'].every(s=>{const r=f.contentDocument.querySelector(s).getBoundingClientRect();return r.top+y>=0&&r.bottom+y<=innerHeight;});}),true);
  }
  await b.avaliar(()=>document.querySelector('iframe').contentDocument.querySelector('[data-lb-fechar]').click());
  assert.equal(await b.avaliar(()=>!!document.querySelector('iframe').contentDocument.querySelector('.lb')),false);
  assert.deepEqual(b.erros,[]);
  process.stdout.write('PASS visualizacao: capa/código/título, galeria/teclado, situação imediata/erro/filtro, piscina, escape, permissões, temas, 800/390px; FAIL 0\n');
} finally {if(b) await b.fechar();servidor.closeAllConnections();await new Promise(r=>servidor.close(r));}
