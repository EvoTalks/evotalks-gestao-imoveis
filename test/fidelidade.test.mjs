import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { abrirAmbiente, AGORA, SAIDA, capturar, PROPRIEDADES } from './fidelidade/ambiente.mjs';
import { lerDesenho, abrirDesenho, capturarDesenho, QUADROS } from './fidelidade/desenho.mjs';
import { fixture, validarFixture, centavos, chamados, locacoes } from './fidelidade/fixture-desenho.mjs';
import { criarFixturePortal } from './fidelidade/portal.mjs';
import { abrirExtensao, capturarSucesso } from './fidelidade/roteiros.mjs';
import { compararNoCanvas, compararArquivos } from './fidelidade/pixels.mjs';
import { argumentos, reprovado, tabela } from './fidelidade/comparar.mjs';
import { diferencasEstilos } from './fidelidade/estrutural.mjs';
import { PARES } from './fidelidade/pares.mjs';
import { criarServidor } from './bancada/servidor.mjs';

test('fidelidade: CLI valida quadros e limite sem reprovar a linha de base por padrão', () => {
  assert.deepEqual(argumentos([]).quadros,QUADROS);
  assert.deepEqual(argumentos(['lista','lista','--limite','.5','--so-desenho']),{quadros:['lista'],limite:.5,soDesenho:true,origemComum:true});
  assert.equal(argumentos([]).origemComum,true);
  assert.equal(argumentos(['--original']).origemComum,false);
  assert.equal(argumentos(['--original','--origem-comum']).origemComum,true);
  for(const args of [['inexistente'],['--limite'],['--limite','x'],['--limite','-1'],['--limite','101']])assert.throws(()=>argumentos(args));
  assert.equal(reprovado([{percentual:99}],null),false);
  assert.equal(reprovado([{percentual:.5}],.5),false);
  assert.equal(reprovado([{percentual:.5001}],.5),true);
  assert.match(tabela([{quadro:'teste',desenho:{largura:2,altura:3},extensao:{largura:3,altura:2},percentual:20,alcancavel:false,mascarados:1}]),/2×3.*3×2.*20\.0000 %.*não.*1 px/);
});

test('fidelidade: fixture fixa os 12 chamados, valores e os vínculos exibidos', () => {
  assert.deepEqual(chamados.map(c=>c.numero),[1051,1049,1044,1042,1040,1035,1031,1018,1012,1010,902,871]);
  assert.equal(locacoes.length,8);
  assert.equal(centavos('R$ 3.100,00'),310000);
  const c=chamados.find(c=>c.numero===1042);
  assert.equal(c.valor_estimado_centavos,28000);assert.equal(c.atendimento.chat_id,2641);
  assert.equal(c.sla.prazo_solucao_em,'2026-10-20T15:05:00-03:00');
  assert.equal(c.solicitante.nome,'Carla Menezes');assert.equal(c.orcamentos_total,2);
  assert.equal(fixture.formulario.categoria,'eletrica');
});

test('fidelidade: portal e servidor mantêm fixture isolado da bancada padrão', async t => {
  const portal=criarFixturePortal(),s=criarServidor({fixture:portal});
  await new Promise(r=>s.listen(0,'127.0.0.1',r));
  t.after(()=>{s.closeAllConnections();return new Promise(r=>s.close(r));});
  const base='http://127.0.0.1:'+s.address().port;
  assert.equal((await fetch(base+'/api/ext/chamados')).status,401);
  const headers={Authorization:'Bearer bancada-sintetica','Content-Type':'application/json'};
  const dados=await (await fetch(base+'/api/ext/chamados',{headers})).json();
  assert.equal(dados.total,12);assert.equal(dados.rows[3].numero,1042);
  assert.equal((await (await fetch(base+'/bancada/sdk/products')).json()).length,6);
  assert.equal((await (await fetch(base+'/api/ext/config/manutencao',{headers})).json()).alcada_centavos,25000);
  assert.equal((await fetch(base+'/api/ext/locacoes',{method:'POST',headers,body:'{}'})).status,405);
  assert.equal(criarFixturePortal().dados.chamados.length,12);
  assert.throws(()=>criarServidor({fixture:portal,portalRealUrl:'http://127.0.0.1:9999'}),/Fixture/);
});

test('fidelidade: 57 pares cobrem componentes e comparam todas as propriedades', () => {
  assert.ok(PARES.length>=30);
  assert.equal(new Set(PARES.map(p=>p.quadro+'/'+p.nome)).size,PARES.length);
  assert.ok(PROPRIEDADES.includes('width'));assert.ok(PROPRIEDADES.includes('box-shadow'));
  for(const p of PARES)assert.ok(QUADROS.includes(p.quadro)&&p.desenho&&p.extensao);
  assert.deepEqual(diferencasEstilos('x',{color:'red'},{color:'red'}),[]);
  assert.deepEqual(diferencasEstilos('x',{color:'red'},{color:'blue'}),[{par:'x',propriedade:'color',desenho:'red',extensao:'blue'}]);
  assert.equal(diferencasEstilos('x',null,null)[0].propriedade,'elemento');
});

