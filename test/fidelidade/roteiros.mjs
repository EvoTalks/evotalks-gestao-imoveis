/* O desenho recorta modais de 900 px, inteiros, sem rolagem interna.
 * O viewport dá 32 px para as margens do diálogo e altura > recorte / 0,7
 * (max-height:70vh do host). Nenhum estilo/comportamento real é alterado.
 * Cockpit: 315 px = telefone de 317 px menos as duas bordas do host. */
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
    const dadosHost = structuredClone(fixture);
    // Chave de locação é ação administrativa; o desenho a mostra habilitada.
    // Só estes recortes usam o perfil admin, sem mudar permissões da aplicação.
    if (['imoveis', 'marcar'].includes(q)) dadosHost.usuarios[0].type = 0;
    b = await abrirAmbiente(dadosHost);
    // Não altera CSS nem DOM da aplicação: só o tamanho do iframe na bancada.
    await b.viewport(q.startsWith('cockpit-') ? 315 : ['novo','modal','marcar'].includes(q) ? tamanho.largura + 32 : tamanho.largura, ['novo','modal','marcar'].includes(q) ? Math.ceil(tamanho.altura / .7) + 1500 : tamanho.altura);
    const pagina = q.startsWith('cockpit-') ? 'painel' : ['lista','novo','modal'].includes(q) ? 'chamados' : q === 'locados' ? 'locados' : 'imoveis';
    const base = 'http://127.0.0.1:' + servidor.address().port;
    await b.navegar(base + '/app/' + pagina + '.html?fixture=desenho&escrita=1');
    await b.esperar(() => window.GI?.modo === 'portal');
    // O stub recebe só os dados lidos do desenho, sem modificar DOM/CSS do app.
    await b.avaliar(() => {
      omni.chats.getMessages = (id, op) => Promise.resolve((fixtureDesenho.mensagens[id] || []).slice(0, op?.limit || 50));
      bancada.historico = bancada.historico.filter(h => [2660,2641,2121].includes(h.id)).map(h => ({...h, uname: h.id===2121?'Tiago':'Marina'}));
    });
    const motivos = [];
    if (q.startsWith('cockpit-')) {
      await b.esperar(() => document.querySelector('#cp-nome')?.textContent === 'Carla Menezes' && !!document.querySelector('[data-chamado]'));
      if (q === 'cockpit-chamados') {
        // A 0.24.0 inicia em Abertos. O desenho também mostra um concluído.
        await b.clicar('[data-filtro="todos"]');
        await b.esperar(() => document.querySelectorAll('[data-chamado]').length === 3);
        await b.avaliar(() => document.querySelectorAll('[data-os-id]').forEach(c => { c.open = c.dataset.osId === '1042'; }));
        motivos.push('Portal sem gênero; pessoa escolhida só na extensão por atendimento; Editar e Mais ações preservados.');
      } else {
        await b.clicar('#cp-tab-novo'); await b.esperar(() => !!document.querySelector('#cp-descricao'));
        await b.clicar('[data-categoria="eletrica"]'); await b.clicar('[data-prioridade="normal"]');
        await b.preencher('#cp-descricao',formulario.descricao);
        await b.preencher('#cp-disponibilidade',formulario.disponibilidade);
        if (q === 'cockpit-confirma' || q === 'cockpit-sucesso') {
          await b.clicar('#cp-revisar'); await b.esperar(() => !!document.querySelector('#cp-confirmar'));
          await b.esperar(() => document.querySelector('#cp-prazo')?.hidden === false);
          motivos.push('Confirmação e sucesso são estados sucessivos, em recortes separados; gênero do contato não consta do portal.');
          // O desenho é o estado com protocolo copiado. O host de mentira aceita
          // a operação e guarda o texto, sem acessar a área de transferência real.
          await b.avaliar(() => { document.execCommand = acao => { if(acao!=='copy') return false; bancada.protocoloCopiado = document.activeElement.value; return true; }; });
          if(q==='cockpit-sucesso'){await b.clicar('#cp-confirmar');await b.esperar(()=>!!document.querySelector('#cp-sucesso'));}
        } else motivos.push('Rótulo e ação Usar última mensagem do cliente preservados; portal não informa gênero.');
      }
    } else if (['lista','novo','modal'].includes(q)) {
      await b.esperar(() => document.querySelectorAll('#gi-corpo [data-editar]').length === 12);
      if (q === 'modal') {
        await b.clicar('[data-editar="1042"]');
        await b.esperar(() => !!document.querySelector('#c-titulo'));
        await b.esperar(() => document.querySelector('#c-orcamentos')?.textContent.includes('Hidro Sul'));
        await b.esperar(() => document.querySelector('#c-conversa .gi-atend__txt'));
      }
      if (q === 'novo') {
        await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#c-cliente'));
        await b.preencher('#c-cliente','Carla'); await b.esperar(() => !!document.querySelector('[data-contato]'));
        await b.clicar('[data-contato="0"]'); await b.esperar(() => !document.querySelector('#c-locacao').disabled);
        await b.preencher('#c-locacao',await b.avaliar(() => [...document.querySelector('#c-locacao').options].find(o=>o.textContent.includes('Ed. Jasmim')&&o.textContent.includes('304')).value));
        await b.preencher('#c-descricao',formulario.descricao);
        await b.preencher('#c-prioridade',formulario.prioridade);
        await b.esperar(() => !!document.querySelector('[data-atendimento]'));
        // O único atendimento aberto do fixture é 2660; a 0.24.0 não mostra o ID na opção.
        await b.avaliar(() => {
          const el = [...document.querySelectorAll('[data-atendimento]')].find(el=>el.textContent.includes('#2660'));
          if (!el) throw new Error('Atendimento aberto do desenho ausente'); el.click();
        });
        await b.esperar(() => document.querySelector('#c-vinculo')?.textContent.includes('#2660') && !document.querySelector('#c-categoria').disabled);
        if (await b.avaliar(()=>!!document.querySelector('#c-categoria'))) await b.preencher('#c-categoria','eletrica');
        if (await b.avaliar(()=>!!document.querySelector('#c-disponibilidade'))) await b.preencher('#c-disponibilidade',formulario.disponibilidade);
        await b.esperar(() => document.querySelectorAll('#c-atendimentos .gi-atend__txt').length === 3 && document.querySelector('#c-resumo-fotos').textContent.includes('Nenhuma foto'));
        motivos.push('Sem gênero no portal; título derivado da descrição e portal aceita somente fotos. Histórico Novo restrito aos três do desenho; #2561 permanece na lista de chamados.');
      }
    } else {
      await b.esperar(() => !!document.querySelector('#gi-corpo tr td') && !/carregando|buscando/.test(document.querySelector('#gi-corpo').textContent));
      if (q === 'locados') {
        // O estado do desenho é todos; a tela conserva Vigentes como padrão.
        await b.preencher('#f-contrato', 'todas'); await b.clicar('#b-buscar');
        await b.esperar(() => !!document.querySelector('[data-editar]') && !/buscando/.test(document.querySelector('#gi-corpo').textContent));
      }
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
        await b.avaliar(() => document.querySelector('#l-aluguel').dispatchEvent(new Event('blur')));
        motivos.push('0412 já locado no quadro Imóveis: ação da linha abre Editar. Modal de criação aberto pela API pública GI.modalLocacao, sem gravar.');
      }
    }
    if (['novo','modal','marcar'].includes(q)) {
      // Recalcula o centro pelo IntersectionObserver depois das leituras assíncronas.
      // Só muda o viewport: nenhuma substituição de DOM/CSS da extensão.
      const largura=tamanho.largura+32; let altura=Math.ceil(tamanho.altura/.7)+1500;
      const natural=await b.avaliar(()=>document.querySelector('.gi-modal').offsetHeight);
      if ((altura-natural)%2) altura++; // centro inteiro também quando o modal tem altura ímpar
      await b.viewport(largura,500); await b.avaliar(()=>new Promise(r=>setTimeout(r,40)));
      await b.viewport(largura,altura); await b.avaliar(()=>new Promise(r=>setTimeout(r,40)));
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
