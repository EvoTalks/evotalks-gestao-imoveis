import assert from 'node:assert/strict';
import { criarPortalReal, portalExiste } from './portal-real.mjs';
import { criarServidor } from '../bancada/servidor.mjs';
import { abrirChromium } from '../bancada/chromium.mjs';
assert.ok(portalExiste,'Defina PORTAL_DIR para o portal com as rotas da Parte 1');
const real=await criarPortalReal();let b;
const servidor=criarServidor({portalRealUrl:real.url});await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
try {
 const {rows:[campo]}=await real.pg.query("INSERT INTO campos_personalizados(rotulo,tipo,oculta_williane) VALUES ('Possui restrição?','checkbox',true) RETURNING id");
 await real.pg.query("INSERT INTO imoveis(codigo,titulo,transacao,valor_aluguel) VALUES ('DEMO-001','Teste','Locacao',100000)");
 await real.pg.query("INSERT INTO valores_imovel(codigo,campo_id,valor_texto,atualizado_por) VALUES ('DEMO-001',$1,'sim','Bancada')",[campo.id]);
 b=await abrirChromium();const url='http://127.0.0.1:'+servidor.address().port+'/app/imoveis.html?perfil=admin';
 await b.navegar(url);await b.esperar(()=>!!document.querySelector('[data-abrir]'));
 await b.clicar('#b-colunas');await b.esperar(()=>!!document.querySelector('#gi-editor-colunas'));
 await b.avaliar(()=>{const linha=[...document.querySelectorAll('.gi-col-editor-linha')].find(e=>e.textContent.includes('Possui restrição?'));linha.querySelector('[data-visivel]').click();});
 await b.clicar('.gi-modal-rodape [data-ok]');await b.esperar(()=>document.querySelector('#gi-corpo').textContent.includes('Sim'));
 assert.ok(real.requisicoes.some(r=>r.url.startsWith('/valores/colunas?')));
 await b.navegar(url);await b.esperar(()=>!!document.querySelector('th[data-coluna^="campo:"]'));
 await b.navegar(url+'&usuario=9998');await b.esperar(()=>!!document.querySelector('[data-abrir]'));assert.equal(await b.avaliar(()=>!!document.querySelector('th[data-coluna^="campo:"]')),false);
 assert.equal((await real.pg.query("SELECT count(*)::int n FROM busca_imoveis WHERE codigo='DEMO-001'")).rows[0].n,0);
 await b.navegar(url);await b.esperar(()=>document.querySelector('#gi-corpo').textContent.includes('Sim'));
 await b.clicar('[data-abrir="DEMO-001"]');await b.esperar(()=>!!document.querySelector('[data-campo]'));
 await b.preencher('[data-campo="'+campo.id+'"]','nao');await b.clicar('.gi-modal-rodape [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 assert.match(await b.avaliar(()=>document.querySelector('#gi-corpo tr').textContent),/Não/);
 assert.equal((await real.pg.query("SELECT count(*)::int n FROM busca_imoveis WHERE codigo='DEMO-001'")).rows[0].n,1);
 await b.clicar('[data-abrir="DEMO-001"]');await b.esperar(()=>!!document.querySelector('[data-campo]'));
 await b.preencher('[data-campo="'+campo.id+'"]','sim');await b.clicar('.gi-modal-rodape [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 assert.match(await b.avaliar(()=>document.querySelector('#gi-corpo tr').textContent),/Sim/);
 assert.equal((await real.pg.query("SELECT count(*)::int n FROM busca_imoveis WHERE codigo='DEMO-001'")).rows[0].n,0);

 await b.navegar('http://127.0.0.1:'+servidor.address().port+'/app/campos.html?perfil=admin');await b.esperar(()=>!!document.querySelector('[data-editar]'));
 await b.clicar('[data-editar="'+campo.id+'"]');await b.esperar(()=>!!document.querySelector('#e-williane'));
 assert.equal(await b.avaliar(()=>document.querySelector('#e-williane').checked),true);
 await b.clicar('#e-williane');await b.clicar('.gi-modal-rodape [data-ok]');await b.esperar(()=>!document.querySelector('.gi-modal'));
 assert.equal((await real.pg.query("SELECT count(*)::int n FROM busca_imoveis WHERE codigo='DEMO-001'")).rows[0].n,1);
 assert.deepEqual(b.erros,[]);
 process.stdout.write('PASS integração colunas: layout por usuário e recarga, valores em lote reais, marca Williane pelo formulário e busca_imoveis; FAIL 0\n');
} finally {if(b)await b.fechar();servidor.closeAllConnections();await new Promise(r=>servidor.close(r));await real.fechar();}
