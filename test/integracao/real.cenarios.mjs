import assert from 'node:assert/strict';
export async function testarReal(b, origem, real) {
  const sql = async (s, p = []) => (await real.pg.query(s, p)).rows;
  const navegar = async tela => { await b.navegar(origem + '/app/' + tela + '.html?perfil=admin'); await b.esperar(() => !!window.GI && GI.modo === 'portal'); };
  async function cenario(nome, fn) { await fn(); assert.deepEqual(b.erros, []); }
    await cenario('a situação editável e persistente', async () => {
      await navegar('imoveis');
      await b.esperar(() => !!document.querySelector('[data-situacao="DEMO-001"]'));
      assert.equal(await b.avaliar(() => document.querySelector('[data-situacao="DEMO-001"]').value), 'disponivel');
      await b.preencher('[data-situacao="DEMO-001"]', 'reservado');
      await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
      const salvo = (await sql("SELECT * FROM imoveis_situacao WHERE codigo='DEMO-001'"))[0];
      assert.equal(salvo.situacao, 'reservado'); assert.equal(salvo.autor, 'Agente Demonstração');
      await navegar('imoveis');
      await b.esperar(() => document.querySelector('[data-situacao="DEMO-001"]')?.value === 'reservado');
      await b.preencher('[data-situacao="DEMO-001"]', 'disponivel');
      await b.esperar(() => !document.querySelector('[data-situacao="DEMO-001"]').disabled);
      await b.captura('integracao-a-situacao');
    });
}
