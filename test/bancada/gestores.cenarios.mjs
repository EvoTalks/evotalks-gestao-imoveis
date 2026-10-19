import assert from 'node:assert/strict';

export async function testarGestores(b, origem) {
  for (const [usuario, perfil, permitido] of [[531, 'agente', true], [600, 'agente', false], [600, 'supervisor', false], [600, 'admin', true]]) {
    const query = '?usuario=' + usuario + '&perfil=' + perfil;
    await b.navegar(origem + '/app/imoveis.html' + query);
    await b.esperar(() => document.querySelector('#gi-corpo')?.textContent.includes('Apartamento Demonstração Alfa'));
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-locacao]')), permitido, 'botão de locação: ' + query);
    assert.equal(await b.avaliar(() => !!document.querySelector('[aria-label="Marcar como locado"]')), permitido);
    for (const [id, pagina] of [['gi-locados', 'locados'], ['gi-chamados', 'chamados'], ['gi-prestadores', 'prestadores']]) {
      assert.equal(await b.avaliar(id => !!document.querySelector('.gi-nav [data-tela="' + id + '"]'), id), permitido);
      if (permitido) {
        await b.avaliar(id => GI.abrirTela(id), id);
        await b.esperar(pagina => location.pathname === '/app/' + pagina + '.html' && !!document.querySelector('.gi-nav'), pagina);
      } else {
        await b.avaliar(id => GI.abrirTela(id), id);
        assert.equal(await b.avaliar(() => location.pathname), '/app/imoveis.html');
        assert.match(await b.avaliar(() => document.body.textContent), /Esta tela é exclusiva do administrador\./);
      }
    }
    if (permitido) {
      await b.navegar(origem + '/app/imoveis.html' + query);
      await b.esperar(() => !!document.querySelector('[data-locacao="DEMO-001"]'));
      await b.clicar('[data-locacao="DEMO-001"]');
      await b.esperar(() => !!document.querySelector('#l-locatario'));
      await b.clicar('.gi-modal [data-cancelar]');
    }
    await b.navegar(origem + '/app/painel.html' + query);
    await b.esperar(() => !!document.querySelector('[data-chamado]'));
    assert.equal(await b.avaliar(() => !!document.querySelector('[data-gestao]')), permitido);
    assert.equal(await b.avaliar(() => !!document.querySelector('#cp-lista-completa')), permitido);
    if (permitido) {
      await b.clicar('#cp-lista-completa');
      await b.esperar(() => location.pathname === '/app/chamados.html');
    }
  }
  process.stdout.write('OK gestão temporária: 531, 600, supervisor e administrador; navegação, telas, modal e cockpit\n');
}
