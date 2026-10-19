import path from 'node:path';
import { criarServidor } from '../bancada/servidor.mjs';
import { criarFixturePortal } from './portal.mjs';
import { fixture, formulario, locacoes } from './fixture-desenho.mjs';
import { abrirAmbiente, capturar, SAIDA } from './ambiente.mjs';

export const seletorExtensao = q => ['novo','modal','marcar'].includes(q) ? '.gi-modal' : q.startsWith('cockpit-') ? '#gi-cockpit' : 'body';
export async function abrirExtensao(q, tamanho) {
  const portal = criarFixturePortal(), servidor = criarServidor({ fixture: portal });
  await new Promise(r => servidor.listen(0,'127.0.0.1',r));
  let b;
  const fechar = async () => { if (b) await b.fechar(); servidor.closeAllConnections(); await new Promise(r=>servidor.close(r)); };
  try {
    b = await abrirAmbiente(fixture);
    // Não altera CSS nem DOM da aplicação: só o tamanho do iframe na bancada.
    await b.viewport(q.startsWith('cockpit-') ? 317 : ['novo','modal','marcar'].includes(q) ? 1360 : tamanho.largura, ['novo','modal','marcar'].includes(q) ? 1100 : tamanho.altura);
    const pagina = q.startsWith('cockpit-') ? 'painel' : ['lista','novo','modal'].includes(q) ? 'chamados' : q === 'locados' ? 'locados' : 'imoveis';
    const base = 'http://127.0.0.1:' + servidor.address().port;
    await b.navegar(base + '/app/' + pagina + '.html?fixture=desenho&escrita=1');
    await b.esperar(() => window.GI?.modo === 'portal');
    const motivos = [];
    if (q.startsWith('cockpit-')) {
      await b.esperar(() => document.querySelector('#cp-nome')?.textContent === 'Carla Menezes' && !!document.querySelector('[data-chamado]'));
      if (q === 'cockpit-chamados') {
        // A 0.24.0 inicia em Abertos. O desenho também mostra um concluído.
        await b.clicar('[data-filtro="todos"]');
        await b.esperar(() => document.querySelectorAll('[data-chamado]').length === 3);
        await b.avaliar(() => document.querySelectorAll('[data-os-id]').forEach(c => { c.open = c.dataset.osId === '1042'; }));
        motivos.push('0.24.0 não oferece Próximo passo; edição rápida e Dados da O.S. diferem da leitura expandida do desenho.');
      } else {
        await b.clicar('#cp-tab-novo'); await b.esperar(() => !!document.querySelector('#cp-titulo'));
        await b.clicar('[data-categoria="eletrica"]'); await b.clicar('[data-prioridade="normal"]');
        await b.preencher('#cp-titulo',formulario.descricao);
        await b.preencher('#cp-descricao',formulario.descricao);
        await b.avaliar(() => { document.querySelector('#cp-mais-detalhes').open = true; });
        await b.preencher('#cp-disponibilidade',formulario.disponibilidade);
        if (q === 'cockpit-confirma') {
          await b.clicar('#cp-revisar'); await b.esperar(() => !!document.querySelector('#cp-confirmar'));
          motivos.push('Confirmação e sucesso são estados sucessivos na 0.24.0; o desenho mostra ambos simultaneamente. Sucesso guardado em captura suplementar.');
        } else motivos.push('Título é obrigatório na 0.24.0; o desenho tem apenas descrição. Preenchido com a própria descrição.');
      }
    } else if (['lista','novo','modal'].includes(q)) {
      await b.esperar(() => document.querySelectorAll('#gi-corpo [data-editar]').length === 12);
      if (q === 'modal') {
        await b.clicar('[data-editar="1042"]');
        await b.esperar(() => !!document.querySelector('#c-titulo'));
        await b.esperar(() => document.querySelector('#c-orcamentos')?.textContent.includes('Hidro Sul'));
      }
      if (q === 'novo') {
        await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#c-cliente'));
        await b.preencher('#c-cliente','Carla'); await b.esperar(() => !!document.querySelector('[data-contato]'));
        await b.clicar('[data-contato="0"]'); await b.esperar(() => !document.querySelector('#c-locacao').disabled);
        await b.preencher('#c-locacao',await b.avaliar(() => [...document.querySelector('#c-locacao').options].find(o=>o.textContent.includes('Ed. Jasmim')&&o.textContent.includes('304')).value));
        await b.preencher('#c-titulo',formulario.descricao); await b.preencher('#c-descricao',formulario.descricao);
        await b.preencher('#c-prioridade',formulario.prioridade);
        await b.esperar(() => !!document.querySelector('[data-atendimento]'));
        // O único atendimento aberto do fixture é 2660; a 0.24.0 não mostra o ID na opção.
        await b.avaliar(() => {
          const el = [...document.querySelectorAll('[data-atendimento]')].find(el=>el.querySelector('.gi-chip')?.textContent === 'Aberto');
          if (!el) throw new Error('Atendimento aberto do desenho ausente'); el.click();
        });
        await b.esperar(() => document.querySelector('#c-vinculo')?.textContent.includes('#2660') && !document.querySelector('#c-categoria').disabled);
        if (await b.avaliar(()=>!!document.querySelector('#c-categoria'))) await b.preencher('#c-categoria','eletrica');
        if (await b.avaliar(()=>!!document.querySelector('#c-disponibilidade'))) await b.preencher('#c-disponibilidade',formulario.disponibilidade);
        motivos.push('Título obrigatório na 0.24.0; preenchido com a descrição do desenho.');
      }
    } else {
      await b.esperar(() => !!document.querySelector('#gi-corpo tr td') && !/carregando|buscando/.test(document.querySelector('#gi-corpo').textContent));
      if (q === 'marcar') {
        // 0412 já consta como locado: a ação real abre Editar. Para mostrar o formulário
        // de criação no estado anterior à locação, usa-se a mesma API pública do botão.
        await b.avaliar(p => { window.fidelidadeModal = GI.modalLocacao({ imovel: p }); }, fixture.produtos.find(p=>p.internalcode==='5350412'));
        await b.esperar(() => !!document.querySelector('#l-locatario'));
        await b.preencher('#l-locatario','Carla');
        await b.esperar(() => !!document.querySelector('#l-contatos button'));
        await b.clicar('#l-contatos button');
        const l=locacoes.find(l=>l.id===4);
        for (const [id,v] of Object.entries({proprietario:l.contatos[1].nome,contrato:l.contrato_numero,garantia:l.garantia,inicio:l.inicio,fim:l.fim,aluguel:'1850,00',vencimento:'10'})) {
          if (await b.avaliar(s=>!!document.querySelector(s),'#l-'+id)) await b.preencher('#l-'+id,v);
        }
        motivos.push('0412 já locado no quadro Imóveis: ação da linha abre Editar. Modal de criação aberto pela API pública GI.modalLocacao, sem gravar.');
      }
    }
    return { b, fechar, q, seletor: seletorExtensao(q), alcancavel: motivos.length===0, motivos, portal };
  } catch (e) { await fechar(); throw new Error(q + ': ' + e.message, { cause:e }); }
}
export async function capturarExtensao(sessao, pasta='extensao') {
  return capturar(sessao.b,sessao.seletor,path.join(SAIDA,pasta,sessao.q+'.png'));
}
export async function capturarSucesso(sessao) {
  if (sessao.q!=='cockpit-confirma') return;
  await sessao.b.clicar('#cp-confirmar');
  await sessao.b.esperar(()=>!!document.querySelector('#cp-sucesso'));
  const texto=await sessao.b.avaliar(()=>document.querySelector('#cp-sucesso').textContent);
  if (!texto.includes('OS-1052')) throw new Error('Sucesso sem protocolo esperado: '+texto);
  return capturar(sessao.b,sessao.seletor,path.join(SAIDA,'extensao','cockpit-sucesso.png'));
}
