import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const w = {}; vm.runInNewContext(readFileSync('app/colunas.js','utf8'), {window:w});
const C = w.GIColunas, json = x => JSON.parse(JSON.stringify(x));
const campo = {id:1,nome:'Restrição',tipo:'simnao',ativo:true};
test('padrão preserva as nove larguras e campos ocultos', () => {
 const l=C.padrao([campo]); assert.deepEqual(json(l.filter(c=>!c.campo).map(c=>c.largura)),[88,92,null,140,115,121,115,190,C.LARGURA_FUNCOES]); assert.equal(l[8].visivel,false); assert.equal(l[4].alinhamento,'direita');
});
test('mescla: novo oculto, apagado/inativo some, fixa retorna e funções encerra',()=>{
 const l=C.mesclar([C.padrao()[8],C.padrao()[1]], [campo,{id:2,ativo:false}]); assert.equal(l.at(-1).id,'funcoes'); assert.equal(l.at(-1).visivel,true); assert.equal(l.length,10); assert.equal(l.find(c=>c.id==='campo:1').visivel,false);
 assert.equal(C.mesclar(C.padrao([campo]),[]).length,9);
});
test('filtros E entre colunas, OU entre valores e vazias',()=>{
 const linhas=[{a:'Sim',b:1},{a:'Não',b:1},{a:'Sim',b:2},{a:null,b:1}];
 assert.equal(C.filtrar(linhas,{a:['Sim',''],b:['1']},(p,id)=>p[id]).length,2);
});
test('ordenação tipada: texto, reais, números e código',()=>{
 for(const [tipo,entrada,esperado] of [['texto',['Z','A'],['A','Z']],['valor',['R$ 1.200,00','R$ 30,00'],['R$ 30,00','R$ 1.200,00']],['numero',[10,2],[2,10]]]) assert.deepEqual(json(C.ordenar(entrada,{id:'x'},p=>p,tipo)),esperado);
 assert.deepEqual(json(C.ordenar(['DEMO-100','DEMO-2'],{id:'codigo'},p=>p)),['DEMO-2','DEMO-100']);
});
test('distintos têm contagem, vazias, busca e teto de mil',()=>{
 const r=C.distintos(['Sim','Sim','',null],'x',p=>p); assert.equal(r.itens.find(x=>x.valor==='Sim').contagem,2); assert.equal(r.itens.find(x=>x.valor==='').contagem,2);
 assert.equal(C.distintos(['Sim','Não'],'x',p=>p,'sim').total,1);
 assert.equal(C.distintos(Array.from({length:1002},(_,i)=>i),'x',p=>p).itens.length,1000);
});
test('células: Sim/Não, vazio e formatos existentes',()=>{
 assert.equal(C.textoCampo(campo,{valor:'sim'},{}),'Sim'); assert.equal(C.textoCampo(campo,{valor:'nao'},{}),'Não'); assert.equal(C.textoCampo(campo,null,{}),'—'); assert.equal(C.textoCampo({tipo:'texto'},{valor:'',obs:'apenas nota'},{}),'—'); assert.equal(C.textoCampo({tipo:'valor'},{valor:12},{valorLegivel:()=> 'R$ 12,00'}),'R$ 12,00');
});
test('validação rejeita duplicatas, ids e larguras fora do contrato',()=>{
 const l=json(C.padrao()); C.validar(l); for(const invalido of [[],[l[0],l[0]],[{...l[0],largura:39}],[{...l[0],largura:1201}],[{...l[0],vertical:1}],[{...l[0],id:'campo:0'}]]) assert.throws(()=>C.validar(invalido));
});
test('modo local preserva ids textuais históricos sem relaxar o contrato do portal',()=>{
 const l=json(C.padrao([{id:'aceita-pet',nome:'Aceita pet'}])); assert.throws(()=>C.validar(l)); assert.equal(C.validar(l,true).length,10);
});
test('larguras automáticas, limite de colunas, flags e chaves extras',()=>{
 const c=json(C.padrao()[0]); assert.equal(C.validar([{...c,largura:null,extra:'ignorar'}])[0].extra,undefined);
 for(const extra of [{largura:40.5},{visivel:1},{alinhamento:'justificado'},{id:'campo:1000000000'},{id:'campo:01'},{vertical:null}]) assert.throws(()=>C.validar([{...c,...extra}]));
 assert.throws(()=>C.validar(Array.from({length:61},(_,i)=>({...c,id:'campo:'+(i+1)}))));
});
test('adaptador converte valores em lote em uma chamada e respeita os tipos',async()=>{
 const chamadas=[], window={addEventListener(){},location:{origin:'https://extensao.invalid'}};
 const omni={http:{request:async op=>{chamadas.push(op);return {status:200,body:JSON.stringify({valores:{A:{1:{valor:{campo_id:1,valor_centavos:12345,observacao:'obs'}},2:{valor:{campo_id:2,valor_texto:'sim'}}}}})};}}};
 window.omni=omni;const ctx={window,omni,document:{},URL,setTimeout,clearTimeout};
 vm.runInNewContext(readFileSync('app/comum.js','utf8'),ctx);vm.runInNewContext(readFileSync('app/colunas.js','utf8'),ctx);
 const GI=window.GI;GI.modo='portal';GI.cfg=(k,p)=>({portalUrl:'https://portal.invalid',portalToken:'sintetico'})[k]??p;
 const r=await GI.valoresColunas([{id:1},{id:2},{id:3,ativo:false}]);assert.equal(chamadas.length,1);assert.match(chamadas[0].url,/\/valores\/colunas\?campos=1,2$/);assert.equal(r.A[1].valor,123.45);assert.equal(r.A[1].obs,'obs');assert.equal(r.A[2].valor,'sim');
 assert.equal(C.textoCampo({tipo:'valor'},r.A[1],GI).replace(/\s/g,' '),'R$ 123,45');
 await assert.rejects(()=>GI.valoresColunas(Array.from({length:31},(_,i)=>({id:i+1}))));assert.equal(chamadas.length,1,'não contorna o limite da rota');
 await GI.salvarLayoutColunas(null);assert.deepEqual(JSON.parse(chamadas.at(-1).body),{layout:null});
});

