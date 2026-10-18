import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPortalChamados } from './bancada/portal-chamados.mjs';
import { createHash } from 'node:crypto';
import { criarServidor } from './bancada/servidor.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function bancada() {
  const p = criarPortalChamados({ locacoes: [{ id: 1, contatos: [] }], semFixtures: true });
  const api = (rota, dados) => p.responder(dados === undefined ? 'GET' : 'POST', rota, undefined, dados, 'Agente Sintético');
  const entrada = { locacao_id: 1, titulo: 'Foto sintética', categoria: 'outros', solicitante: { nome: 'Demonstração' } };
  const id = api('/chamados', entrada).corpo.chamado.id;
  return { p, api, id, entrada };
}
const foto = (bytes = [255,216,255,1]) => ({ nome: '<foto>"/\\.jpg', mimetype: 'image/jpeg', dados_base64: Buffer.from(bytes).toString('base64') });
test('upload e leitura, metadados sem bytes, duplicata e evento único', () => {
  const { api, id, entrada } = bancada(), base = '/chamados/' + id;
  const r = api(base + '/anexos/upload', foto());
  assert.equal(r?.status, 200); const a = r.corpo.anexo;
  assert.equal(a.file_ref, 'upload:' + createHash('sha256').update(Buffer.from([255,216,255,1])).digest('hex'));
  assert.equal(a.nome, '_foto____.jpg'); assert.equal(a.tamanho, 4); assert.equal(a.origem, 'upload'); assert.equal(a.criado_por, 'Agente Sintético');
  assert.equal(api(base + '/anexos/upload', foto()).corpo.repetido, true);
  const d = api(base).corpo;
  assert.equal(d.chamado.anexos_total, 1); assert.equal(d.eventos.filter(e => e.tipo === 'anexo').length, 1);
  assert.deepEqual(d.eventos.at(-1).detalhe, { arquivos: [a.file_ref] });
  assert.ok(!JSON.stringify(d).includes('dados_base64')); assert.ok(!JSON.stringify(d).includes('conteudo'));
  const arquivo = api(base + '/anexos/' + a.id + '/arquivo');
  assert.equal(arquivo.headers['Cache-Control'], 'no-store'); assert.equal(arquivo.corpo.dados_base64, foto().dados_base64);
  const outro = api('/chamados', entrada).corpo.chamado.id;
  assert.equal(api('/chamados/' + outro + '/anexos/' + a.id + '/arquivo').status, 404);
  api(base + '/anexos', { anexos: [{ file_ref: 'chat:sintetico' }] });
  assert.equal(api(base + '/anexos/2/arquivo').status, 404);
  for (const aid of ['invalido', '999']) assert.equal(api(base + '/anexos/' + aid + '/arquivo').status, 404);
  assert.equal(api('/chamados/999/anexos/upload', foto()).status, 404);
});
test('upload valida tipo, bytes, base64 estrito e 2 MiB; limite 20 preserva duplicata', () => {
  const { api, id } = bancada(), base = '/chamados/' + id + '/anexos/upload';
  for (const d of [ { ...foto(), mimetype: 'image/svg+xml' }, { ...foto(), mimetype: 'image/png' },
    { ...foto(), dados_base64: Buffer.from('<svg/>').toString('base64') },
    ...['', '%%%=', 'data:image/jpeg;base64,/9j/', '/9j/\n', 'AB=='].map(dados_base64 => ({ ...foto(), dados_base64 })),
    { ...foto(), mimetype: 'image/gif', dados_base64: Buffer.from([199,201,198,184,185,225]).toString('base64') },
    foto(Buffer.alloc(2 * 1024 * 1024 + 1)) ]) assert.equal(api(base, d)?.status, 422);
  const maximo = Buffer.alloc(2 * 1024 * 1024); maximo.set([255,216,255]);
  assert.equal(api(base, foto(maximo)).status, 200);
  for (let i = 0; i < 19; i++) assert.equal(api(base, foto([255,216,255,i])).status, 200);
  assert.equal(api(base, foto([255,216,255,99])).corpo.erro, 'limite_anexos');
  assert.equal(api(base, foto([255,216,255,1])).corpo.repetido, true);
});
test('falha injetada não grava; repetição funciona', () => {
  const { p, api, id } = bancada();
  p.falharUpload(1);
  assert.equal(api('/chamados/' + id + '/anexos/upload', foto()).status, 500);
  assert.equal(api('/chamados/' + id).corpo.chamado.anexos_total, 0);
  assert.equal(api('/chamados/' + id + '/anexos/upload', foto()).status, 200);
});
test('HTTP recusa corpo de upload acima de 3 MB com JSON 413', async () => {
  const servidor = criarServidor(); await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch('http://127.0.0.1:' + servidor.address().port + '/api/ext/chamados/1/anexos/upload', {
      method: 'POST', headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ dados_base64: 'A'.repeat(3 * 1024 * 1024) }) });
    assert.equal(r.status, 413); assert.equal((await r.json()).erro, 'arquivo_grande');
  } finally { await new Promise(r => servidor.close(r)); }
});
test('cota de transporte bloqueia a 31ª chamada antes de enviar e libera após 60s', () => {
  const window = { addEventListener() {} }, sandbox = { window, document: {}, URL, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../app/comum.js', import.meta.url), 'utf8'), sandbox);
  let agora = 0; const cota = window.GI.criarCotaPortal(() => agora);
  for (let i = 0; i < 30; i++) cota.reservar();
  assert.throws(() => cota.reservar(), e => e.status === 429 && e.code === 'rate_limited');
  agora = 59999; assert.throws(() => cota.reservar());
  agora = 60000; assert.doesNotThrow(() => cota.reservar());
});
test('portal aceita as quatro assinaturas e nunca aceita SVG no tipo permitido', () => {
  const { api, id } = bancada(), rota = '/chamados/' + id + '/anexos/upload';
  for (const [mimetype, bytes] of [
    ['image/jpeg', Buffer.from([255,216,255])], ['image/png', Buffer.from([137,80,78,71])],
    ['image/webp', Buffer.from('RIFF1234WEBP')], ['image/gif', Buffer.from('GIF87a')], ['image/gif', Buffer.from('GIF89a')]
  ]) {
    const r = api(rota, { nome: '', mimetype, dados_base64: bytes.toString('base64') });
    assert.equal(r.status, 200); assert.equal(r.corpo.anexo.nome, 'foto');
  }
  for (const mimetype of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.equal(api(rota, { nome: 'disfarce.png', mimetype, dados_base64: Buffer.from('<svg/>').toString('base64') }).status, 422);
  }
});
test('lote Y: miniatura no detalhe, fora das listas e duplicata não a substitui', () => {
  const { api, id } = bancada(), base = '/chamados/' + id;
  const miniatura_base64 = '/9j/AQ==';
  const r = api(base + '/anexos/upload', { ...foto(), miniatura_base64 });
  assert.equal(r.status, 200);
  assert.equal(api(base).corpo.anexos[0].miniatura_base64, miniatura_base64);
  assert.equal(JSON.stringify(api('/chamados').corpo).includes('miniatura_base64'), false);
  api(base + '/anexos/upload', { ...foto(), miniatura_base64: '/9j/Ag==' });
  assert.equal(api(base).corpo.anexos[0].miniatura_base64, miniatura_base64);
  api(base + '/anexos/upload', foto([255,216,255,2]));
  assert.equal(api(base).corpo.anexos[1].miniatura_base64, null);
});
test('lote Y: upload valida corpo antes do 404, nome textual e controles C1', () => {
  const { p, api, id } = bancada(), rota = '/chamados/' + id + '/anexos/upload';
  assert.equal(p.responder('POST', rota, undefined, null).status, 422);
  assert.equal(api('/chamados/999/anexos/upload', {}).status, 422);
  for (const nome of [1, {}, [], false, null]) assert.equal(api(rota, { ...foto(), nome }).status, 422);
  assert.equal(api('/chamados/' + id).corpo.anexos.length, 0);
  assert.equal(api(rota, { ...foto(), nome: 'a\x7fb\x85c\x9f.jpg' }).corpo.anexo.nome, 'a_b_c_.jpg');
});
test('lote Y: miniatura estrita JPEG até 40 KB e recusas atômicas', () => {
  const { api, id } = bancada(), rota = '/chamados/' + id + '/anexos/upload';
  const grande = Buffer.alloc(40 * 1024 + 1); grande.set([255,216,255]);
  for (const miniatura_base64 of ['', '%%%', 'AB==', 'data:image/jpeg;base64,/9j/', 'YWJj', grande.toString('base64'), 1]) {
    const r = api(rota, { ...foto(), miniatura_base64 });
    assert.equal(r.status, 422); assert.ok(r.corpo.campos.miniatura_base64);
    assert.equal(api('/chamados/' + id).corpo.anexos.length, 0);
  }
  const maxima = grande.subarray(0, 40 * 1024).toString('base64');
  assert.equal(api(rota, { ...foto(), miniatura_base64: maxima }).status, 200);
  assert.equal(api(rota, { ...foto([255,216,255,9]), miniatura_base64: null }).status, 200);
});
test('lote Y: simulador conta requisições por método e rota, inclusive recusas', () => {
  const { p, api, id } = bancada(), base = '/chamados/' + id;
  api(base); api(base); api(base + '/anexos/upload', {});
  assert.equal(p.requisicoes.get('GET ' + base), 2);
  assert.equal(p.requisicoes.get('POST ' + base + '/anexos/upload'), 1);
});
test('lote Y: dois orçamentos simultâneos reutilizam um prestador pelo nome normalizado', async () => {
  const { api, id, entrada } = bancada();
  const outro = api('/chamados', entrada).corpo.chamado.id;
  const rs = await Promise.all([id, outro].map((n, i) => Promise.resolve().then(() => api('/chamados/' + n + '/orcamentos', {
    prestador_nome: i ? '  tecnico   sintetico y ' : 'Técnico Sintético Y', valor_centavos: 100
  }))));
  assert.equal(rs[0].status, 201); assert.equal(rs[1].status, 201);
  assert.equal(rs[0].corpo.orcamento.prestador_id, rs[1].corpo.orcamento.prestador_id);
  assert.equal(api('/prestadores').corpo.total, 1);
});
