import { criarServidor } from '../bancada/servidor.mjs';
import { criarFixturePortal } from './portal.mjs';
import { fixture } from './fixture-desenho.mjs';
import { abrirAmbiente } from './ambiente.mjs';
export async function abrirExtensao(q, tamanho) {
  if (q !== 'imoveis') throw new Error('Quadro inativo: ' + q);
  const servidor = criarServidor({ fixture: criarFixturePortal() });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  let b;
  const fechar = async () => { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); };
  try {
    const dados = structuredClone(fixture); dados.usuarios[0].type = 0;
    b = await abrirAmbiente(dados);
    await b.viewport(tamanho.largura, tamanho.altura);
    await b.navegar('http://127.0.0.1:' + servidor.address().port + '/app/imoveis.html?fixture=desenho');
    await b.esperar(() => !!document.querySelector('#gi-corpo tr td') && !/carregando|buscando/.test(document.querySelector('#gi-corpo').textContent));
    return { b, fechar, q, seletor: 'body' };
  } catch (err) { await fechar(); throw err; }
}
