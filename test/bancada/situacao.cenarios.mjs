import assert from 'node:assert/strict';

export async function testarSituacao(b, origem) {
  const navegar = async query => {
    await b.navegar(origem + '/app/imoveis.html' + (query || ''));
    await b.esperar(() => !!document.querySelector('[data-abrir]'));
  };
  const valor = codigo => b.avaliar(c => document.querySelector('[data-situacao="' + c + '"]')?.value, codigo);
  // Mapa prévio, padrão sem registro e edição por todos os perfis.
  for (const perfil of ['admin', 'supervisor', 'agente']) {
    await navegar('?perfil=' + perfil);
    assert.equal(await valor('DEMO-001'), 'disponivel');
    assert.equal(await valor('DEMO-002'), 'reservado');
    assert.equal(await valor('DEMO-003'), 'indisponivel');
    assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('[data-situacao="DEMO-001"] option')].map(o => [o.value, o.textContent])), [
      ['disponivel', 'Disponível'], ['reservado', 'Reservado'], ['indisponivel', 'Indisponível']
    ]);
    assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').getAttribute('aria-label')), 'Situação de 001');
    assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-002"]').classList.contains('gi-estado-pendente')), true);
    assert.doesNotMatch(await b.avaliar(() => document.querySelector('#gi-nav').textContent), /Locados|Chamados|Prestadores/);
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-locacao]').length), 0);
  }
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('.gi-barra').textContent), /Reservado e Indisponível não são oferecidos pela Williane\./);
  for (const [situacao, codigo] of [['disponivel', 'DEMO-001'], ['reservado', 'DEMO-002'], ['indisponivel', 'DEMO-003']]) {
    await b.preencher('#f-situacao', situacao);
    await b.esperar(c => document.querySelectorAll('[data-situacao]').length === 1 && document.querySelector('[data-situacao]').dataset.situacao === c, codigo);
    assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('[data-situacao]')].map(e => e.dataset.situacao)), [codigo]);
  }
  await b.preencher('#f-situacao', '');
  await b.esperar(() => document.querySelectorAll('[data-situacao]').length === 3);
  await b.preencher('[data-situacao="DEMO-001"]', 'reservado');
  await b.esperar(() => document.querySelector('[data-situacao="DEMO-001"]').value === 'reservado' && !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  const post = await b.avaliar(() => bancada.chamadas.find(c => c.method === 'POST' && /\/imoveis\/DEMO-001\/situacao$/.test(c.caminho)));
  assert.deepEqual(JSON.parse(post.body), { situacao: 'reservado' });
  assert.equal(post.autor, 'Agente Demonstração');
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').classList.contains('gi-estado-pendente')), true);
  await navegar();
  assert.equal(await valor('DEMO-001'), 'reservado', 'persistiu no portal após reabrir');
  await b.avaliar(() => { bancada.falharSituacao = true; });
  await b.preencher('[data-situacao="DEMO-001"]', 'indisponivel');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  assert.equal(await valor('DEMO-001'), 'reservado', 'erro restaura valor anterior');
  assert.match(await b.avaliar(() => document.body.textContent), /Situação inválida/);
  await navegar();
  assert.equal(await valor('DEMO-001'), 'reservado', 'erro não muda portal');
  // Uma gravação mais lenta continua bloqueada se outra linha redesenhar a lista.
  await b.avaliar(() => {
    var salvar = GI.salvarSituacao;
    GI.salvarSituacao = function (codigo, situacao) {
      if (codigo !== 'DEMO-001') return salvar(codigo, situacao);
      return new Promise(function (resolve, reject) {
        bancada.liberarSituacao = function () { salvar(codigo, situacao).then(resolve, reject); };
      });
    };
  });
  await b.preencher('[data-situacao="DEMO-001"]', 'disponivel');
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').disabled), true);
  await b.preencher('[data-situacao="DEMO-003"]', 'reservado');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-003"]').disabled);
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').disabled), true);
  assert.equal(await valor('DEMO-001'), 'disponivel', 'mantém valor pendente após redesenho');
  await b.avaliar(() => bancada.liberarSituacao());
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  assert.equal(await valor('DEMO-001'), 'disponivel');
  await navegar();
  await b.preencher('[data-situacao="DEMO-001"]', 'reservado');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
  // Sucesso também reaplica o filtro atual.
  await b.preencher('#f-situacao', 'reservado');
  await b.esperar(() => !!document.querySelector('[data-situacao="DEMO-001"]'));
  await b.preencher('[data-situacao="DEMO-001"]', 'disponivel');
  await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]'));
  for (const query of ['?modo=local', '?situacao-fora=1', '?situacao-mapa-invalido=1']) {
    await navegar(query);
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-situacao]').length), 0);
    assert.equal(await b.avaliar(() => document.querySelector('#gi-corpo td:nth-child(8)').textContent), '—');
    assert.equal(await b.avaliar(() => document.querySelector('#f-situacao').disabled), true);
    const aviso = await b.avaliar(() => document.querySelector('#gi-situacao-aviso').textContent);
    assert.match(aviso, query.includes('situacao-') ? /Situação indisponível: .*\. Reabra a tela para tentar novamente\./ : /^Situação exige o portal conectado\.$/);
  }
  await navegar();
  await b.avaliar(() => {
    var codigo = '><img src=x onerror=window.__situacaoXss=1>';
    GI.buscarImoveis = function () { return Promise.resolve({ itens: [{ internalcode: codigo, name: 'Imóvel sintético', category: '', value: 0 }], total: 1, ms: 1 }); };
  });
  await b.clicar('#b-buscar');
  await b.esperar(() => document.querySelector('[data-situacao]')?.dataset.situacao.includes('<img'));
  assert.equal(await b.avaliar(() => document.querySelectorAll('#gi-corpo img').length), 0);
  assert.equal(await b.avaliar(() => !!window.__situacaoXss), false);
  assert.equal(await b.avaliar(() => document.querySelector('[data-situacao]').getAttribute('aria-label')), 'Situação de ><img src=x onerror=window.__situacaoXss=1>');
  const manifest = await (await fetch(origem + '/manifest.json')).json();
  assert.deepEqual(manifest.contributions[0].items.map(i => i.id), ['gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config']);
  assert.equal(manifest.contributions.length, 1);
  assert.equal((await fetch(origem + '/app/locados.html')).status, 404);
  assert.equal((await fetch(origem + '/app/locacao.js')).status, 404);
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS situação: mapa, três perfis, autoria, persistência, reversão, concorrência, filtros, sem portal, mapa inválido, escape e navegação; FAIL 0\n');
}
