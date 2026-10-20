import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { PERMISSOES_PADRAO } from './portal-permissoes.mjs';

const servidor = criarServidor({ campos: [{ id: 1, rotulo: 'Observação sintética', tipo: 'texto', ativo: true }] });
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + servidor.address().port;
const chaves = Object.keys(PERMISSOES_PADRAO);
let b;
async function gravar(usuario, permissoes) {
  const r = await fetch(origem + '/api/ext/permissoes/' + usuario, { method: 'POST', headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json', 'X-GI-User-Id': '9996', 'X-GI-User-Type': '0' }, body: JSON.stringify({ nome: 'Agente Demonstração Dois', ...permissoes }) });
  assert.equal(r.status, 200);
}
async function navegar(tela, query = '') {
  await b.navegar(origem + '/app/' + tela + '.html?permissoes-teste=1' + query);
  await b.esperar(() => !!document.querySelector('.gi-nav-item') || !!document.querySelector('#gi-sem-acesso') ||
    (location.search.includes('modo=fora') && document.querySelector('#gi-modo').textContent.includes('O portal não respondeu')));
}
const checkbox = (id, chave) => '[data-usuario="' + id + '"] [data-permissao="' + chave + '"]';
try {
  b = await abrirChromium();
  await navegar('config', '&perfil=admin');
  await b.esperar(() => document.querySelectorAll('#p-usuarios tr').length === 4 && !document.querySelector('#p-salvar').disabled);
  assert.equal(await b.avaliar(() => document.querySelector('#c-permissoes').checkVisibility()), true);
  assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('[data-usuario="9998"] input')].map(e => e.checked)), Object.values(PERMISSOES_PADRAO));
  assert.ok(await b.avaliar(() => [...document.querySelectorAll('[data-usuario="9996"] input')].every(e => e.checked && e.disabled)));
  assert.match(await b.avaliar(() => document.querySelector('[data-usuario="9996"]').textContent), /Administrador: acesso total/);
  assert.match(await b.avaliar(() => document.querySelector('#c-permissoes').textContent), /Controle de uso das telas; quem tem o token do portal consegue contornar\./);
  await b.clicar('#p-salvar');
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
  // A busca preserva edições nas linhas escondidas; apenas usuários alterados são enviados.
  for (const chave of ['mudar_situacao', 'ver_configuracoes']) await b.clicar(checkbox(9998, chave));
  await b.preencher('#p-busca', 'Administrador');
  assert.equal(await b.avaliar(() => document.querySelector('[data-usuario="9998"]').hidden), true);
  await b.clicar('#p-salvar');
  await b.esperar(() => document.querySelector('#p-resultado').textContent.includes('Já estão valendo') && !document.querySelector('#p-salvar').disabled);
  const posts = await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].caminho, '/api/ext/permissoes/9998');
  assert.equal(posts[0].userType, '0'); assert.equal(posts[0].userId, '9999');
  assert.deepEqual(Object.keys(JSON.parse(posts[0].body)).sort(), ['nome', ...chaves].sort());
  await b.preencher('#p-busca', '');
  assert.equal(await b.avaliar(() => document.querySelector('[data-usuario="9998"] [data-permissao="mudar_situacao"]').checked), true);
  // Nome hostil e dados alheios ao contrato não viram HTML nem modelo da tela.
  await b.avaliar(() => {
    const list = omni.users.list;
    omni.users.list = async () => (await list()).map(u => ({ ...u, name: u.id === 9998 ? '<img src=x onerror=window.__xss=1>' : u.name, sip: 'SIP-SINTETICO-NAO-EXIBIR' }));
  });
  await b.clicar(checkbox(9997, 'ver_historico')); await b.clicar('#p-salvar');
  await b.esperar(() => document.querySelector('[data-usuario="9998"]').textContent.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#p-usuarios img').length), 0);
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('#p-usuarios').innerHTML), /SIP-SINTETICO/);

  // A recusa do portal aparece na seção sem anunciar sucesso ou manter controles ativos.
  await b.clicar(checkbox(9997, 'ver_historico'));
  await b.avaliar(async () => { (await omni.session.getUser()).type = 2; });
  await b.clicar('#p-salvar');
  await b.esperar(() => document.querySelector('#p-resultado').textContent === 'Você não tem permissão para esta operação.');
  assert.equal(await b.avaliar(() => document.querySelector('#p-campos').disabled && document.querySelector('#p-salvar').disabled), true);

  await navegar('imoveis');
  await b.esperar(() => document.querySelectorAll('[data-abrir]').length === 3);
  assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('.gi-nav-item')].map(e => e.textContent)), ['Imóveis']);
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-situacao]').length), 0);
  assert.match(await b.avaliar(() => document.querySelector('#gi-corpo td:nth-child(7) .gi-estado').textContent), /Disponível/);
  assert.equal(await b.avaliar(() => bancada.chamadas.find(c => c.caminho === '/api/ext/permissoes/eu').userType), '2');
  await b.clicar('[data-abrir="DEMO-001"]');
  await b.esperar(() => !!document.querySelector('[data-campo="1"]'));
  await b.preencher('[data-campo="1"]', 'Valor sintético padrão');
  await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => !document.querySelector('.gi-modal'));
  assert.ok(await b.avaliar(() => bancada.chamadas.some(c => c.method === 'POST' && c.caminho === '/api/ext/valores/DEMO-001')));
  for (const tela of ['campos', 'historico', 'config']) {
    await navegar(tela);
    assert.match(await b.avaliar(() => document.querySelector('#gi-sem-acesso').textContent), /^Sem acesso a esta tela\. Peça ao administrador para liberar\.$/);
    assert.equal(await b.avaliar(() => document.querySelector('.gi-topo').checkVisibility()), true);
    assert.equal(await b.avaliar(() => [...document.querySelectorAll('body > section, body > .gi-barra, body > .gi-tabela-rolagem')].some(e => e.checkVisibility())), false);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => !['/api/ext/info', '/api/ext/permissoes/eu'].includes(c.caminho)).length), 0);
  }
  await navegar('imoveis', '&usuario=9998');
  await b.esperar(() => !!document.querySelector('[data-situacao]'));
  await b.preencher('[data-situacao="DEMO-001"]', 'reservado');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  assert.match(await b.avaliar(() => document.body.textContent), /Situação atualizada/);
  await navegar('config', '&usuario=9998');
  await b.esperar(() => document.querySelector('#gi-painel').style.display === 'block');
  assert.equal(await b.avaliar(() => document.querySelector('#c-permissoes').checkVisibility()), false);
  assert.equal(await b.avaliar(() => document.querySelector('#b-campos-padrao').disabled), true);
  assert.equal(await b.avaliar(() => bancada.chamadas.some(c => c.caminho === '/api/ext/permissoes')), false);

  // Revogação no portal vale mesmo com a página mantendo a consulta em memória.
  await navegar('imoveis', '&usuario=9998');
  await b.esperar(() => !!document.querySelector('[data-situacao]'));
  await gravar(9998, { ...PERMISSOES_PADRAO, editar_imoveis: false });
  await b.preencher('[data-situacao="DEMO-001"]', 'indisponivel');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  assert.match(await b.avaliar(() => document.body.textContent), /Você não tem permissão para mudar a situação\./);
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').value), 'reservado');
  await b.clicar('[data-abrir="DEMO-001"]');
  await b.esperar(() => !!document.querySelector('[data-campo="1"]'));
  await b.preencher('[data-campo="1"]', 'Recusado'); await b.clicar('.gi-modal [data-ok]');
  await b.esperar(() => document.querySelector('.gi-modal-recado').textContent.includes('Você não tem permissão para editar imóveis.'));
  await navegar('imoveis', '&usuario=9998');
  await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('DEMO-001'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-abrir],[data-excluir],[data-situacao]').length), 0);
  await gravar(9998, { ...PERMISSOES_PADRAO, editar_imoveis: false, mudar_situacao: true });
  await navegar('imoveis', '&usuario=9998');
  await b.esperar(() => !!document.querySelector('[data-situacao]'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-abrir],[data-excluir]').length), 0);
  await b.preencher('[data-situacao="DEMO-001"]', 'disponivel');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  assert.match(await b.avaliar(() => document.body.textContent), /Situação atualizada/);
  await gravar(9998, { ...PERMISSOES_PADRAO, ver_imoveis: false });
  await navegar('imoveis', '&usuario=9998');
  await b.esperar(() => !!document.querySelector('#gi-sem-acesso'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-nav-item').length), 0);

  await navegar('imoveis', '&modo=fora');
  await b.esperar(() => document.querySelector('#gi-modo').textContent.includes('O portal não respondeu'));
  assert.equal(await b.avaliar(() => GI.modo === 'portal-fora'), true);
  assert.equal(await b.avaliar(() => !!document.querySelector('#gi-sem-acesso')), false);
  assert.equal(await b.avaliar(() => document.querySelector('#gi-modo').parentNode.hidden), false);
  assert.equal(await b.avaliar(() => document.querySelectorAll('[data-abrir],[data-excluir],[data-situacao]').length), 0);
  assert.equal(await b.avaliar(() => document.querySelector('#f-situacao').disabled), true);
  assert.equal(await b.avaliar(() => !GI.pode('editar_imoveis') && !GI.pode('mudar_situacao')), true);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST').length), 0);
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS permissões: administrador, padrões do portal, busca, gravação seletiva, releitura, escape, abas, acesso direto, edição, situação liberada, revogação e 403; FAIL 0\n');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
