import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = 'http://127.0.0.1:' + servidor.address().port;
let b;
const prova = texto => process.stdout.write('OK ' + texto + '\n');
try {
  b = await abrirChromium();
  const texto = seletor => b.avaliar(s => document.querySelector(s)?.textContent || '', seletor);
  const aguardarLista = trecho => b.esperar(t => document.querySelector('#gi-corpo').textContent.includes(t), trecho);
  async function locatario() {
    await b.preencher('#l-locatario', 'Demonstração Um');
    await b.esperar(() => !!document.querySelector('[data-contato]'));
    await b.clicar('[data-contato="0"]');
  }
  await b.navegar(origem + '/app/locados.html');
  await aguardarLista('Imóvel Avulso Demonstração');
  assert.match(await texto('#gi-resumo'), /3 imóveis locados/);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo tr').length), 3);
  assert.ok(await b.avaliar(() => !!document.querySelector('.gi-prazo--warn') && !!document.querySelector('.gi-prazo--erro')));
  await b.captura('01-locados');
  await b.preencher('#f-busca', 'avulso'); await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelectorAll('#gi-corpo tr').length === 1 && document.querySelector('#gi-corpo').textContent.includes('Avulso'));
  await b.clicar('#b-limpar'); await aguardarLista('Casa Demonstração Beta');
  prova('lista, resumo, busca sem acento e avisos de vigência');

  await b.clicar('[data-editar="1"]'); await b.esperar(() => !!document.querySelector('#l-contrato'));
  await b.preencher('#l-contrato', 'DEMO-EDITADO'); await b.clicar('.gi-modal [data-ok]');
  await aguardarLista('DEMO-EDITADO');
  const contatosEditados = await b.avaliar(async () => (await GI.locacoesObter(1)).locacao.contatos);
  assert.ok(contatosEditados.some(c => c.papel === 'fiador' && c.contato_id === 9904));
  assert.ok(contatosEditados.some(c => c.papel === 'proprietario' && c.contato_id === 9903));
  prova('edição preserva os vínculos de proprietário e fiador');

  await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#l-titulo'));
  await b.preencher('#l-titulo', 'Avulso Novo Demonstração');
  await b.preencher('#l-endereco', 'Rua Fictícia, zero');
  await b.preencher('#l-bairro', 'Bairro Fictício'); await b.preencher('#l-cidade', 'Cidade Fictícia');
  await locatario(); await b.preencher('#l-proprietario', 'Proprietário Avulso Demonstração');
  await b.preencher('#l-aluguel', '1500.25');
  await b.preencher('#l-contrato', 'FORCAR-422'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('422'));
  assert.equal(await b.avaliar(() => document.querySelector('#l-titulo').value), 'Avulso Novo Demonstração');
  assert.equal(await b.avaliar(() => document.querySelector('#l-contrato').value), 'FORCAR-422');
  await b.captura('02-erro-422-preservado');
  await b.preencher('#l-contrato', 'DEMO-NOVO'); await b.clicar('.gi-modal [data-ok]');
  await aguardarLista('Avulso Novo Demonstração');
  const avulso = await b.avaliar(async () => (await GI.locacoes({ busca: 'DEMO-NOVO' })).rows[0]);
  assert.equal(avulso.imovel_codigo, null); assert.equal(avulso.valor_aluguel_centavos, 150025);
  assert.equal(avulso.contatos.find(c => c.papel === 'locatario').contato_id, 9901);
  prova('cadastro fora do catálogo vincula contato; 422 mantém campos; aluguel em centavos');

  await b.clicar('#b-candidatas'); await b.esperar(() => !!document.querySelector('[data-candidata]'));
  await b.clicar('[data-candidata="0"]'); await b.esperar(() => !!document.querySelector('#l-resumo') && document.querySelector('#l-resumo').textContent.includes('DEMO-SAIDA'));
  await locatario(); await b.clicar('.gi-modal [data-ok]');
  await aguardarLista('Imóvel que Saiu do Anúncio Demonstração');
  await b.esperar(() => document.querySelector('#gi-candidatas').hidden);
  prova('candidato fora do espelho usa snapshot e desaparece da faixa após cadastro');

  await b.navegar(origem + '/app/imoveis.html');
  await aguardarLista('Apartamento Demonstração Alfa');
  assert.match(await texto('#gi-corpo'), /Disponível/); assert.match(await texto('#gi-corpo'), /Locado/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/locacoes/mapa')).length), 1);
  await b.captura('03-imoveis-situacao');
  await b.preencher('#f-situacao', 'locados');
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo tr').length), 1);
  await b.clicar('#b-limpar'); await aguardarLista('Apartamento Demonstração Alfa');
  await b.clicar('[data-locacao="DEMO-001"]'); await b.esperar(() => !!document.querySelector('#l-aluguel'));
  assert.equal(await b.avaliar(() => document.querySelector('#l-aluguel').value), '1234,56');
  await b.captura('04-marcar-catalogo');
  await locatario(); await b.preencher('#l-contrato', 'DEMO-CATALOGO'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('DEMO-CATALOGO'));
  await b.clicar('[data-locacao="DEMO-001"]'); await b.esperar(() => document.querySelector('.gi-modal h2')?.textContent === 'Editar locação');
  await b.clicar('.gi-modal [data-cancelar]');
  prova('catálogo nativo + uma leitura do mapa, filtro local, aluguel preenchido e acesso à locação');

  await b.navegar(origem + '/app/locados.html'); await aguardarLista('DEMO-CATALOGO');
  const locacao = await b.avaliar(async () => (await GI.locacoes({ busca: 'DEMO-CATALOGO' })).rows[0]);
  await b.clicar('[data-encerrar="' + locacao.id + '"]');
  await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !!document.querySelector('.gi-modal input'));
  await b.preencher('.gi-modal input', 'Encerramento Demonstração'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal h2')?.textContent === 'Confirmar encerramento');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal') && !document.querySelector('#gi-corpo').textContent.includes('DEMO-CATALOGO'));
  await b.preencher('#f-contrato', 'encerradas'); await b.clicar('#b-buscar'); await aguardarLista('DEMO-CATALOGO');
  const encerrada = await b.avaliar(async id => await GI.locacoesObter(id), locacao.id);
  assert.equal(encerrada.locacao.motivo_encerramento, 'Encerramento Demonstração');
  assert.ok(encerrada.historico.some(h => h.acao === 'encerrou'));
  await b.captura('05-encerradas');
  await b.navegar(origem + '/app/imoveis.html'); await aguardarLista('Apartamento Demonstração Alfa');
  assert.equal(await b.avaliar(() => document.querySelector('[data-locacao="DEMO-001"]').title), 'Marcar como locado');
  prova('encerramento com motivo preserva histórico e devolve situação Disponível');

  // Erro 409 do servidor, sem fechar o formulário nem perder o locatário.
  await b.navegar(origem + '/app/locados.html'); await aguardarLista('Casa Demonstração Beta');
  await b.clicar('#b-novo'); await b.clicar('[data-modo="catalogo"]');
  await b.preencher('#l-busca-imovel', 'DEMO-002'); await b.clicar('#l-buscar-imovel');
  await b.esperar(() => !!document.querySelector('[data-imovel]')); await b.clicar('[data-imovel="0"]');
  await locatario(); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('já tem uma locação ativa'));
  assert.match(await texto('#l-vinculo'), /9901/);
  await b.clicar('.gi-modal [data-cancelar]');
  prova('409 preserva o contato selecionado e mantém o modal aberto');

  await b.navegar(origem + '/app/locados.html?modo=local');
  await b.esperar(() => document.querySelector('#b-novo').disabled);
  assert.match(await texto('#gi-sem-portal'), /Locados exigem o portal conectado/);
  assert.equal(await b.avaliar(() => bancada.gravacoesStorage), 0);
  await b.captura('06-sem-portal');
  await b.navegar(origem + '/app/imoveis.html?modo=local'); await aguardarLista('Apartamento Demonstração Alfa');
  assert.ok(await b.avaliar(() => [...document.querySelectorAll('[data-locacao]')].every(b => b.disabled)));
  await b.navegar(origem + '/app/locados.html?modo=fora'); await b.esperar(() => document.querySelector('#b-novo').disabled);
  prova('modo local e portal fora desabilitam ações, exibem aviso e não gravam storage');

  // Dado hostil vindo do portal nunca vira elemento: tudo é texto, até o que deveria ser data ou número.
  await b.navegar(origem + '/app/locados.html'); await aguardarLista('Casa Demonstração Beta');
  await b.avaliar(async () => {
    const hostil = '<img src=x onerror="window.__xss=1">';
    await GI.locacoesCriar({ imovel: { titulo: hostil }, contrato_numero: hostil, observacao: hostil,
      contatos: [{ papel: 'locatario', nome: hostil, telefone: hostil }, { papel: 'proprietario', nome: hostil }] });
    const original = GI.locacoes;
    GI.locacoes = async (...a) => {
      const r = await original(...a);
      r.rows = r.rows.map(l => Object.assign({}, l, { inicio: '<img src=x onerror="window.__xss=2">',
        fim: '<img src=x onerror="window.__xss=3">', vence_em_dias: '<img src=x onerror="window.__xss=4">' }));
      return r;
    };
  });
  await b.clicar('#b-buscar'); await b.esperar(() => document.querySelectorAll('#gi-corpo tr').length >= 3);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await b.avaliar(() => window.__xss), undefined);
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo img, #gi-corpo script').length), 0);
  assert.ok((await texto('#gi-corpo')).includes('<img src=x'));
  prova('dado hostil (título, nome, telefone, contrato, data e prazo) vira texto, nunca elemento');

  await b.navegar(origem + '/app/locados.html?tema=escuro'); await aguardarLista('Casa Demonstração Beta');
  await b.captura('07-locados-escuro'); await b.viewport(390, 844);
  await b.clicar('#b-novo'); await b.captura('08-modal-estreito');
  assert.ok(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(b.erros, []);
  prova('tema escuro e modal estreito sem overflow da página; zero exceções no navegador');
  process.stdout.write('Bancada: todos os fluxos passaram. Capturas em test/bancada/capturas/.\n');
} finally {
  if (b) await b.fechar();
  await new Promise(resolve => servidor.close(resolve));
}
