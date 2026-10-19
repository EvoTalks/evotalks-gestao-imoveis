import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port;
after(async () => { servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); });
async function cockpit(fn) {
  const b = await abrirChromium();
  try {
    await b.navegar(base + '/app/painel.html?escrita=1');
    await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Um') && !!document.querySelector('[data-chamado]'));
    await fn(b);
    assert.deepEqual(b.erros, []);
  } finally { await b.fechar(); }
}
async function buscar(b, termo) {
  await b.clicar('#cp-outra-pessoa');
  await b.preencher('#cp-pessoa-busca', termo);
}

for (const [telefone, nome] of [['00000000002', '00000000002'], ['', 'Contato #9902']]) {
  test('pessoa 9902 sem nome: cabeçalho, Vendo como, gestão e POST usam ' + nome, () => cockpit(async b => {
    await b.avaliar(telefone => {
      const get = omni.contacts.get;
      omni.contacts.get = async id => Number(id) === 9902 ? { id: 9902, name: '', phone: telefone } : get(id);
      omni.contacts.search = async () => [{ id: 9902, name: '', phone: telefone }];
    }, telefone);
    await buscar(b, 'pessoa');
    await b.esperar(() => !!document.querySelector('[data-pessoa]'));
    await b.clicar('[data-pessoa]');
    await b.esperar(() => !document.querySelector('#cp-vendo-como').hidden && !!document.querySelector('[data-chamado]'));
    assert.equal(await b.avaliar(() => document.querySelector('#cp-nome').textContent), nome);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-vendo-como').textContent), 'Vendo como ' + nome + ' · Voltar ao contato do atendimento');
    await b.avaliar(() => { bancada.navegarContribuicao = false; });
    await b.clicar('[data-gestao]');
    await b.esperar(() => bancada.aberturas.length > 0);
    assert.equal(await b.avaliar(() => bancada.aberturas[0].params.nome), nome);
    assert.equal(await b.avaliar(() => bancada.aberturas[0].params.contatoId), 9902);
    await b.clicar('#cp-tab-novo');
    await b.preencher('#cp-descricao', 'Reparo sintético para contato sem nome');
    await b.clicar('#cp-revisar');
    assert.doesNotMatch(await b.avaliar(() => document.querySelector('#cp-conteudo').textContent), /Locatário Demonstração Um/);
    await b.clicar('#cp-confirmar');
    await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    const post = await b.avaliar(() => JSON.parse(bancada.chamadas.find(r => r.method === 'POST' && r.caminho === '/api/ext/chamados').body));
    assert.deepEqual(post.solicitante, { contato_id: 9902, nome, telefone: telefone || null });
    assert.equal(post.atendimento.chat_id, 8801);
  }));
}

test('validação getSelected antiga liberada depois da nova não sobrescreve resultados', () => cockpit(async b => {
  await b.avaliar(() => {
    const get = omni.chats.getSelected;
    omni.chats.getSelected = () => {
      if (window.atrasarValidacao) {
        window.atrasarValidacao = false;
        return new Promise(resolve => { window.liberarAntiga = async () => { resolve(await get()); window.antigaLiberada = true; }; });
      }
      return get();
    };
    omni.contacts.search = async termo => {
      if (termo === 'antiga') window.atrasarValidacao = true;
      return [{ id: termo === 'antiga' ? 9901 : 9902, name: 'Resultado ' + termo }];
    };
  });
  await buscar(b, 'antiga');
  await b.esperar(() => !!window.liberarAntiga);
  await b.preencher('#cp-pessoa-busca', 'nova');
  await b.esperar(() => document.querySelector('#cp-pessoa-resultados').textContent.includes('Resultado nova'));
  await b.avaliar(async () => { await liberarAntiga(); await new Promise(r => setTimeout(r, 50)); });
  assert.match(await b.avaliar(() => document.querySelector('#cp-pessoa-resultados').textContent), /Resultado nova/);
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#cp-pessoa-resultados').textContent), /Resultado antiga/);
}));

for (const durante of [false, true]) {
  test('escolha antiga é ignorada com termo alterado ' + (durante ? 'durante' : 'antes de') + ' getSelected', () => cockpit(async b => {
    await b.avaliar(() => { omni.contacts.search = async termo => [{ id: 9902, name: 'Resultado ' + termo }]; });
    await buscar(b, 'antiga');
    await b.esperar(() => !!document.querySelector('[data-pessoa]'));
    await b.avaliar(() => { window.escolhaAntiga = document.querySelector('[data-pessoa]').onclick; });
    if (durante) {
      await b.avaliar(() => {
        const get = omni.chats.getSelected;
        omni.chats.getSelected = () => {
          omni.chats.getSelected = get;
          return new Promise(resolve => { window.liberarEscolha = async () => resolve(await get()); });
        };
        escolhaAntiga();
      });
      await b.esperar(() => !!window.liberarEscolha);
    }
    await b.preencher('#cp-pessoa-busca', 'nova');
    await b.avaliar(async durante => {
      if (durante) await liberarEscolha(); else escolhaAntiga();
      await new Promise(r => setTimeout(r, 100));
    }, durante);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-vendo-como').hidden), true);
    assert.equal(await b.avaliar(() => GI.contatoEfetivo({ id: 8801, contactId: 9901 })), 9901);
  }));
}