function telaTeste({quantidade=1}={}) {
 const estado={campos:[campo],valores:{A:{1:{valor:'sim'}}},pagina:1,porPagina:25,filtroEstado:'preenchido'};
 let lote={A:{1:{valor:'sim'}}}, linhas=Array.from({length:quantidade},(_,i)=>({internalcode:i?'B'+i:'A'}));
 const GI={idUsuarioColunas:()=>1,valoresColunas:async()=>json(lote),catalogoCompleto:async()=>linhas,partesCategoria:()=>({})};
 const contexto={window:{GI,GIColunas:C},document:{querySelector:()=>({}),getElementById:()=>({}),addEventListener(){}},sessionStorage:{getItem:()=>JSON.stringify({filtros:{'campo:1':['Sim']}})},setTimeout,clearTimeout,Date};
 vm.runInNewContext(readFileSync('app/colunas-tela.js','utf8'),contexto);
 const layout=json(C.padrao([campo]));layout.find(c=>c.id==='campo:1').visivel=true;
 const tela=GI.iniciarColunas({estado,layout,quantos:()=>1,situacao:()=>''});
 return {estado,tela,lote:v=>{lote=v;},linhas:v=>{linhas=v;}};
}
test('Correção 2: lote novo substitui valores individuais antigos no filtro',async()=>{
 const t=telaTeste(); assert.equal((await t.tela.buscar()).total,1);
 t.lote({A:{1:{valor:'nao'}}});t.tela.invalidar();
 assert.equal((await t.tela.buscar()).total,0);
});
test('Correção 2: redução de 26 para 25 limita a página antes do recorte',async()=>{
 const t=telaTeste({quantidade:26});
 t.lote(Object.fromEntries(Array.from({length:26},(_,i)=>[i?'B'+i:'A',{1:{valor:'sim'}}])));
 t.estado.pagina=2;assert.equal((await t.tela.buscar()).itens.length,1);
 t.linhas(Array.from({length:25},(_,i)=>({internalcode:i?'B'+i:'A'})));
 const r=await t.tela.buscar();assert.equal(t.estado.pagina,1);assert.equal(r.itens.length,25);
});
test('Correção 2: largura de campo novo acompanha rótulo entre 140 e 260',()=>{
 const largura=nome=>C.padrao([{...campo,nome}]).find(c=>c.campo).largura;
 assert.ok(largura('Possui restrição?')>140);
 assert.equal(largura('X'),140);assert.equal(largura('W'.repeat(100)),260);
});
test('Correção 2: lote preserva gravação pendente e aceita lote seguinte',async()=>{
 const t=telaTeste();await t.tela.buscar();t.tela.iniciarGravacao('A');
 t.lote({A:{1:{valor:'nao'}}});t.tela.invalidar();
 assert.equal((await t.tela.buscar()).total,1);
 t.tela.atualizarValores('A',{1:{valor:'sim'}});t.tela.finalizarGravacao('A');
 t.tela.invalidar();assert.equal((await t.tela.buscar()).total,0);
});
test('Correção 2: ausência no lote apaga valor individual antigo',async()=>{
 const t=telaTeste();await t.tela.buscar();t.lote({});t.tela.invalidar();
 assert.equal((await t.tela.buscar()).total,0);
});