test('fidelidade: DOM vivo, relógio, pixels, máscara e estados reais', async t => {
  const b=await abrirAmbiente();t.after(()=>b.fechar());
  const d=await lerDesenho({browser:b});
  await t.test('cada valor visível do fixture ainda existe no desenho; erro identifica valor e quadro',()=>{
    assert.deepEqual(validarFixture(d),[]);
    assert.equal(Object.keys(d.quadros).length,QUADROS.length);assert.ok(d.css.includes('.gi'));
    for(const q of QUADROS)assert.ok(d.quadros[q].dom&&d.quadros[q].texto);
    const copia=structuredClone(d);copia.quadros.lista.texto=copia.quadros.lista.texto.replaceAll('Carla Menezes','');
    assert.ok(validarFixture(copia).some(e=>e.includes('lista:')&&e.includes('Carla Menezes')));
    assert.equal(d.mascaradas.length,1);assert.equal(d.mascaradas[0].quadro,'cockpit-chamados');
    assert.equal(d.viewport.largura,1440);
  });
  await t.test('Date injetado antes da carga, fuso Brasília, intervalos congelados e timeouts preservados', async()=>{
    const r=await b.avaliar(async()=>{await new Promise(r=>setTimeout(r,1));return {agora:Date.now(),data:new Date().toISOString(),offset:new Date().getTimezoneOffset(),chamada:Date(),intervalo:setInterval(()=>{},1)};});
    assert.equal(r.agora,Date.parse(AGORA));assert.equal(r.data,new Date(AGORA).toISOString());assert.equal(r.offset,180);assert.equal(r.intervalo,0);assert.match(r.chamada,/20:41:00/);
  });
  await t.test('canvas: tolerância 8, máscara, alpha e áreas sem cobertura não se diluem',async()=>{
    const imagens=await b.avaliar(()=>{
      const png=(w,h,cor)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=cor;ctx.fillRect(0,0,w,h);return c.toDataURL();};
      return [png(4,4,'rgb(100,100,100)'),png(4,4,'rgb(108,100,100)'),png(4,4,'rgb(109,100,100)'),png(5,4,'rgb(100,100,100)'),png(4,4,'rgba(100,100,100,0)')];
    });
    assert.equal((await b.avaliar(compararNoCanvas,imagens[0],imagens[1])).percentual,0);
    assert.equal((await b.avaliar(compararNoCanvas,imagens[0],imagens[2])).percentual,100);
    const mascara=await b.avaliar(compararNoCanvas,imagens[0],imagens[2],[{x:0,y:0,width:2,height:4}]);
    assert.equal(mascara.mascarados,8);assert.equal(mascara.comparados,8);assert.equal(mascara.diferentes,8);
    const tamanho=await b.avaliar(compararNoCanvas,imagens[0],imagens[3]);assert.equal(tamanho.descobertos,4);assert.equal(tamanho.percentual,20);
    assert.equal((await b.avaliar(compararNoCanvas,imagens[0],imagens[4])).percentual,100);
  });
  await t.test('desenho contra ele mesmo após recarregar: exatamente zero',async()=>{
    await capturarDesenho(b,'lista','autoteste-a');await abrirDesenho(b);await capturarDesenho(b,'lista','autoteste-b');
    const r=await compararArquivos(b,path.join(SAIDA,'autoteste-a/lista.png'),path.join(SAIDA,'autoteste-b/lista.png'));
    assert.equal(r.percentual,0);assert.equal(r.diferentes,0);
  });
  await t.test('extensão real deslocada 1 px produz diferença e usa dados do desenho',async()=>{
    const s=await abrirExtensao('lista',{largura:1360,altura:1294});
    try {
      assert.equal(s.alcancavel,true);assert.deepEqual(s.b.erros,[]);
      assert.equal(await s.b.avaliar(()=>document.querySelectorAll('#gi-corpo tr').length),12);
      assert.match(await s.b.avaliar(()=>document.querySelector('#gi-corpo').textContent),/Carla Menezes/);
      const a=path.join(SAIDA,'autoteste-extensao.png'),c=path.join(SAIDA,'autoteste-deslocada.png');
      await capturar(s.b,'body',a);await capturar(s.b,'body',c,1);
      const r=await compararArquivos(b,a,c);assert.ok(r.diferentes>0);assert.ok(r.percentual>0);
    }finally{await s.fechar();}
  });
  await t.test('roteiro Novo usa cliente, imóvel, atendimento e campos do desenho',async()=>{
    const s=await abrirExtensao('novo',{largura:900,altura:960});
    try {
      const r=await s.b.avaliar(()=>({cliente:document.querySelector('#c-cliente').value,imovel:document.querySelector('#c-locacao').selectedOptions[0].textContent,vinculo:document.querySelector('#c-vinculo').textContent,categoria:document.querySelector('#c-categoria').value,descricao:document.querySelector('#c-descricao').value}));
      assert.match(r.cliente,/Carla/);assert.match(r.imovel,/Ed\. Jasmim.*304/);assert.match(r.vinculo,/#2660/);
      assert.equal(r.categoria,'eletrica');assert.equal(r.descricao,fixture.formulario.descricao);
    }finally{await s.fechar();}
  });
  await t.test('roteiro de confirmação preserva limitação e abre OS-1052 sem rede externa',async()=>{
    const s=await abrirExtensao('cockpit-confirma',{largura:315,altura:523});
    try {
      assert.equal(s.alcancavel,false);assert.match(s.motivos.join(' '),/sucessivos/);
      await capturarSucesso(s);assert.equal(s.portal.dados.chamados[0].numero,1052);
      assert.equal((await readFile(path.join(SAIDA,'extensao/cockpit-sucesso.png'))).subarray(1,4).toString(),'PNG');
      assert.deepEqual(s.b.erros,[]);
      assert.ok(await s.b.avaliar(()=>bancada.rede.every(r=>r.startsWith('/api/ext/')||r.startsWith('/bancada/sdk/'))));
    }finally{await s.fechar();}
  });
});
