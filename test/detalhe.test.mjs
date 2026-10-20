import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function carregar() {
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), { window, document: {}, URL, setTimeout });
  return window.GI;
}
test('detalhe lê a rota única com código escapado e normaliza campos e centavos', async () => {
  const GI = carregar(), chamadas = [];
  GI.modo = 'portal';
  GI.chamarPortal = async rota => { chamadas.push(rota); return { imovel: { titulo: 'Sintético' }, valores: [
    { campo_id: 1, valor_centavos: '12345', observacao: 'mensal', recorrencia: 'mensal' },
    { campo_id: 2, valor_num: '0' }, { campo_id: 3, valor_texto: 'nao' }, { campo_id: 4, valor_texto: null },
    { campo_id: 5, valor_texto: null, observacao: 'consultar' }
  ] }; };
  const r = await GI.detalheDoImovel('A/B & C');
  assert.deepEqual(chamadas, ['/imovel/A%2FB%20%26%20C']);
  assert.equal(r.imovel.titulo, 'Sintético');
  assert.equal(r.valores[1].valor, 123.45);
  assert.equal(r.valores[2].valor, 0);
  assert.equal(r.valores[3].valor, 'nao');
  assert.equal(r.valores[4], undefined);
  assert.equal(r.valores[5].obs, 'consultar');
});
test('detalhe sem portal ou resposta inválida rejeita para o fallback da tela', async () => {
  const GI = carregar();
  for (const modo of ['local', 'portal-fora']) {
    GI.modo = modo;
    await assert.rejects(GI.detalheDoImovel('ABC'), /Dados do site indisponíveis agora/);
  }
  GI.modo = 'portal';
  for (const resposta of [null, {}, { imovel: null }, { imovel: {}, valores: 'inválido' }]) {
    GI.chamarPortal = async () => resposta;
    await assert.rejects(GI.detalheDoImovel('ABC'), /Dados do site indisponíveis agora/);
  }
  GI.chamarPortal = async () => { throw new Error('HTTP 404'); };
  await assert.rejects(GI.detalheDoImovel('ABC'), /404/);
});
function visualizacao() {
  const window = { addEventListener() {} };
  const contexto = { window, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync('app/comum.js', 'utf8'), contexto);
  vm.runInNewContext(readFileSync('app/visualizacao.js', 'utf8'), contexto);
  window.GI.config = { prefixoCodigo:'535' };
  return window.GI;
}
test('visualização normaliza caixa alta e restaura bairro/cidade, preservando títulos mistos', () => {
  const GI = visualizacao();
  assert.equal(GI.tituloDoImovel('APARTAMENTO NO CENTRO DE BRUSQUE', 'Centro', 'Brusque'), 'Apartamento no Centro de Brusque');
  assert.equal(GI.tituloDoImovel('Apartamento em Brusque', 'Centro', 'Brusque'), 'Apartamento em Brusque');
  assert.equal(GI.tituloDoImovel('CASA EM RIO', 'Rio', ''), 'Casa em Rio');
  assert.equal(GI.tituloDoImovel('CASARIO', 'Rio', ''), 'Casario');
  assert.equal(GI.tituloDoImovel('', '', ''), '');
});
test('características traduzem códigos conhecidos, preservam desconhecidos e distinguem piscina desconhecida', () => {
  const GI = visualizacao();
  for (const [codigo, esperado] of [['Pool','Piscina'],['Kitchen','Cozinha'],['Tennis court','Quadra de tênis'],['Outra','Outra'],['toString','toString']]) assert.equal(GI.caracteristicaTraduzida(codigo), esperado);
  for (const [site, esperado] of [[{},'—'],[{caracteristicas:null},'—'],[{caracteristicas:[]},'Não'],[{caracteristicas:['Kitchen']},'Não'],[{caracteristicas:['Pool']},'Sim']]) assert.equal(GI.piscinaDoImovel(site),esperado);
});
test('fotos recusam URLs inseguras, deduplicam e distribuem a grade de 0 a 5 fotos', () => {
  const GI = visualizacao();
  assert.deepEqual(Array.from(GI.fotosDoImovel({imagem_principal:'https://a/1',imagens:['https://a/1','http://a/2','javascript:evil','data:evil','http://a/2']})),['https://a/1','http://a/2']);
  for (let i = 0; i < 10; i++) assert.equal(GI.gradeDoImovel(i),Math.min(i,5));
});
test('valores em centavos cobrem aluguel, venda, ambos e total mensal do portal', () => {
  const GI = visualizacao(), p = { description:'[Locacao]', value:10000 };
  assert.equal(GI.valoresDaVisualizacao({valor_aluguel:'10000',condominio:'1000'},p).total,11000);
  assert.equal(GI.valoresDaVisualizacao({valor_aluguel:10000,valor_total_mensal:12000},p).total,12000);
  const venda = GI.valoresDaVisualizacao({valor_venda:50000},p);
  assert.equal(venda.venda,50000); assert.equal(venda.total,null);
  const ambos = GI.valoresDaVisualizacao({valor_aluguel:10000,valor_venda:50000},p);
  assert.equal(ambos.aluguel,10000); assert.equal(ambos.venda,50000);
});
test('navegação respeita a ordem filtrada e limites, sem circular nem inventar posição', () => {
  const GI = visualizacao(), lista = [{internalcode:'B'},{internalcode:'A'},{internalcode:'C'}];
  for (const [id,ant,prox,indice] of [['B',null,'A',0],['A','B','C',1],['C','A',null,2],['D',null,null,-1]]) {
    const nav = GI.navegacaoDoImovel(lista,id);
    assert.equal(nav.anterior,ant);assert.equal(nav.proximo,prox);assert.equal(nav.indice,indice);assert.equal(nav.total,3);
  }
});
test('renderização escapa dados do portal, catálogo e campos; piscina não repete nos chips', () => {
  const GI = visualizacao(); GI.pode = () => true;
  const p = {internalcode:'5357422', name:'Catálogo <img>', category:'Apartamento > Brusque > Centro', value:1000};
  const r = GI.conteudoVisualizacao(p,{imovel:{titulo:'<img onerror=evil>',caracteristicas:['Pool','Kitchen','<script>'],descricao:'Linha 1\nLinha 2',link:'javascript:evil'},valores:{}},{campos:[{id:1,nome:'<svg>',tipo:'texto',ativo:true}],lancados:{1:{valor:'<img>'}},situacao:'reservado'});
  assert.match(r.html,/&lt;img/); assert.doesNotMatch(r.html,/<script>|<img onerror|javascript:evil/);
  assert.match(r.html,/dv-fato--sim/); assert.doesNotMatch(r.html,/dv-chip[^>]*>[^<]*Piscina/);
  assert.match(r.html,/<p>Linha 1<\/p><p>Linha 2<\/p>/);
});

