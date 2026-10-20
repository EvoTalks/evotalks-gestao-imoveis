import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';

const hostil = '<img src=x onerror=window.__xss=1>';
const campos = [
  { id: 1, rotulo: 'Taxa interna', tipo: 'valor', ativo: true },
  { id: 2, rotulo: 'Observação ' + hostil, tipo: 'texto', ativo: true },
  { id: 3, rotulo: 'Campo vazio', tipo: 'texto', ativo: true },
  { id: 4, rotulo: 'Inativo', tipo: 'texto', ativo: false },
  { id: 5, rotulo: 'Aceita pet', tipo: 'checkbox', ativo: true }
];
campos.push(...Array.from({ length: 12 }, (_, i) => ({ id: 20 + i, rotulo: 'Campo adicional sintético ' + i, tipo: 'texto', ativo: true })));
const detalhes = {
  'DEMO-001': { imovel: { codigo: 'DEMO-001', titulo: 'Apartamento sintético ' + hostil, transacao: 'Locacao', tipo: 'Apartamento',
    cidade: 'Cidade sintética', bairro: 'Bairro sintético', quartos: 2, suites: 0, banheiros: 1, vagas: null, area_m2: 75,
    valor_venda: null, valor_aluguel: '123456', condominio: '23456', valor_total_mensal: '146912', ano_construcao: 2001,
    link: 'https://example.invalid/anuncio', imagem_principal: 'https://example.invalid/principal.png',
    imagens: ['https://example.invalid/segunda.png', 'http://example.invalid/terceira.png', 'javascript:window.__xss=1', 'data:image/svg+xml,evil'],
    primeiro_visto_em: '2026-10-01T12:00:00Z', atualizado_em: '2026-10-20T12:00:00Z',
    descricao: 'Descrição sintética\n' + hostil + '\n' + 'Texto completo de demonstração.\n'.repeat(50) },
    valores: [{ campo_id: 1, valor_centavos: '12345', recorrencia: 'mensal', observacao: 'Taxa sintética' },
      { campo_id: 2, valor_texto: hostil }, { campo_id: 3, valor_texto: null }, { campo_id: 5, valor_texto: 'nao' }] },
  'DEMO-003': { imovel: { codigo: 'DEMO-003', transacao: 'Venda', link: 'javascript:window.__xss=1', imagens: [] }, valores: [] }
};
const servidor = criarServidor({ campos, detalhes });
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const origem = 'http://127.0.0.1:' + servidor.address().port;
detalhes['DEMO-001'].imovel.imagem_principal = origem + '/app/icone-casa.svg?foto=principal';
detalhes['DEMO-001'].imovel.imagens.splice(0, 2, origem + '/app/icone-casa.svg?foto=segunda', origem + '/app/icone-casa.svg?foto=terceira');
let b;
const modal = '.gi-modal-leitura';
async function abrir(codigo = 'DEMO-001') {
  await b.clicar('[data-detalhe="' + codigo + '"]');
  await b.esperar(() => !!document.querySelector('.gi-detalhe-secao'));
}
async function fechar() {
  await b.clicar(modal + ' .gi-modal-x');
  await b.esperar(() => !document.querySelector('.gi-modal'));
}
const chamadasDetalhe = () => b.avaliar(() => bancada.chamadas.filter(c => /\/imovel\//.test(c.caminho)).length);
try {
  b = await abrirChromium();
  for (const tema of ['claro', 'escuro']) {
    await b.viewport(1400, 900);
    await b.navegar(origem + '/app/imoveis.html?perfil=admin&tema=' + tema);
    await b.esperar(() => !!document.querySelector('[data-abrir]'));
    const filtros = await b.avaliar(() => [...document.querySelectorAll('.gi-barra input,.gi-barra select,.gi-barra button')].map(e => {
      const r = e.getBoundingClientRect(); return { top: r.top, height: r.height, width: r.width, id: e.id };
    }));
    assert.ok(Math.max(...filtros.map(f => f.top)) - Math.min(...filtros.map(f => f.top)) <= 1, JSON.stringify(filtros));
    assert.ok(Math.max(...filtros.map(f => f.height)) - Math.min(...filtros.map(f => f.height)) <= 1);
    assert.equal(filtros.find(f => f.id === 'f-situacao').width, filtros.find(f => f.id === 'f-finalidade').width);
    assert.equal(filtros.find(f => f.id === 'f-situacao').width, filtros.find(f => f.id === 'f-estado').width);
    assert.doesNotMatch(await b.avaliar(() => document.body.textContent), /Reservado e Indisponível não são oferecidos pela Williane/);
    await abrir();
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-detalhe-adendo')), true, 'adendo lateral existe como segundo card');
    await b.esperar(() => {
      const m = document.querySelector('.gi-modal-leitura'), r = m.getBoundingClientRect();
      return Math.abs(r.y + r.height / 2 - innerHeight / 2) <= 2;
    });
    const dados = await b.avaliar(() => {
      const m = document.querySelector('.gi-modal-leitura'), r = m.getBoundingClientRect(), corpo = m.querySelector('.gi-modal-corpo'), conjunto = document.querySelector('.gi-detalhe-conjunto'), adendo = conjunto.querySelector('.gi-detalhe-adendo'), a = adendo.getBoundingClientRect();
      return { width: r.width, visibleWidth: document.documentElement.clientWidth, x: r.x, y: r.y, height: r.height, scroll: corpo.scrollHeight > corpo.clientHeight,
        bg: getComputedStyle(m).backgroundColor, cor: getComputedStyle(m).color,
        secoes: [...m.querySelectorAll('h3')].map(e => e.textContent), campos: [...conjunto.querySelectorAll('dt')].map(e => e.textContent),
        secoesAdendo: [...adendo.querySelectorAll('h3')].map(e => e.textContent),
        lateral: { x: a.x, y: a.y, width: a.width, height: a.height, right: a.right, bg: getComputedStyle(adendo).backgroundColor, cor: getComputedStyle(adendo).color, scroll: adendo.querySelector('.gi-detalhe-adendo-corpo').scrollHeight > adendo.querySelector('.gi-detalhe-adendo-corpo').clientHeight },
        camposPrincipal: [...m.querySelectorAll('dt')].map(e => e.textContent),
        texto: conjunto.textContent, fotos: [...m.querySelectorAll('.gi-detalhe-foto-principal a, .gi-detalhe-fotos a')].map(e => e.href),
        links: [...m.querySelectorAll('a')].map(e => [e.target, e.rel]), inputs: m.querySelectorAll('input,select,textarea,[data-ok]').length,
        descricao: m.querySelector('[data-descricao-site]').textContent, espacos: getComputedStyle(m.querySelector('[data-descricao-site]')).whiteSpace };
    });
    assert.ok(Math.abs(dados.width - 700) <= 1);
    assert.ok(Math.abs(dados.x + dados.width / 2 - dados.visibleWidth / 2) <= 1, JSON.stringify(dados));
    assert.ok(Math.abs(dados.y + dados.height / 2 - 450) <= 2);
    assert.ok(dados.height <= 765 && dados.scroll);
    assert.equal(dados.bg, 'rgb(255, 255, 255)');
    assert.equal(dados.cor, 'rgb(30, 30, 30)');
    assert.deepEqual(dados.secoes, ['Identificação', 'Fotos', 'Descrição completa', 'Dados do site', 'Catálogo do EvoTalks']);
    assert.deepEqual(dados.secoesAdendo, ['Situação', 'Valores', 'Informações adicionais']);
    assert.ok(Math.abs(dados.lateral.y - dados.y) <= 1 && Math.abs(dados.lateral.height - dados.height) <= 1);
    assert.ok(dados.lateral.x > dados.x + dados.width && dados.lateral.x - dados.x - dados.width <= 12);
    assert.ok(dados.lateral.width >= 308 && dados.lateral.width <= 350 && dados.lateral.right <= dados.visibleWidth);
    assert.equal(dados.lateral.bg, 'rgb(255, 255, 255)');
    assert.equal(dados.lateral.cor, 'rgb(30, 30, 30)');
    assert.equal(dados.lateral.scroll, true, 'rolagem lateral independente');
    for (const rotulo of ['Situação atual', 'Valor de venda', 'Valor do aluguel', 'Condomínio', 'Valor total mensal', 'Taxa interna', 'Campo vazio']) assert.ok(!dados.camposPrincipal.includes(rotulo), rotulo + ' não repetido no principal');
    assert.equal(await b.avaliar(() => document.querySelector('.gi-detalhe-foto-principal img').getBoundingClientRect().height > document.querySelector('.gi-detalhe-fotos img').getBoundingClientRect().height * 2), true, 'foto principal grande');
    for (const campo of ['Código curto', 'Código completo', 'Título', 'Finalidade', 'Tipo', 'Situação atual', 'Transação', 'Cidade', 'Bairro', 'Quartos', 'Suítes', 'Banheiros', 'Vagas', 'Área (m²)', 'Valor de venda', 'Valor do aluguel', 'Condomínio', 'Valor total mensal', 'Ano de construção', 'Link do anúncio', 'Primeira vez visto', 'Última atualização', 'Descrição completa', 'Taxa interna', 'Observação ' + hostil, 'Campo vazio', 'Aceita pet', 'Nome', 'Categoria', 'Valor', 'Descrição']) assert.ok(dados.campos.includes(campo), campo);
    assert.ok(!dados.campos.includes('Inativo'));
    for (const valor of ['1.234,56', '234,56', '1.469,12', '123,45', 'Taxa sintética', 'não', '—', '0', '75', '2001', '01/10/2026', '20/10/2026']) assert.ok(dados.texto.includes(valor), valor);
    assert.match(dados.descricao, /Descrição sintética\n<img/);
    assert.equal(dados.espacos, 'pre-wrap');
    assert.equal(dados.inputs, 0);
    assert.deepEqual(dados.fotos, ['principal', 'segunda', 'terceira'].map(f => origem + '/app/icone-casa.svg?foto=' + f));
    await b.esperar(() => [...document.querySelectorAll('.gi-detalhe-foto-principal img')].every(i => i.complete && i.naturalWidth > 0));
    await b.clicar('.gi-detalhe-adendo h3');
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-detalhe-conjunto')), true, 'clique no adendo mantém ambos abertos');
    assert.ok(dados.links.every(([t, r]) => t === '_blank' && r.includes('noopener')));
    assert.equal(await b.avaliar(() => !!window.__xss || !!document.querySelector('.gi-modal [onerror]')), false);
    await b.captura('detalhe-0290-1400-' + tema);
    const cabecalho = await b.avaliar(() => document.querySelector('.gi-modal-topo').getBoundingClientRect().top);
    await b.avaliar(() => { document.querySelector('.gi-modal-corpo').scrollTop = 500; });
    assert.equal(await b.avaliar(() => document.querySelector('.gi-modal-topo').getBoundingClientRect().top), cabecalho);
    const rolagens = await b.avaliar(() => {
      const principal = document.querySelector('.gi-modal-leitura .gi-modal-corpo'), lateral = document.querySelector('.gi-detalhe-adendo-corpo');
      lateral.scrollTop = 200;
      return [principal.scrollTop, lateral.scrollTop];
    });
    assert.deepEqual(rolagens, [500, 200]);
    await fechar();
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-detalhe-adendo')), false);
    for (const tecla of ['Enter', 'Space']) {
      await b.avaliar(() => document.querySelectorAll('[data-detalhe="DEMO-001"]')[1].focus());
      await b.tecla(tecla);
      await b.esperar(() => !!document.querySelector('.gi-detalhe-secao'));
      await b.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
      await b.esperar(() => !document.querySelector('.gi-modal'));
      assert.equal(await b.avaliar(() => document.activeElement.dataset.detalhe), 'DEMO-001');
    }
    assert.equal(await chamadasDetalhe(), 1, 'reabertura usa cache');
    await b.clicar('#gi-corpo td:nth-child(3) [data-detalhe="DEMO-001"]');
    await b.esperar(() => !!document.querySelector('.gi-detalhe-secao'));
    await b.avaliar(() => document.querySelector('.gi-modal-x').focus());
    await b.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    assert.equal(await b.avaliar(() => document.activeElement === [...document.querySelectorAll('.gi-detalhe-conjunto a')].at(-1)), true, 'Shift+Tab contém foco');
    await b.tecla('Tab');
    assert.equal(await b.avaliar(() => document.activeElement.classList.contains('gi-modal-x')), true, 'Tab volta ao fechar');
    await b.clicar('.gi-modal-fundo');
    await b.esperar(() => !document.querySelector('.gi-modal'));
    await b.clicar('[data-abrir="DEMO-001"]');
    await b.esperar(() => !!document.querySelector('#gi-form-campos'));
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-modal-leitura')), false);
    await b.clicar('.gi-modal-x');
    await b.preencher('[data-situacao="DEMO-001"]', 'reservado');
    await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-modal')), false);
    await abrir();
    assert.match(await b.avaliar(() => document.querySelector('[data-situacao-detalhe]').textContent), /Reservado/);
    await fechar();
    await abrir('DEMO-002');
    assert.match(await b.avaliar(() => document.querySelector('.gi-modal').textContent), /Dados do site indisponíveis agora\./);
    assert.deepEqual(await b.avaliar(() => [...document.querySelectorAll('.gi-modal h3')].map(e => e.textContent)), ['Identificação', 'Catálogo do EvoTalks', 'Situação', 'Valores', 'Informações adicionais']);
    await fechar();
    await abrir('DEMO-003');
    assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-modal a').length), 0, 'URL insegura recusada');
    assert.match(await b.avaliar(() => document.querySelector('.gi-detalhe-conjunto').textContent), /Campo vazio/);
    await fechar();
    await b.clicar('[data-abrir="DEMO-001"]');
    await b.esperar(() => !!document.querySelector('#gi-form-campos'));
    await b.preencher('[data-campo="2"]', 'Preenchimento sintético atualizado');
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => !document.querySelector('.gi-modal') && !document.querySelector('[data-excluir="DEMO-001"]').disabled);
    await abrir();
    const adicional = () => b.avaliar(() => [...document.querySelectorAll('.gi-detalhe-secao dt')].find(e => e.textContent.startsWith('Observação ')).nextElementSibling.textContent);
    assert.equal(await adicional(), 'Preenchimento sintético atualizado', 'edição reflete no detalhe em cache');
    await fechar();
    await b.clicar('[data-excluir="DEMO-001"]');
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-modal-leitura')), false);
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => !document.querySelector('.gi-modal') && document.querySelector('[data-excluir="DEMO-001"]').disabled);
    await abrir();
    assert.equal(await adicional(), '—', 'excluir não ressuscita valores antigos do cache');
    await fechar();
    for (const largura of [1099, 720, 390]) {
      await b.viewport(largura, 740);
      await abrir();
      const empilhado = await b.avaliar(() => {
        const conjunto = document.querySelector('.gi-detalhe-conjunto'), m = document.querySelector('.gi-modal-leitura'), a = document.querySelector('.gi-detalhe-adendo');
        const r = m.getBoundingClientRect(), l = a.getBoundingClientRect();
        return { abaixo: l.top >= r.bottom, mesmaLargura: Math.abs(l.width - r.width) <= 1, scroll: conjunto.scrollHeight > conjunto.clientHeight, principalOverflow: getComputedStyle(m.querySelector('.gi-modal-corpo')).overflowY, lateralOverflow: getComputedStyle(a.querySelector('.gi-detalhe-adendo-corpo')).overflowY };
      });
      assert.deepEqual(empilhado, { abaixo: true, mesmaLargura: true, scroll: true, principalOverflow: 'visible', lateralOverflow: 'visible' });
      await b.avaliar(() => { const c = document.querySelector('.gi-detalhe-conjunto'); c.scrollTop = c.scrollHeight; });
      assert.ok(await b.avaliar(() => document.querySelector('.gi-detalhe-adendo').getBoundingClientRect().bottom <= innerHeight));
      await b.captura('detalhe-0290-' + largura + '-' + tema);
      await fechar();
    }
    await b.viewport(390, 740);
    await abrir();
    const r = await b.avaliar(() => { const r = document.querySelector('.gi-detalhe-conjunto').getBoundingClientRect(); return { x: r.x, width: r.width, height: r.height }; });
    assert.ok(r.x >= 8 && r.width >= 350 && r.width <= 374 && r.height <= 629);
    assert.equal(await b.avaliar(() => document.querySelector('.gi-barra').scrollWidth > document.querySelector('.gi-barra').clientWidth), false);
    await fechar();
  }
  await b.navegar(origem + '/app/imoveis.html?modo=local&perfil=admin');
  await b.esperar(() => !!document.querySelector('[data-detalhe]'));
  await abrir();
  assert.match(await b.avaliar(() => document.querySelector('.gi-modal').textContent), /Dados do site indisponíveis agora\./);
  assert.equal(await chamadasDetalhe(), 0);
  await fechar();
  await b.navegar(origem + '/app/imoveis.html?perfil=admin');
  await b.esperar(() => !!document.querySelector('[data-detalhe]'));
  // Fechar durante a carga, reabrir e mudar de imóvel não injeta resposta antiga.
  await b.avaliar(() => {
    var ler = GI.detalheDoImovel;
    GI.detalheDoImovel = function (codigo) {
      return codigo === 'DEMO-001' ? new Promise(function (resolve) { window.liberarDetalhe = function () { ler(codigo).then(resolve); }; }) : ler(codigo);
    };
  });
  await b.clicar('[data-detalhe="DEMO-001"]');
  await b.esperar(() => !!window.liberarDetalhe);
  await fechar();
  await abrir('DEMO-003');
  await b.avaliar(() => window.liberarDetalhe());
  await b.esperar(() => bancada.chamadas.some(c => /imovel\/DEMO-001/.test(c.caminho)));
  assert.doesNotMatch(await b.avaliar(() => document.querySelector('.gi-modal').textContent), /Cidade sintética/);
  await fechar();
  await abrir();
  assert.match(await b.avaliar(() => document.querySelector('.gi-modal').textContent), /Cidade sintética/);
  assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => /imovel\/DEMO-001/.test(c.caminho)).length), 1);
  await fechar();
  // Uma falha de transporte conserva a identificação, os campos e o catálogo.
  await b.avaliar(() => { GI.detalheDoImovel = function () { return Promise.reject(new Error('HTTP 500')); }; });
  await abrir('DEMO-002');
  assert.match(await b.avaliar(() => document.querySelector('.gi-modal').textContent), /Dados do site indisponíveis agora\./);
  await fechar();
  assert.deepEqual(b.erros, []);
  process.stdout.write('PASS detalhe: filtros alinhados, clique, Enter/Espaço, 50%, adendo lateral 23%, rolagens independentes, empilhamento 1099/720/390, foto principal grande, centralização, seções e vazios, centavos, escape, URLs, cache, ações separadas, fechar, 404, local, responsivo, claro/escuro; FAIL 0\n');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
