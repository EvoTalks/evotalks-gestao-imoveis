/* Somente imagens sintéticas, criadas no canvas e escolhidas pelo input nativo via CDP. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export async function testarFotos(b, origem) {
  const pasta = mkdtempSync(path.join(fileURLToPath(new URL('./', import.meta.url)), '.fotos-'));
  const prova = s => process.stdout.write('OK fotos: ' + s + '\n');
  const contar = () => b.avaliar(() => bancada.chamadas.filter(c => c.method === 'POST' && c.caminho === '/api/ext/chamados').length);
  const pendentes = n => b.esperar(n => document.querySelectorAll('#c-pendentes .gi-foto').length === n, n);
  const modal = () => b.esperar(() => !!document.querySelector('#c-pasta'));
  const fechar = () => b.clicar('.gi-modal [data-cancelar]');
  try {
    await b.navegar(origem + '/app/chamados.html');
    await b.esperar(() => !!document.querySelector('[data-editar]'));
    await b.clicar('#b-novo');
    assert.equal(await b.avaliar(() => document.querySelector('#c-buscar-pasta')?.textContent), 'Buscar na pasta');
    await modal();
    assert.deepEqual(await b.avaliar(() => {
      const input = document.querySelector('#c-pasta');
      return [input.type, input.accept, input.multiple, input.hidden];
    }), ['file', 'image/jpeg,image/png,image/webp,image/gif', true, true]);
    const imagens = await b.avaliar(() => ['image/png', 'image/jpeg', 'image/png'].map((tipo, i) => {
      const c = document.createElement('canvas'); c.width = i === 0 ? 2000 : 16; c.height = i === 0 ? 1000 : 12;
      const x = c.getContext('2d'); if (i > 0) { x.fillStyle = i === 1 ? 'red' : 'blue'; x.fillRect(0,0,c.width,c.height); }
      return c.toDataURL(tipo).split(',')[1];
    }));
    const nomes = ['sintetica.png', 'sintetica.jpg', 'outra.png'];
    nomes.forEach((nome, i) => writeFileSync(path.join(pasta, nome), Buffer.from(imagens[i], 'base64')));
    writeFileSync(path.join(pasta, 'disfarcada.png'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(path.join(pasta, 'gigante.png'), Buffer.alloc(25 * 1024 * 1024 + 1));
    const hostil = '<img src=x onerror=window.hostilFoto=1>.png';
    writeFileSync(path.join(pasta, hostil), Buffer.from(imagens[2], 'base64'));
    await b.arquivos('#c-pasta', ['sintetica.png', 'sintetica.jpg', 'disfarcada.png', 'gigante.png'].map(n => path.join(pasta, n)));
    await pendentes(2);
    await b.esperar(() => document.querySelector('#c-fotos-erros').textContent.includes('gigante.png'));
    assert.match(await b.avaliar(() => document.querySelector('#c-fotos-erros').textContent), /disfarcada.png[\s\S]*conteúdo[\s\S]*gigante.png[\s\S]*25 MB/);
    await b.avaliar(() => document.querySelector('#c-fotos-erros').scrollIntoView({ block: 'center' }));
    await b.captura('fotos-05-recusas');
    await b.avaliar(async () => {
      const img = document.querySelector('#c-pendentes img'); await img.decode();
      if (img.naturalWidth !== 1600 || img.naturalHeight !== 800) throw Error('Redução fora do contrato.');
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1, 1);
      if (Array.from(x.getImageData(0,0,1,1).data).some(v => v !== 255)) throw Error('Transparência não ficou branca.');
    });
    await b.arquivos('#c-pasta', [path.join(pasta, hostil)]); await pendentes(3);
    assert.ok((await b.avaliar(() => document.querySelector('#c-pendentes').textContent)).includes(hostil));
    assert.equal(await b.avaliar(() => !!window.hostilFoto || !!document.querySelector('#c-pendentes [onerror]')), false);
    await b.clicar('#c-pendentes .gi-foto:last-child button'); await pendentes(2);
    await b.avaliar(() => document.querySelector('#c-pendentes').scrollIntoView({ block: 'center' }));
    await b.captura('fotos-00-novo-390-claro');
    prova('PNG e JPEG, redução real 1600 px, fundo branco, SVG disfarçado, gigante, nome hostil e remoção');

    await b.preencher('#c-cliente', 'Demonstração Um');
    await b.esperar(() => !!document.querySelector('[data-contato="0"]')); await b.clicar('[data-contato="0"]');
    await b.esperar(() => document.querySelector('#c-locacao').options.length >= 2 && document.querySelectorAll('#c-atendimentos input').length >= 4);
    await b.preencher('#c-locacao', '0'); await b.preencher('#c-titulo', 'Fotos sintéticas F5');
    await b.clicar('#c-atendimentos input[value="0"]'); await b.clicar('#c-carregar-fotos');
    await b.esperar(() => !!document.querySelector('[data-foto]')); await b.clicar('[data-foto]');
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes .gi-foto').length), 2);
    const antes = await contar();
    await b.avaliar(() => {
      const original = omni.http.request; let ativos = 0;
      bancada.uploadsAtivosMax = 0; bancada.falharProximoUpload = true;
      omni.http.request = async op => {
        if (!op.url.endsWith('/anexos/upload')) return original(op);
        ativos++; bancada.uploadsAtivosMax = Math.max(ativos, bancada.uploadsAtivosMax);
        await new Promise(r => setTimeout(r, 150));
        try {
          if (bancada.falharProximoUpload) { bancada.falharProximoUpload = false; return { status: 500, body: '{"erro":"falha_sintetica"}' }; }
          return await original(op);
        } finally { ativos--; }
      };
    });
    await b.clicar('.gi-modal [data-ok]');
    assert.equal(await contar(), antes);
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Enviando foto'));
    assert.equal(await b.avaliar(() => Array.from(document.querySelectorAll('.gi-modal button')).every(b => b.disabled)), true);
    await b.avaliar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await b.esperar(() => document.querySelector('.gi-modal h2')?.textContent.startsWith('Editar chamado'));
    await pendentes(1);
    await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('1 de 2 fotos enviadas'));
    const id = await b.avaliar(() => JSON.parse(bancada.chamadas.find(c => c.caminho === '/api/ext/chamados' && c.body.includes('Fotos sintéticas F5')).body));
    assert.equal(id.anexos.length, 1); assert.equal(await contar(), antes + 1);
    assert.equal(await b.avaliar(() => bancada.uploadsAtivosMax), 1);
    await b.captura('fotos-01-parcial-retomada');
    const salvoId = await b.avaliar(async () => (await GI.chamados({ busca: 'Fotos sintéticas F5' })).rows[0].id);
    await b.preencher('#c-status', 'triagem'); await b.clicar('#c-mudar-status');
    assert.match(await b.avaliar(() => document.querySelector('#c-mensagem').textContent), /fotos pendentes/);
    assert.equal(await b.avaliar(() => document.querySelector('#c-confirmacao').hidden), true);
    await pendentes(1);
    await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    assert.equal(await contar(), antes + 1);
    let d = await b.avaliar(async n => GI.chamadosObter(n), salvoId);
    assert.equal(d.anexos.length, 3); assert.equal(d.anexos.filter(a => a.origem === 'upload').length, 2);
    prova('chat + pasta coexistem; upload sequencial, bloqueio de clique/Escape e falha 500 retomada em edição sem duplicar chamado');

    await b.clicar('[data-editar="' + salvoId + '"]'); await modal();
    await b.esperar(() => document.querySelectorAll('#c-fotos img').length === 2);
    await b.arquivos('#c-pasta', [path.join(pasta, 'outra.png')]); await pendentes(1);
    await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    d = await b.avaliar(async n => GI.chamadosObter(n), salvoId); assert.equal(d.chamado.anexos_total, 4);
    await b.navegar(origem + '/app/chamados.html?tema=escuro'); await b.viewport(390,844);
    await b.esperar(n => !!document.querySelector('[data-editar="' + n + '"]'), salvoId);
    await b.clicar('[data-editar="' + salvoId + '"]'); await modal();
    await b.esperar(() => document.querySelectorAll('#c-fotos img').length === 3);
    await b.arquivos('#c-pasta', [path.join(pasta, hostil)]); await pendentes(1);
    await b.avaliar(() => document.querySelector('#c-pendentes').scrollIntoView({ block: 'center' }));
    await b.captura('fotos-02-editar-390-escuro');
    assert.equal(await b.avaliar(() => { const m = document.querySelector('.gi-modal'); return m.scrollWidth <= m.clientWidth + 1; }), true);
    // O formulário retomado também protege pendentes ao mudar de status.
    await b.preencher('#c-status', 'triagem'); await b.clicar('#c-mudar-status');
    assert.match(await b.avaliar(() => document.querySelector('#c-mensagem').textContent), /fotos pendentes/);
    assert.equal(await b.avaliar(() => document.querySelector('#c-confirmacao').hidden), true);
    const uploadsAntes = await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length);
    await b.avaliar(() => {
      bancada.instanteCota = 0;
      GI.cotaPortal = GI.criarCotaPortal(() => bancada.instanteCota);
      for (let i = 0; i < 29; i++) GI.cotaPortal.reservar();
    });
    await b.clicar('.gi-modal [data-ok]');
    await b.esperar(() => document.querySelector('#c-mensagem').textContent.includes('Aguarde um minuto'));
    await pendentes(1);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length), uploadsAntes);
    await b.captura('fotos-04-cota-pendentes');
    await b.avaliar(() => { bancada.instanteCota = 60000; });
    await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal'));
    d = await b.avaliar(async n => GI.chamadosObter(n), salvoId);
    // O nome hostil tem os mesmos bytes da terceira foto: o portal deduplica.
    assert.equal(d.chamado.anexos_total, 4);
    prova('cota bloqueia o upload antes da rede, mantém pendentes e libera repetição idempotente após 60s; status preserva fotos');
    prova('editar acrescenta foto, recupera bytes do portal e exibe prévias em 390 px e tema escuro');

    await b.navegar(origem + '/app/chamados.html'); await b.esperar(() => !document.querySelector('#b-novo').disabled);
    await b.clicar('#b-novo'); await modal();
    const dez = Array(10).fill(path.join(pasta, 'sintetica.jpg'));
    await b.arquivos('#c-pasta', dez); await pendentes(10);
    await b.arquivos('#c-pasta', dez); await pendentes(20);
    await b.arquivos('#c-pasta', [path.join(pasta, 'outra.png')]);
    await b.esperar(() => document.querySelector('#c-fotos-erros').textContent.includes('20'));
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes .gi-foto').length), 20);
    await fechar();
    await b.clicar('#b-novo'); await modal(); await b.arquivos('#c-pasta', Array(11).fill(path.join(pasta, 'sintetica.jpg')));
    await b.esperar(() => document.querySelector('#c-fotos-erros').textContent.includes('10 por seleção'));
    assert.equal(await b.avaliar(() => document.querySelectorAll('#c-pendentes .gi-foto').length), 0);
    await b.avaliar(() => { GI.modo = 'local'; });
    await b.clicar('#c-buscar-pasta');
    assert.equal(await b.avaliar(() => document.querySelector('#c-buscar-pasta').disabled), true);
    assert.match(await b.avaliar(() => document.querySelector('#c-fotos-erros').textContent), /portal conectado/);
    assert.equal(await b.avaliar(() => bancada.chamadas.filter(c => c.caminho.endsWith('/anexos/upload')).length), 0);
    await b.captura('fotos-03-sem-portal'); await fechar();
    prova('limites 10 por seleção e 20 pendentes, sem perda silenciosa; sem portal botão bloqueado e zero uploads');
    assert.deepEqual(b.erros, []);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
}
