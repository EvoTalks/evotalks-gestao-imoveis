import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const GI = { CHAMADO_CATEGORIAS: { eletrica: 'Elétrica', outros: 'Outros' } };
vm.runInNewContext(readFileSync(new URL('../app/chamado-form.js', import.meta.url), 'utf8'), { GI });
test('Novo deriva título da primeira frase ou linha da descrição e limita a 80 caracteres', () => {
  assert.equal(GI.tituloNovoChamado('  Chuveiro sem energia. Segunda frase.', 'eletrica'), 'Chuveiro sem energia');
  assert.equal(GI.tituloNovoChamado('Primeira linha\nSegunda linha', 'eletrica'), 'Primeira linha');
  assert.equal(GI.tituloNovoChamado('a'.repeat(100), 'eletrica'), 'a'.repeat(80));
  assert.equal(GI.tituloNovoChamado('', 'eletrica'), 'Reparo de Elétrica');
  assert.equal(GI.tituloNovoChamado('  ', '__proto__'), 'Reparo de Outros');
});
test('Lista conserva nove colunas, paginação e pílula-controle com ponto; funções são ícones', () => {
  const html = readFileSync(new URL('../app/chamados.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/<th(?: [^>]*)?>([^<]+)<\/th>/g)].map(m=>m[1]), ['O.S.','Chamado','Imóvel','Atendimento','Prioridade','Prazo','Prestador','Status','Funções']);
  for (const id of ['b-anterior','gi-pagina','b-proxima','gi-total']) assert.ok(html.includes('id="'+id+'"'));
  const form = readFileSync(new URL('../app/chamado-form.js', import.meta.url), 'utf8');
  assert.ok(form.includes('gi-status-pilula'));
  assert.ok(form.includes('gi-ponto gi-ponto-'));
  const lista = readFileSync(new URL('../app/chamados.js', import.meta.url), 'utf8');
  assert.ok(lista.includes('data-editar="')); assert.ok(lista.includes('data-cancelar-chamado="'));
  assert.ok(lista.includes('btn-icone'));
});
test('S2A2: Novo e Editar preservam ações no desenho com os dados do contrato', async () => {
  const { testarCorrecoes } = await import('./fidelidade/chamados-correcoes.mjs');
  await testarCorrecoes();
});