test('largura de Preenchido salva pelo usuário permanece em 105 px',()=>{
 const salvo=json(C.padrao());salvo.find(c=>c.id==='preenchido').largura=105;
 assert.equal(C.mesclar(salvo,[]).find(c=>c.id==='preenchido').largura,105);
});

test('0.33.1: Funções tem largura fixa no padrão, mescla e gravação',()=>{
 assert.equal(C.LARGURA_FUNCOES,104);
 assert.equal(C.padrao().at(-1).largura,C.LARGURA_FUNCOES);
 const salvo=json(C.padrao());salvo.at(-1).largura=150;
 assert.equal(C.mesclar(salvo,[]).at(-1).largura,C.LARGURA_FUNCOES);
 assert.equal(C.validar(salvo).at(-1).largura,C.LARGURA_FUNCOES);
 assert.equal(C.copiar(salvo.at(-1)).largura,C.LARGURA_FUNCOES);
});

const ids=l=>l.map(c=>c.id).join();
const base=()=>C.padrao().map(c=>({...c,visivel:true}));
test('0.35.0 moverAntes: coloca antes do alvo, Funções segue a última e ocultas ficam no lugar relativo',()=>{
 const l=base(); l.find(c=>c.id==='preenchido').visivel=false;
 const r=C.moverAntes(l,'bairro','preenchido'); assert.equal(ids(r),'capa,codigo,imovel,valor,bairro,preenchido,status,situacao,funcoes'); assert.notStrictEqual(r,l);
 assert.equal(ids(l),'capa,codigo,imovel,bairro,valor,preenchido,status,situacao,funcoes','não altera o original');
 const m=C.moverAntes(l,'status','bairro'); assert.equal(ids(m),'capa,codigo,imovel,status,bairro,valor,preenchido,situacao,funcoes'); assert.equal(m.find(c=>c.id==='preenchido').visivel,false);
 assert.equal(ids(C.moverAntes(l,'bairro','situacao')),'capa,codigo,imovel,valor,preenchido,status,bairro,situacao,funcoes');
 assert.equal(C.moverAntes(l,'bairro','bairro'),l,'mesmo id devolve o próprio layout');
 assert.equal(C.moverAntes(l,'funcoes','bairro'),l,'Funções nunca se move');
 assert.equal(C.moverAntes(l,'inexistente','bairro'),l,'id fora do layout devolve o próprio layout');
});
test('0.35.0 moverAntes: antesDe nulo, inexistente ou Funções leva a coluna para antes de Funções',()=>{
 const l=base();
 for(const antesDe of [null,undefined,'nao-existe','funcoes']) assert.equal(ids(C.moverAntes(l,'capa',antesDe)),'codigo,imovel,bairro,valor,preenchido,status,situacao,capa,funcoes',String(antesDe));
 assert.equal(C.moverAntes(l,'capa',null).at(-1).id,'funcoes');
});
test('0.35.0 pontoDeInsercao: primeiro título cujo meio fica à direita de x',()=>{
 const t=[{id:'a',esquerda:0,largura:100},{id:'b',esquerda:100,largura:100},{id:'c',esquerda:200,largura:100}];
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',10)),{antesDe:'a',x:0});
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',49)),{antesDe:'a',x:0});
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',50)),{antesDe:'b',x:100},'exatamente no meio ainda não é à direita dele');
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',151)),{antesDe:'c',x:200});
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',250)),{antesDe:null,x:300},'depois do meio do último: no fim');
 assert.deepEqual(json(C.pontoDeInsercao(t,'z',9999)),{antesDe:null,x:300});
 assert.deepEqual(json(C.pontoDeInsercao(t,'b',120)),{antesDe:'c',x:200},'ignora o próprio título');
 assert.deepEqual(json(C.pontoDeInsercao([...t,{id:'d',esquerda:300,largura:0}],'z',9999)),{antesDe:null,x:300},'ignora largura 0');
 assert.equal(C.pontoDeInsercao([],'z',10),null);
 assert.equal(C.pontoDeInsercao([{id:'z',esquerda:0,largura:100}],'z',10),null,'só o próprio título');
 assert.equal(C.pontoDeInsercao([{id:'a',esquerda:0,largura:0}],'z',10),null,'só largura 0');
});
test('0.35.0 deslocarVisivel: troca com a vizinha visível, ocultas e Funções ficam de fora',()=>{
 const l=base();
 assert.equal(ids(C.deslocarVisivel(l,'valor',1)),'capa,codigo,imovel,bairro,preenchido,valor,status,situacao,funcoes','um passo à direita');
 assert.equal(ids(C.deslocarVisivel(l,'valor',-1)),'capa,codigo,imovel,valor,bairro,preenchido,status,situacao,funcoes','um passo à esquerda');
 assert.equal(ids(l),'capa,codigo,imovel,bairro,valor,preenchido,status,situacao,funcoes','não altera o original');
 const o=base(); o.find(c=>c.id==='preenchido').visivel=false;
 assert.equal(ids(C.deslocarVisivel(o,'valor',1)),'capa,codigo,imovel,bairro,status,preenchido,valor,situacao,funcoes','pula a oculta e troca com a visível seguinte');
 assert.equal(o.find(c=>c.id==='preenchido').visivel,false);
 assert.equal(C.deslocarVisivel(l,'capa',-1),l,'ponta esquerda: mesma referência');
 assert.equal(C.deslocarVisivel(l,'situacao',1),l,'última visível não passa por Funções: mesma referência');
 assert.equal(C.deslocarVisivel(l,'funcoes',-1),l,'Funções não se move');
 assert.equal(C.deslocarVisivel(o,'preenchido',1),o,'id oculto: mesma referência');
 assert.equal(C.deslocarVisivel(l,'nada',1),l,'id inexistente: mesma referência');
 assert.equal(C.deslocarVisivel(l,'valor',0),l,'passo inválido: mesma referência');
 assert.equal(C.deslocarVisivel(l,'valor',2),l,'passo inválido: mesma referência');
 assert.equal(C.deslocarVisivel(l,'valor',1).at(-1).id,'funcoes');
});
