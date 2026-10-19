import assert from 'node:assert/strict';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
function instrumentar() {
  const http = omni.http.request;
  bancada.editPosts = []; bancada.getFiles = []; bancada.getMessages = [];
  omni.http.request = async op => {
    const edit = op.method === 'POST' && /\/chamados\/\d+$/.test(op.url);
    if (edit) {
      bancada.editPosts.push(JSON.parse(op.body));
      if (bancada.erroEditar === '422') return { status: 422, body: JSON.stringify({ erro: 'dados_invalidos', campos: { titulo: 'Informe um texto.' } }) };
      if (bancada.erroEditar === '409') {
        await http({ ...op, url: op.url + '/status', body: JSON.stringify({ status: 'cancelado' }) });
        return { status: 409, body: '{"erro":"chamado_encerrado"}' };
      }
      if (bancada.erroEditar === 'rede') throw new Error('Http failure response for https://host.invalid/extensionsruntime/proxy: 0 Unknown Error');
      if (bancada.atrasarEdicao) await new Promise(r => { bancada.liberarEdicao = r; });
    }
    if (bancada.semResposta && op.method === 'POST' && /\/chamados$/.test(op.url)) {
      bancada.semResposta = false; throw new Error('Http failure response for https://host.invalid/extensionsruntime/proxy: 0 Unknown Error');
    }
    return http(op);
  };
  const getFile = omni.chats.getFile, getMessages = omni.chats.getMessages;
  omni.chats.getFile = async ref => {
    bancada.getFiles.push(ref);
    if (ref === 'F24-erro') throw new Error('Arquivo não encontrado.');
    if (ref === 'F24-quebrada') return { url: '/imagem-inexistente.png' };
    if (ref.startsWith('F24-')) return { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', name: ref + '.png', mimetype: 'image/png' };
    return getFile(ref);
  };
  omni.chats.getMessages = async (n, opts) => {
    bancada.getMessages.push(opts);
    if (bancada.msgs) return bancada.msgs;
    return getMessages(n, opts);
  };
}
const servidor = criarServidor();
servidor.prependListener('request', (req, res) => {
  if (!req.url.startsWith('/app/painel.html')) return;
  const end = res.end;
  res.end = function (data, ...args) {
    if (typeof data === 'string' || Buffer.isBuffer(data)) data = data.toString().replace(/<script src="comum.js(?:\?v=[^"]+)?">/, '<script>(' + instrumentar.toString() + ')();</script>$&');
    return end.call(this, data, ...args);
  };
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port + '/app/painel.html?escrita=1';
let b; const falhas = [];
const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
async function caso(nome, fn) {
  try { await fn(); process.stdout.write('OK F24 ' + nome + '\n'); }
  catch (err) { falhas.push(err); process.stderr.write('FALHA F24 ' + nome + ': ' + err.message + '\n'); }
}
async function abrir(query = '') {
  await b.navegar(base + query);
  await b.esperar(() => document.querySelector('[data-os-id] [data-rapida="atendente"]:not(:disabled)'));
}
async function editar() { await b.clicar('[data-os-id] [data-editar-os]'); await b.esperar(() => !!document.querySelector('#cp-edit-titulo')); }
async function novo(msgs) {
  await abrir();
  if (msgs) await b.avaliar(msgs => { bancada.msgs = msgs; }, msgs);
  await b.clicar('#cp-tab-novo');
  if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
  await b.esperar(() => !!document.querySelector('[data-foto]'));
}
async function salvarEdicao() { await b.clicar('#cp-edit-salvar'); await b.esperar(() => !document.querySelector('#cp-edit-form')); }
try {
  b = await abrirChromium();
  await caso('RC12 D: Novo é o único caminho de abertura nos três perfis', async () => {
    for (const perfil of ['agente', 'supervisor', 'admin']) for (const escrita of [0, 1]) {
      await b.navegar(base.replace('escrita=1', 'escrita=' + escrita) + '&perfil=' + perfil);
      await b.esperar(() => !!document.querySelector('#cp-busca'));
      assert.equal(await b.avaliar(() => document.querySelector('#cp-tab-novo').hidden), !escrita);
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir, #cp-abrir-imovel')), false);
      await b.clicar('#cp-tab-imovel');
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir, #cp-abrir-imovel')), false);
    }
  });
  await caso('RC12 D: lista vazia orienta para Novo somente com escrita ligada', async () => {
    for (const escrita of [0, 1]) {
      await abrir();
      await b.avaliar(escrita => {
        GI.ctx().config.cockpitAbreChamado = !!escrita;
        GI.chamadosPorContato = async () => ({ rows: [] });
      }, escrita);
      await b.clicar('#cp-atualizar');
      await b.esperar(() => document.querySelector('#cp-conteudo').textContent.includes('Nenhum chamado deste imóvel.'));
      const conteudo = await texto('#cp-conteudo');
      if (escrita) assert.match(conteudo, /Para abrir um chamado, use a aba Novo\./);
      else assert.doesNotMatch(conteudo, /aba Novo/);
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir, #cp-abrir-imovel')), false);
    }
  });
  const fotosRC12 = Array.from({ length: 25 }, (_, i) => ({ fileRef: 'F24-' + i, fileName: 'Foto ' + i, mimetype: 'image/png' }));
  await caso('RC12 a: Selecionar todas marca só as visíveis, limitado a 20', async () => {
    await novo(fotosRC12); await b.clicar('#cp-fotos-todas');
    assert.match(await texto('#cp-fotos-contador'), /^12 foto/);
    assert.equal(await texto('#cp-fotos-aviso'), '');
    await b.clicar('#cp-fotos-mais');
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-foto][aria-checked="true"]').length), 12);
    await b.clicar('#cp-fotos-todas'); assert.match(await texto('#cp-fotos-contador'), /^20 foto/);
    assert.match(await texto('#cp-fotos-aviso'), /Máximo de 20 fotos/);
  });
  await caso('RC12 b: desmarcar uma foto limpa o aviso de limite', async () => {
    await novo(fotosRC12); await b.clicar('#cp-fotos-mais'); await b.clicar('#cp-fotos-todas');
    assert.match(await texto('#cp-fotos-aviso'), /Máximo de 20 fotos/);
    await b.clicar('[data-foto][aria-checked="true"]');
    assert.match(await texto('#cp-fotos-contador'), /^19 foto/);
    assert.equal(await texto('#cp-fotos-aviso'), '');
  });
  await caso('RC12 c: Mostrar mais mantém tiles anteriores e foco no primeiro novo', async () => {
    await novo(fotosRC12);
    await b.avaliar(() => { bancada.primeiroTile = document.querySelector('[data-foto]'); document.querySelector('#cp-fotos-mais').focus(); });
    await b.tecla('Enter');
    assert.equal(await b.avaliar(() => document.activeElement === document.querySelectorAll('[data-foto]')[12]), true);
    assert.equal(await b.avaliar(() => bancada.primeiroTile === document.querySelector('[data-foto]')), true);
    await b.avaliar(() => document.querySelector('#cp-fotos-mais').focus()); await b.tecla('Enter');
    assert.equal(await b.avaliar(() => document.activeElement === document.querySelectorAll('[data-foto]')[24]), true);
    assert.equal(await b.avaliar(() => !!document.querySelector('#cp-fotos-mais')), false);
    assert.equal(await b.avaliar(() => bancada.getMessages.length), 1);
  });
  await caso('edição inline por três perfis; 1 GET ao abrir, diff e 1 GET após salvar', async () => {
    for (const perfil of ['agente', 'supervisor', 'admin']) {
      await abrir('&perfil=' + perfil);
      assert.equal(await b.avaliar(() => document.querySelector('[data-os-id] .cp-editar [data-editar-os]').textContent), '✎ Editar');
      await b.avaliar(async () => {
        const n = document.querySelector('[data-os-id]').dataset.osId;
        const r = await fetch('/api/ext/chamados/' + n, { method: 'POST', headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Base F24', descricao: 'Base', categoria: 'outros', prioridade: 'normal' }) });
        if (!r.ok) throw new Error('Preparação recusada');
        bancada.chamadas = [];
      }); await editar();
      assert.equal(await b.avaliar(() => bancada.chamadas.length), 1);
      assert.equal(await b.avaliar(() => document.activeElement.id), 'cp-edit-titulo');
      assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-salvar').disabled), true);
      assert.equal(await b.avaliar(() => [...document.querySelectorAll('[data-os-id] [data-rapida]')].slice(0, 5).every(x => x.disabled)), true);
      await b.preencher('#cp-edit-titulo', 'Título F24 ' + perfil + ' <img src=x onerror=window.__xss=1>');
      await b.preencher('#cp-edit-descricao', 'Descrição F24 ' + perfil);
      const categoria = 'eletrica', prioridade = 'alta';
      await b.clicar('[data-edit-categoria="' + categoria + '"]'); await b.clicar('[data-edit-prioridade="' + prioridade + '"]');
      await salvarEdicao();
      assert.deepEqual(await b.avaliar(() => bancada.editPosts.at(-1)), { titulo: 'Título F24 ' + perfil + ' <img src=x onerror=window.__xss=1>', descricao: 'Descrição F24 ' + perfil, categoria, prioridade });
      assert.equal(await b.avaliar(() => bancada.chamadas.length), 3);
      assert.match(await texto('[data-os-id] > summary'), /Título F24/);
      assert.match(await texto('#cp-recado'), /OS-\d+ salva ✓/);
      assert.equal(await b.avaliar(() => document.querySelector('[data-os-id]').open && document.activeElement.matches('[data-editar-os]')), true);
      assert.equal(await b.avaliar(() => window.__xss), undefined);
    }
    await abrir(); await editar();
    await b.preencher('#cp-edit-disponibilidade', 'Manhã'); await b.preencher('#cp-edit-chaves', 'Portaria');
    await b.avaliar(() => { document.querySelector('#cp-edit-sem-cliente').checked = true; document.querySelector('#cp-edit-sem-cliente').dispatchEvent(new Event('change')); });
    await salvarEdicao(); await editar(); await b.preencher('#cp-edit-chaves', ''); await salvarEdicao();
    assert.deepEqual(await b.avaliar(() => bancada.editPosts.at(-1)), { acesso: { disponibilidade: 'Manhã', chaves: '', sem_cliente: true } });
  });
  await caso('rascunho: 422/rede, retry, cancelar, Esc, outro cartão e marca externa', async () => {
    await abrir(); await editar();
    await b.preencher('#cp-edit-titulo', '');
    assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-salvar').disabled), true);
    assert.match(await texto('#cp-edit-titulo-erro'), /Informe o título do chamado/);
    await b.preencher('#cp-edit-titulo', 'Rascunho F24');
    for (const erro of ['422', 'rede']) {
      await b.avaliar(erro => { bancada.erroEditar = erro; }, erro);
      await b.clicar('#cp-edit-salvar'); await b.esperar(() => !document.querySelector('#cp-edit-salvar').disabled);
      assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-titulo').value), 'Rascunho F24');
      if (erro === '422') assert.match(await texto('#cp-edit-titulo-erro'), /Título: preencha este campo com texto válido/);
      else { assert.match(await texto('#cp-edit-erro'), /Não consegui falar com o servidor/); assert.equal(await texto('#cp-edit-salvar'), 'Tentar de novo'); }
    }
    await b.avaliar(async () => { bancada.chamadas = []; await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now() + 1, por: 'externa-f24' }); document.activeElement.blur(); window.dispatchEvent(new Event('focus')); });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
    await b.clicar('#cp-edit-cancelar'); assert.match(await texto('#cp-edit-descartar'), /Descartar as alterações/);
    await b.clicar('#cp-edit-continuar');
    await b.avaliar(() => document.querySelector('#cp-edit-titulo').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-descartar').hidden), false);
    await b.clicar('#cp-edit-continuar');
    await b.clicar('#cp-atualizar'); assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-descartar').hidden), false); await b.clicar('#cp-edit-continuar');
    await b.avaliar(() => { const outro = [...document.querySelectorAll('[data-editar-os]')].find(x => !x.disabled && !x.closest('[data-os-id]').querySelector('#cp-edit-form')); outro.click(); });
    assert.equal(await b.avaliar(() => document.querySelector('#cp-edit-descartar').hidden), false); await b.clicar('#cp-edit-continuar');
    await b.avaliar(() => { bancada.erroEditar = ''; }); await salvarEdicao();
    await editar(); await b.clicar('#cp-edit-cancelar'); assert.equal(await b.avaliar(() => !!document.querySelector('#cp-edit-form')), false);
    await editar(); await b.preencher('#cp-edit-titulo', 'Fechado F24'); await b.avaliar(() => { bancada.erroEditar = '409'; });
    await salvarEdicao(); assert.match(await texto('#cp-recado'), /Este chamado está encerrado. Reabra antes de editar/);
    assert.equal(await b.avaliar(() => document.querySelector('[data-os-id] [data-editar-os]').disabled), true);
  });
  await caso('grade selecionável, falhas, duplicatas, paginação, ampliação e limite de 20', async () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ fileRef: 'F24-' + (i === 1 ? 'erro' : i === 2 ? 'quebrada' : i), fileName: 'Foto ' + i + '.png', mimetype: 'image/png', at: new Date(Date.UTC(2026, 9, 18, 12, i)).toISOString() }));
    msgs.push(msgs[24]); await novo(msgs);
    assert.equal(await b.avaliar(() => document.querySelectorAll('[data-foto]').length), 12);
    assert.equal(await b.avaliar(() => document.querySelector('[data-foto]').tagName), 'BUTTON');
    await b.esperar(() => document.querySelector('[data-foto] img')?.naturalWidth > 0);
    assert.equal(await b.avaliar(() => {
      const img = document.querySelector('[data-foto] img'), visual = img.parentElement;
      return Math.abs(img.getBoundingClientRect().width - visual.getBoundingClientRect().width) < 1 && Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - 4 / 3) < 0.02;
    }), true, 'imagem deve ocupar a miniatura inteira em 4:3, sem herdar o limite antigo de 70 px');
    await b.clicar('[data-foto]'); assert.match(await texto('#cp-fotos-contador'), /1 foto/);
    const antes = await b.avaliar(() => bancada.getFiles.length);
    await b.clicar('[data-ampliar-foto]'); assert.equal(await b.avaliar(() => document.querySelector('#cp-foto-ampliada').hidden), false);
    assert.equal(await b.avaliar(() => document.querySelector('#cp-foto-grande img').getBoundingClientRect().width > document.querySelector('[data-foto] img').getBoundingClientRect().width), true, 'ampliação ocupa o painel, acima do tamanho da miniatura');
    await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(await b.avaliar(() => document.querySelector('#cp-foto-ampliada').hidden), true);
    assert.equal(await b.avaliar(() => bancada.getFiles.length), antes); assert.match(await texto('#cp-fotos-contador'), /1 foto/);
    await b.clicar('#cp-fotos-mais'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-foto]').length), 24);
    await b.clicar('#cp-fotos-mais'); assert.equal(await b.avaliar(() => document.querySelectorAll('[data-foto]').length), 25);
    await b.esperar(() => [...document.querySelectorAll('[data-foto]')].filter(x => x.textContent.includes('Prévia indisponível')).length === 2);
    await b.clicar('[data-foto="F24-erro"]'); await b.clicar('[data-ampliar-foto="F24-erro"]'); assert.match(await texto('#cp-foto-ampliada'), /Esta foto não tem prévia, mas será anexada/); await b.clicar('#cp-foto-fechar');
    await b.clicar('#cp-fotos-todas'); assert.match(await texto('#cp-fotos-contador'), /20 foto/); assert.match(await texto('#cp-fotos-aviso'), /Máximo de 20 fotos/);
    await b.clicar('#cp-fotos-limpar'); assert.match(await texto('#cp-fotos-contador'), /0 foto/);
    assert.equal(await b.avaliar(() => [...document.querySelectorAll('[data-foto]')].every(el => el.classList.contains('ph'))), true);
    await b.clicar('[data-foto="F24-24"]'); await b.clicar('[data-foto="F24-erro"]');
    await b.preencher('#cp-descricao', 'Fotos F24'); await b.clicar('#cp-revisar'); assert.match(await texto('#cp-conteudo'), /2 foto\(s\)/);
    await b.clicar('#cp-voltar'); assert.equal(await b.avaliar(() => document.querySelector('[data-foto="F24-24"]').getAttribute('aria-checked')), 'true');
    await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    assert.deepEqual(await b.avaliar(() => JSON.parse(bancada.chamadas.find(r => r.method === 'POST' && /\/chamados$/.test(r.caminho)).body).anexos.map(a => a.file_ref)), ['F24-24', 'F24-erro']);
    assert.equal(await b.avaliar(() => bancada.getMessages.filter(x => x.limit === 50).length), 1);
  });
  await caso('POST sem resposta confere ausência, preserva fotos e retry cria só um chamado', async () => {
    await novo(); await b.clicar('[data-foto]');  await b.preencher('#cp-descricao', 'Preservar relato');
    await b.avaliar(() => { bancada.semResposta = true; }); await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar');
    await b.esperar(() => document.querySelector('#cp-confirmar')?.textContent === 'Tentar de novo');
    assert.match(await texto('#cp-recado'), /Não consegui falar com o servidor\. O chamado não foi aberto\. Confira sua conexão e tente de novo\./);
    await b.clicar('#cp-voltar'); assert.equal(await b.avaliar(() => document.querySelector('#cp-descricao').value), 'Preservar relato');
    assert.equal(await b.avaliar(() => document.querySelector('[data-foto]').getAttribute('aria-checked')), 'true');
    await b.clicar('#cp-revisar'); await b.clicar('#cp-confirmar'); await b.esperar(() => !!document.querySelector('#cp-sucesso'));
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(r => r.method === 'POST' && /\/chamados$/.test(r.caminho)).length), 1);
    assert.equal(await b.avaliar(() => bancada.chamadas.find(r => r.method === 'POST' && /\/chamados$/.test(r.caminho)).timeout), 30000);
    await novo([{ direction: 'out', text: 'Só assistente', fileRef: 'F24-0', mimetype: 'image/png' }]); await b.clicar('#cp-ultima');
    await b.esperar(() => document.querySelector('#cp-ultima-recado').textContent !== '');
    assert.equal(await texto('#cp-ultima-recado'), 'Nenhuma mensagem do cliente nesta conversa.');
  });
  await caso('editar desabilitado em encerrados, demonstração e sem portal; nenhuma requisição', async () => {
    await abrir();
    await b.avaliar(() => { document.querySelectorAll('[data-os-id]').forEach(c => { c.open = true; }); bancada.chamadas = []; });
    assert.equal(await b.avaliar(() => [...document.querySelectorAll('[data-editar-ajuda]')].some(x => /Reabra o chamado/.test(x.textContent) && x.previousElementSibling.disabled)), true);
    await b.avaliar(() => { GI.modo = 'local'; document.querySelector('[data-filtro="todos"]').click(); });
    assert.equal(await b.avaliar(() => [...document.querySelectorAll('[data-editar-os]')].every(x => x.disabled)), true);
    assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
    await b.navegar(base + '&demonstracao=1'); await b.esperar(() => !!document.querySelector('[data-editar-os]'));
    assert.equal(await b.avaliar(() => document.querySelector('[data-editar-os]').disabled), true);
    assert.match(await texto('[data-editar-ajuda]'), /Demonstração/);
    assert.equal(await b.avaliar(() => bancada.chamadas.length), 0);
  });
  await caso('carregando e salvando bloqueiam botões; submit inalterado não grava; troca de atendimento descarta', async () => {
    await abrir();
    await b.avaliar(() => {
      const obter = GI.chamadosObter;
      GI.chamadosObter = n => new Promise(resolve => { bancada.liberarAbertura = () => obter(n).then(resolve); });
      document.querySelector('[data-editar-os]').click();
    });
    assert.equal(await texto('[data-editar-os]'), 'Carregando…');
    assert.equal(await b.avaliar(() => document.querySelector('[data-editar-os]').getAttribute('aria-busy')), 'true');
    await b.avaliar(() => bancada.liberarAbertura()); await b.esperar(() => !!document.querySelector('#cp-edit-titulo'));
    await b.avaliar(() => document.querySelector('#cp-edit-form').dispatchEvent(new Event('submit', { cancelable: true })));
    assert.equal(await b.avaliar(() => bancada.editPosts.length), 0);
    await b.clicar('#cp-edit-cancelar');
    await abrir(); await editar(); await b.preencher('#cp-edit-titulo', 'Salvando F24');
    await b.avaliar(() => { bancada.atrasarEdicao = true; }); await b.clicar('#cp-edit-salvar');
    await b.esperar(() => !!bancada.liberarEdicao);
    assert.equal(await texto('#cp-edit-salvar'), 'Salvando…');
    assert.equal(await b.avaliar(() => [...document.querySelectorAll('#cp-edit-form button')].every(x => x.disabled)), true);
    await b.avaliar(() => bancada.liberarEdicao()); await b.esperar(() => !document.querySelector('#cp-edit-form'));
    await editar(); await b.preencher('#cp-edit-descricao', 'Descartar ao trocar');
    await b.avaliar(() => omni.chats.select(8802)); await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Dois'));
    assert.equal(await b.avaliar(() => !!document.querySelector('#cp-edit-form')), false);
  });
  await caso('teclado, limite individual, releitura preserva seleção e fila de prévias no máximo quatro', async () => {
    await abrir();
    await b.avaliar(() => {
      bancada.msgs = Array.from({ length: 25 }, (_, i) => ({ fileRef: 'F24-' + i, fileName: 'Sintética ' + i, mimetype: 'image/png' }));
      const get = omni.chats.getFile; bancada.ativos = 0; bancada.pico = 0; bancada.liberarFotos = [];
      omni.chats.getFile = async ref => {
        bancada.ativos++; bancada.pico = Math.max(bancada.pico, bancada.ativos);
        await new Promise(r => bancada.liberarFotos.push(r));
        try { return await get(ref); } finally { bancada.ativos--; }
      };
    });
    await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => bancada.ativos === 4);
    assert.equal(await b.avaliar(() => !!document.querySelector('.gi-cp-esqueleto')), true);
    for (let i = 0; i < 3; i++) { await b.avaliar(() => bancada.liberarFotos.splice(0).forEach(r => r())); await new Promise(r => setTimeout(r, 20)); }
    assert.equal(await b.avaliar(() => bancada.pico), 4);
    await b.avaliar(() => document.querySelector('[data-foto]').focus());
    await b.tecla('Space'); assert.equal(await b.avaliar(() => document.activeElement.getAttribute('aria-checked')), 'true');
    await b.tecla('Enter'); assert.equal(await b.avaliar(() => document.activeElement.getAttribute('aria-checked')), 'false');
    await b.tecla('Tab'); assert.equal(await b.avaliar(() => document.activeElement.getAttribute('aria-label')), 'Ampliar foto');
    await b.clicar('#cp-fotos-todas'); await b.clicar('#cp-fotos-mais'); await b.clicar('#cp-fotos-todas');
    await b.clicar('[data-foto="F24-21"]'); assert.equal(await b.avaliar(() => document.querySelector('[data-foto="F24-21"]').getAttribute('aria-checked')), 'false');
    assert.match(await texto('#cp-fotos-aviso'), /Máximo de 20 fotos/);
    await b.clicar('#cp-fotos-limpar'); await b.clicar('[data-foto="F24-0"]'); await b.preencher('#cp-descricao', 'Releitura F24');
    await b.clicar('#cp-atualizar'); await b.esperar(() => !!document.querySelector('#cp-form') && document.querySelector('#cp-descricao').value === 'Releitura F24');
    assert.equal(await b.avaliar(() => document.querySelector('[data-foto="F24-0"]').getAttribute('aria-checked')), 'true');
    assert.equal(await b.avaliar(() => bancada.getMessages.filter(x => x.limit === 50).length), 1);
  });
  await caso('Continuar editando ao tentar trocar aba preserva contexto e futura releitura', async () => {
    await abrir(); await editar(); await b.preencher('#cp-edit-titulo', 'Rascunho da aba F24');
    await b.clicar('#cp-tab-novo'); await b.clicar('#cp-edit-continuar');
    await b.clicar('#cp-edit-cancelar'); await b.clicar('#cp-edit-descartar-sim');
    await b.avaliar(async () => {
      const card = document.querySelector('[data-os-id]'); bancada.alvo = card.dataset.osId;
      await fetch('/api/ext/chamados/' + bancada.alvo, { method: 'POST', headers: { Authorization: 'Bearer bancada-sintetica', 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Externa depois da aba F24' }) });
      bancada.chamadas = []; await omni.storage.set(GI.CHAVE_ESCRITA, { em: Date.now() + 1, por: 'externa-aba' });
      document.activeElement.blur(); window.dispatchEvent(new Event('focus'));
    });
    await b.esperar(() => bancada.chamadas.length === 2);
    await new Promise(r => setTimeout(r, 100));
    assert.match(await texto('[data-os-id] > summary'), /Externa depois da aba F24/);
  });
  await caso('atualizar durante leitura de fotos aproveita a mesma consulta e recebe o resultado', async () => {
    await abrir(); await b.avaliar(() => {
      const get = omni.chats.getMessages;
      bancada.msgs = [{ fileRef: 'F24-pendente', fileName: 'Pendente.png', mimetype: 'image/png' }];
      omni.chats.getMessages = async (n, opts) => { await new Promise(r => { bancada.liberarMensagens = r; }); return get(n, opts); };
    });
    await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => !!bancada.liberarMensagens); await b.preencher('#cp-descricao', 'Aguardar fotos F24');
    await b.clicar('#cp-atualizar'); await b.esperar(() => document.querySelector('#cp-descricao')?.value === 'Aguardar fotos F24');
    await b.avaliar(() => bancada.liberarMensagens()); await new Promise(r => setTimeout(r, 100));
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-foto="F24-pendente"]')), true, 'resultado pendente precisa chegar ao formulário depois da releitura');
    assert.equal(await b.avaliar(() => bancada.getMessages.length), 1);
  });
  await caso('vazio e falha de mensagens são legíveis', async () => {
    await abrir(); await b.avaliar(() => { bancada.msgs = []; }); await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => document.querySelector('#cp-fotos').textContent.includes('Nenhuma foto'));
    assert.equal(await texto('#cp-fotos'), 'Nenhuma foto nesta conversa. Anexe depois, na gestão.');
    await abrir(); await b.avaliar(() => { omni.chats.getMessages = () => Promise.reject(new Error('Falha sintética')); }); await b.clicar('#cp-tab-novo');
    if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
    await b.esperar(() => document.querySelector('#cp-fotos').textContent.includes('Fotos indisponíveis'));
    assert.equal(await texto('#cp-fotos'), 'Fotos indisponíveis. Atualize o painel para tentar novamente.');
  });
  await caso('capturas 260/300/334 px em claro/escuro: botão, formulário, erro e fotos', async () => {
    async function capturar(nome) {
      assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true, nome + ': sem rolagem horizontal');
      const altura = await b.avaliar(() => { scrollTo(0, 0); return Math.max(600, Math.ceil(document.querySelector('#gi-cockpit').getBoundingClientRect().height) + 100); });
      const largura = await b.avaliar(() => innerWidth); await b.viewport(largura, altura); await b.captura('f24-' + nome);
    }
    for (const tema of ['claro', 'escuro']) for (const largura of [260, 300, 334]) {
      await b.viewport(largura, 900); await abrir('&tema=' + tema); await capturar(largura + '-' + tema + '-botao');
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir')), false);
      await b.clicar('#cp-tab-imovel'); await capturar(largura + '-' + tema + '-imovel');
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-abrir-imovel')), false);
      await b.clicar('#cp-tab-chamados');
      await editar(); await capturar(largura + '-' + tema + '-formulario');
      await b.preencher('#cp-edit-titulo', 'Erro sintético F24'); await b.avaliar(() => { bancada.erroEditar = 'rede'; }); await b.clicar('#cp-edit-salvar');
      await b.esperar(() => !document.querySelector('#cp-edit-erro').hidden); await capturar(largura + '-' + tema + '-erro');
      await b.clicar('#cp-edit-cancelar'); await b.clicar('#cp-edit-descartar-sim');
      await b.avaliar(() => { bancada.msgs = [{ fileRef: 'F24-0', mimetype: 'image/png', fileName: '<img src=x onerror=window.__xss=1>.png' }, { fileRef: 'F24-erro', mimetype: 'image/png', fileName: 'Automação.png' }]; });
      await b.clicar('#cp-tab-novo'); if (await b.avaliar(() => !!document.querySelector('#cp-novo-imovel'))) await b.preencher('#cp-novo-imovel', await b.avaliar(() => document.querySelector('#cp-novo-imovel').options[1].value));
      await b.esperar(() => !!document.querySelector('[data-foto] img')?.naturalWidth && document.querySelector('[data-foto="F24-erro"]').textContent.includes('Prévia indisponível'));
      await b.clicar('[data-foto]'); await capturar(largura + '-' + tema + '-fotos'); assert.equal(await b.avaliar(() => window.__xss), undefined);
    }
  });
  if (falhas.length) throw new AggregateError(falhas, 'Regressões F24: ' + falhas.length);
  assert.deepEqual(b.erros, []);
  process.stdout.write('F24: todas as provas passaram.\n');
} finally { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); }
