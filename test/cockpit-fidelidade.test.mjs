import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { abrirExtensao } from './fidelidade/roteiros.mjs';

test('cockpit: título do Novo vem da primeira frase/linha, com reserva e limite', async () => {
  const GI = { CHAMADO_CATEGORIAS: { eletrica: 'Elétrica', hidraulica: 'Hidráulica' } };
  vm.runInNewContext(await readFile(new URL('../app/cockpit.js', import.meta.url), 'utf8'), { GI });
  const snapshot = GI.cockpit.guardar([], 1, { locacoes: [], chamados: [{ id: 871, status: 'concluido', concluido_em: '2026-09-02T12:00:00Z', anexos: ['não persistir'] }] }, 1000);
  assert.equal(snapshot[0].dados.chamados[0].concluido_em, '2026-09-02T12:00:00Z');
  assert.equal(Object.hasOwn(snapshot[0].dados.chamados[0], 'anexos'), false);
  const titulo = GI.cockpit.tituloNovo;
  assert.equal(titulo('  Chuveiro frio. Segunda frase.', 'eletrica'), 'Chuveiro frio');
  assert.equal(titulo('Primeira linha\nSegunda linha', 'eletrica'), 'Primeira linha');
  assert.equal(titulo(' ', 'eletrica'), 'Reparo de Elétrica');
  assert.equal(titulo('', 'constructor'), 'Reparo de Outro');
  assert.equal(titulo('a'.repeat(100), 'eletrica').length, 80);
});