test('Sim/Não preserva observação escapada nos dois valores', () => {
  const GI = visualizacao(); GI.pode = () => true;
  for (const valor of ['sim','nao']) {
    const html = GI.conteudoVisualizacao({internalcode:'A',name:'Casa',category:''},{imovel:{}},{
      situacao:'disponivel',campos:[{id:1,nome:'Pet',tipo:'simnao'}],
      lancados:{1:{valor,obs:'Apenas pequeno porte <img onerror=evil>'}}
    }).html;
    assert.match(html,/ — Apenas pequeno porte &lt;img onerror=evil&gt;/);
    assert.doesNotMatch(html,/<img onerror/);
    assert.match(html,valor==='sim'?/Sim<\/span> — Apenas/:/Não — Apenas/);
  }
});


test('visualização preserva todas as recorrências do formulário e os aliases do portal', () => {
  const GI = visualizacao(); GI.pode = () => true;
  for (const [recorrencia,sufixo] of GI.RECORRENCIAS.map(r=>[r.id,r.id==='unico'?'única':r.sufixo]).concat([['anual','/ano'],['mensal','/mês'],['unica','única']])) {
    for (const padrao of [false,true]) {
      const html = GI.conteudoVisualizacao({internalcode:'A',name:'Casa',category:''},{imovel:{}},{
        situacao:'disponivel',campos:[{id:1,nome:'Taxa',tipo:'valor',recorrenciaPadrao:padrao?recorrencia:undefined}],
        lancados:{1:{valor:100,recorrencia:padrao?undefined:recorrencia}}
      }).html;
      assert.ok(html.includes('<span class="dv-rec">'+sufixo+'</span>'),recorrencia);
    }
  }
});
