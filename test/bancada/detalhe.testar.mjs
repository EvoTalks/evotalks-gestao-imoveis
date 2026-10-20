import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
const hostil='<img src=x onerror=window.__xss=1>';
const campos=[{id:1,rotulo:'Taxa interna',tipo:'valor',ativo:true},{id:2,rotulo:'Observação '+hostil,tipo:'texto',ativo:true},{id:3,rotulo:'Campo vazio',tipo:'texto',ativo:true},{id:4,rotulo:'Inativo',tipo:'texto',ativo:false},{id:5,rotulo:'Aceita pet',tipo:'checkbox',ativo:true}];
campos.push(...Array.from({length:12},(_,i)=>({id:20+i,rotulo:'Campo adicional sintético '+i,tipo:'texto',ativo:true})));
const detalhes={'DEMO-001':{imovel:{titulo:'Apartamento sintético '+hostil,transacao:'Locacao',tipo:'Apartamento',cidade:'Cidade sintética',bairro:'Bairro sintético',quartos:2,suites:0,banheiros:1,vagas:null,area_m2:75,valor_aluguel:'123456',condominio:'23456',valor_total_mensal:'146912',ano_construcao:2001,link:'https://example.invalid/anuncio',imagens:[],primeiro_visto_em:'2026-10-01T12:00:00Z',atualizado_em:'2026-10-20T12:00:00Z',descricao:'Descrição sintética\n'+hostil+'\n'+'Texto completo de demonstração.\n'.repeat(50)},valores:[{campo_id:1,valor_centavos:'12345',recorrencia:'mensal',observacao:'Taxa sintética'},{campo_id:2,valor_texto:hostil},{campo_id:5,valor_texto:'nao'}]},'DEMO-003':{imovel:{codigo:'DEMO-003',transacao:'Venda',link:'javascript:window.__xss=1',imagens:[]},valores:[]}};
const servidor=criarServidor({campos,detalhes});await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
const origem='http://127.0.0.1:'+servidor.address().port;
detalhes['DEMO-001'].imovel.imagem_principal=origem+'/app/icone-casa.svg?principal';
detalhes['DEMO-001'].imovel.imagens=[origem+'/app/icone-casa.svg?segunda',origem+'/app/icone-casa.svg?terceira','javascript:evil','data:evil'];
let b;
const abrir=async(id='DEMO-001')=>{await b.clicar('[data-detalhe="'+id+'"]');await b.esperar(()=>!!document.querySelector('.dv-cabeca'));};
const fechar=async()=>{await b.clicar('.gi-modal-x');await b.esperar(()=>!document.querySelector('.gi-modal'));};
const adicional=()=>b.avaliar(()=>[...document.querySelectorAll('.dv-internas dt')].find(e=>e.textContent.startsWith('Observação ')).nextElementSibling.textContent);
try {
 b=await abrirChromium();
 await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-abrir]'));
 const filtros=await b.avaliar(()=>[...document.querySelectorAll('.gi-barra input,.gi-barra select,.gi-barra button')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,height:r.height};}));
 assert.ok(Math.max(...filtros.map(f=>f.top))-Math.min(...filtros.map(f=>f.top))<=1);assert.ok(Math.max(...filtros.map(f=>f.height))-Math.min(...filtros.map(f=>f.height))<=1);
 await abrir();
 const texto=await b.avaliar(()=>document.querySelector('.gi-visualizacao').textContent);
 for(const v of ['1.234,56','234,56','1.469,12','123,45','Taxa sintética','Não','—','2001','01/10/2026','20/10/2026','Campo vazio']) assert.ok(texto.includes(v),v);
 assert.equal(await b.avaliar(()=>document.querySelector('[data-evox="vis-fato-piscina"] b').textContent),'—','portal antigo tem piscina desconhecida');
 assert.match(await b.avaliar(()=>document.querySelector('[data-descricao-site]').textContent),/Descrição sintética<img/);
 assert.equal(await b.avaliar(()=>!!window.__xss||!!document.querySelector('.gi-modal [onerror]')),false);
 const fotos=await b.avaliar(()=>[...document.querySelectorAll('.dv-foto img')].map(e=>e.src));assert.equal(fotos.length,3);
 assert.ok(await b.avaliar(()=>[...document.querySelectorAll('.gi-modal a')].every(a=>a.target==='_blank'&&a.rel.includes('noopener'))));
 const rolagens=await b.avaliar(()=>{const c=document.querySelector('.gi-modal-corpo'),l=document.querySelector('.dv-lado');c.scrollTop=200;l.scrollTop=100;return [c.scrollTop,l.scrollTop];});assert.deepEqual(rolagens,[200,100],'corpo e coluna lateral rolam de forma independente');
 await fechar();await abrir();assert.equal(await b.avaliar(()=>bancada.chamadas.filter(c=>/imovel\/DEMO-001/.test(c.caminho)).length),1);await fechar();
 await abrir('DEMO-002');assert.match(await b.avaliar(()=>document.querySelector('.gi-modal').textContent),/Dados do site indisponíveis agora\./);assert.match(await b.avaliar(()=>document.querySelector('.gi-modal').textContent),/Casa Demonstração Beta/);await fechar();
 await abrir('DEMO-003');assert.equal(await b.avaliar(()=>document.querySelectorAll('.gi-modal a').length),0);await fechar();
 await b.clicar('[data-abrir="DEMO-001"]');await b.esperar(()=>!!document.querySelector('[data-campo="2"]'));
 await b.preencher('[data-campo="2"]','Preenchimento sintético atualizado');await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 await abrir();assert.equal(await adicional(),'Preenchimento sintético atualizado');await fechar();
 await b.clicar('[data-excluir="DEMO-001"]');await b.clicar('.gi-modal [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal')&&document.querySelector('[data-excluir="DEMO-001"]').disabled);
 await abrir();assert.equal(await adicional(),'—','excluir não ressuscita cache');await fechar();
 // Ação primária entrega a edição já existente.
 await abrir();await b.clicar('[data-editar-imovel]');await b.esperar(()=>!!document.querySelector('#gi-form-campos'));assert.equal(await b.avaliar(()=>!!document.querySelector('.gi-visualizacao')),false);await fechar();
 // Fundo fecha e restaurar foco continua funcionando.
 await abrir();await b.clicar('.gi-modal-fundo');await b.esperar(()=>!document.querySelector('.gi-modal'));
 await b.navegar(origem+'/app/imoveis.html?perfil=admin&modo=local');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));await abrir();
 assert.match(await b.avaliar(()=>document.querySelector('.gi-modal').textContent),/Dados do site indisponíveis agora/);assert.ok(await b.avaliar(()=>[...document.querySelectorAll('[data-sit]')].every(b=>b.disabled)));await fechar();
 await b.navegar(origem+'/app/imoveis.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-detalhe]'));
 await b.avaliar(()=>{GI.detalheDoImovel=()=>Promise.reject(new Error('HTTP 500'));});await abrir();assert.match(await b.avaliar(()=>document.querySelector('.gi-modal').textContent),/Dados do site indisponíveis agora/);await fechar();
 assert.deepEqual(b.erros,[]);process.stdout.write('PASS detalhe: filtros, centavos, escape, URLs, piscina desconhecida, cache, edição/exclusão, fallback 404/500/local, foco e fechamento; FAIL 0\n');
} finally {if(b)await b.fechar();servidor.closeAllConnections();await new Promise(r=>servidor.close(r));}