test('cockpit: componentes do desenho e acesso real ao status e Editar', async () => {
  const s = await abrirExtensao('cockpit-chamados', { largura: 315, altura: 798 });
  try {
    const r = await s.b.avaliar(() => ({
      numero: document.querySelector('[data-os-id="871"] .acc__id').textContent,
      pc: !!document.querySelector('.pc'), tabs: !!document.querySelector('.tabs'),
      segmentos: document.querySelector('[data-os-id="1042"] .mini').children.length,
      kv: !!document.querySelector('[data-os-id="1042"] .kv .k'),
      editar: document.querySelector('[data-os-id="1042"] [data-editar-os]').textContent,
      atalho: !!document.querySelector('[id^="cp-abrir"]')
    }));
    assert.deepEqual(r, { numero: 'OS-0871', pc: true, tabs: true, segmentos: 7, kv: true, editar: '✎ Editar', atalho: false });
    await s.b.clicar('[data-os-id="1042"] [data-mudar-status]');
    assert.equal(await s.b.avaliar(() => document.activeElement.dataset.rapida), 'status');
    await s.b.clicar('[data-os-id="1042"] [data-editar-os]');
    await s.b.esperar(() => !!document.querySelector('#cp-edit-form'));
    assert.equal(await s.b.avaliar(() => document.querySelector('#cp-edit-titulo').value), 'Vazamento na pia da cozinha');
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
});

test('cockpit: Novo exige Título e confirmação/sucesso sucessivos', async () => {
  const s = await abrirExtensao('cockpit-novo', { largura: 315, altura: 911 });
  try {
    assert.equal(await s.b.avaliar(() => document.querySelector('#cp-titulo').getAttribute('aria-required') === 'true'), true);
    await s.b.preencher('#cp-titulo', 'Chuveiro do banheiro');
    await s.b.clicar('#cp-revisar');
    assert.equal(await s.b.avaliar(() => document.querySelector('#cp-cabecalho').hidden && document.querySelector('#cp-abas').hidden), true);
    assert.equal(await s.b.avaliar(() => !!document.querySelector('#cp-sucesso')), false);
    await s.b.clicar('#cp-conferencia');
    assert.equal(await s.b.avaliar(() => document.querySelector('#cp-confirmar').disabled), true);
    await s.b.avaliar(() => document.querySelector('#cp-confirmar').onclick());
    assert.equal(s.portal.dados.chamados.length, 12, 'checkbox desmarcado bloqueia também o handler');
    await s.b.clicar('#cp-conferencia');
    await s.b.clicar('#cp-confirmar');
    await s.b.esperar(() => !!document.querySelector('#cp-sucesso'));
    assert.equal(s.portal.dados.chamados[0].titulo, 'Chuveiro do banheiro');
    assert.match(await s.b.avaliar(() => document.querySelector('#cp-sucesso').textContent), /Chuveiro do banheiro/);
    assert.equal(await s.b.avaliar(() => !!document.querySelector('#cp-confirmar')), false);
    assert.deepEqual(s.b.erros, []);
  } finally { await s.fechar(); }
});

test('cockpit: menu devolve foco por Esc/item e preserva o foco do campo em clique fora', async () => {
  const s = await abrirExtensao('cockpit-chamados', { largura: 315, altura: 1100 });
  try {
    const card = '[data-os-id="1042"]';
    const modelo = s.portal.dados.chamados.find(c => c.id === 1042);
    for (let i=0; i<4; i++) s.portal.dados.chamados.push({...structuredClone(modelo), id:2000+i, numero:2000+i});
    await s.b.navegar(await s.b.avaliar(() => location.href));
    await s.b.esperar(() => document.querySelector('#cp-busca')?.checkVisibility());
    await s.b.avaliar(() => { document.querySelector('[data-os-id="1042"]').open=true; });
    const antes = await s.b.avaliar(sel => {
      const c = document.querySelector(sel), linha = c.querySelector('.cp-acoes-principais');
      return { altura:c.getBoundingClientRect().height,
        topos:[...linha.querySelectorAll(':scope > button,[data-editar-os],summary')].map(n=>n.getBoundingClientRect().top) };
    }, card);
    assert.equal(antes.topos.length, 4);
    assert.equal(new Set(antes.topos).size, 1);
    await s.b.clicar(card + ' .cp-acoes-extra > summary');
    assert.equal(await s.b.avaliar(sel=>document.querySelector(sel).getBoundingClientRect().height,card),antes.altura);
    assert.equal(await s.b.avaliar(sel=>document.querySelector(sel+' .cp-acoes-extra summary').getAttribute('aria-expanded'),card),'true');
    for (const seletor of ['[data-edicao]','[data-detalhes]','[data-copiar-os]','[data-resumo-copiar]','[data-aviso]','[data-vincular]','[data-lista-completa]','[data-voltar-lista]']) {
      assert.equal(await s.b.avaliar((c,s)=>!!document.querySelector(c+' .cp-menu '+s),card,seletor),true,seletor);
    }
    await s.b.avaliar(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
    assert.equal(await s.b.avaliar(sel=>document.querySelector(sel+' .cp-acoes-extra').open,card),false);
    assert.equal(await s.b.avaliar(sel=>document.activeElement===document.querySelector(sel+' .cp-acoes-extra > summary'),card),true);
    await s.b.clicar(card+' .cp-acoes-extra > summary');
    const ponto = await s.b.avaliar(() => {
      const r=document.querySelector('#cp-busca').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
    });
    await s.b.cdp('Input.dispatchMouseEvent',{type:'mousePressed',...ponto,button:'left',clickCount:1});
    await s.b.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...ponto,button:'left',clickCount:1});
    assert.equal(await s.b.avaliar(sel=>document.querySelector(sel+' .cp-acoes-extra').open,card),false);
    assert.equal(await s.b.avaliar(()=>document.activeElement===document.querySelector('#cp-busca')),true);
    await s.b.clicar(card+' .cp-acoes-extra > summary');
    await s.b.clicar(card+' [data-copiar-os]');
    assert.equal(await s.b.avaliar(sel=>document.querySelector(sel+' .cp-acoes-extra').open,card),false);
    assert.equal(await s.b.avaliar(sel=>document.activeElement===document.querySelector(sel+' .cp-acoes-extra > summary'),card),true);
    assert.deepEqual(s.b.erros,[]);
  } finally { await s.fechar(); }
});
