/* Consolida medições já executadas; não altera a régua, imagens ou aplicação. */
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { abrirAmbiente, SAIDA } from './ambiente.mjs';
import { contarRegioes } from './regioes.mjs';
import { tabela } from './comparar.mjs';

const destino = fileURLToPath(new URL('../../relatorio-fidelidade/', import.meta.url));
const ler = nome => readFile(path.join(SAIDA, nome), 'utf8').then(JSON.parse);
const [oficial, original, antes, originalAntes, css, estrutura] = await Promise.all([
  ler('s3b/oficial.json'), ler('s3b/original.json'), ler('s3b/antes-oficial.json'),
  ler('s3b/antes-original.json'),
  ler('css-puro/relatorio.json'), ler('estrutural.json')
]);
if (oficial.sha256 !== original.sha256 || oficial.versao !== original.versao) throw new Error('Medições de fontes/versões diferentes');
if (oficial.sha256 !== antes.sha256) throw new Error('Antes/depois S3b devem usar o mesmo desenho vivo');
if (!oficial.referenciaCockpit.startsWith('Medida oficial:')) throw new Error('Medição oficial sem origem comum');
// Linha de base publicada pelo nó S0, antes da adaptação dos viewports dos modais.
// Não são números obtidos pela régua posterior de origem comum.
const s0 = [19.9869, 45.8645, 75.7140, 24.5326, 51.5374, 32.0454, 80.2634, 65.5433, 78.0874];
const porQuadro = (r, q) => r.quadros.find(x => x.quadro === q);
const aprovado = oficial.quadros.every(r => r.percentual <= .5);
const semPiora = oficial.quadros.every(r => r.percentual - porQuadro(antes,r.quadro).percentual <= .3);
const grupos = {
  lista: [['Contagens do contrato', '.gi-sub'], ['Aba ativa posicionada manualmente no desenho vivo', '.gi-nav-ativo'], ['Colunas automáticas por texto do contrato', 'thead'], ['Prazo do contrato, datas, legendas ausentes', 'tbody td:nth-child(6)'], ['Cotações sem meta contratual', 'tbody td:nth-child(7)']],
  novo: [['Gênero não informado', '.gi-grade-modal:last-of-type label:last-of-type'], ['Opções adicionais preservadas', '.gi-modal-rodape']],
  modal: [['Datas nativas e gênero ausente', '[data-evox="mnt-modal-campos"]'], ['Fotos sem vídeo', '.photos'], ['Cotações sem meta ou contagem de serviços', '[data-evox="mnt-modal-orcamentos"]'], ['Subtextos não gravados nos eventos', '[data-evox="mnt-modal-historico"]'], ['Decisão do proprietário continua acessível', '.gi-aprov'], ['Opções adicionais preservadas', '.gi-modal-rodape'], ['Explicação visível do bloqueio de envio', '.gi-aviso-check']],
  locados: [['Datas relativas do contrato', 'tbody td:nth-child(5)']],
  marcar: [['Cidade ausente na categoria', '.gi-modal-imovel .gi-ajuda'], ['Datas nativas', '.gi-grade-modal']],
  imoveis: [['Definições dos campos ausentes', '.gi-sub'], ['Total das seis linhas do fixture', '.gi-rodape'], ['Próxima desabilitada: seis imóveis reais contra 1757 ilustrados', '.gi-rodape button:last-child']],
  'cockpit-chamados': [['Papel sem gênero', '.pc__doc .pill'], ['Resumo interativo', '.pc__sum'], ['Vincular residência preservado', '.pc__link'], ['Editar e Mais ações preservados', '.acc .btns'], ['Rodapé sem filtro temporal inexistente', '.foot']],
  'cockpit-novo': [['Papel sem gênero', '.pc__doc .pill'], ['Usar última mensagem do cliente', '.pc__link'], ['Autorização sem gênero e acesso adicional', '.chk']],
  'cockpit-confirma': [['Conferência sem gênero', '.kv'], ['Ações adicionais', '.btns']],
  'cockpit-sucesso': [['Ações adicionais', '.btns']]
};
const b = await abrirAmbiente(), residuos = [];
try {
  for (const r of oficial.quadros) {
    await b.viewport(r.desenho.largura, Math.max(1100, r.desenho.altura));
    await b.navegar(pathToFileURL(path.join(SAIDA, 'referencia-iframe', r.quadro + '.html')).href);
    const caixas = await b.avaliar((q, gs) => {
      const raiz = document.querySelector(q.startsWith('cockpit-') ? '.panel' : ['novo','modal','marcar'].includes(q) ? '.gi-modal' : '.gi');
      const o = raiz.getBoundingClientRect();
      return gs.flatMap(([causa, seletor]) => [...raiz.querySelectorAll(seletor)].map(n => {
        const x = n.getBoundingClientRect();
        return {causa, x:x.x-o.x, y:x.y-o.y, width:x.width, height:x.height};
      })).filter(x => x.width && x.height);
    }, r.quadro, grupos[r.quadro]);
    for (const x of await contarRegioes(b, path.join(SAIDA,r.quadro,'desenho.png'), path.join(SAIDA,r.quadro,'extensao.png'), caixas)) {
      if (x.diferentes) residuos.push({quadro:r.quadro,...x});
    }
  }
} finally { await b.fechar(); }

await mkdir(destino, {recursive:true});
for (const r of oficial.quadros) {
  await mkdir(path.join(destino, r.quadro), {recursive:true});
  for (const nome of ['desenho.png','extensao.png','diff.png']) await copyFile(path.join(SAIDA,r.quadro,nome), path.join(destino,r.quadro,nome));
}
for (const tema of ['light','dark']) {
  const pasta = path.join('cockpit-variantes',tema);
  await mkdir(path.join(destino,pasta), {recursive:true});
  for (const nome of await readdir(path.join(SAIDA,pasta))) {
    if (/-(260|300|317|334)\.png$/.test(nome)) await copyFile(path.join(SAIDA,pasta,nome),path.join(destino,pasta,nome));
  }
}
for (const [nome, dados] of Object.entries({oficial,original,'antes-oficial':antes,'antes-original':originalAntes,css,estrutura,residuos})) await writeFile(path.join(destino,nome+'.json'),JSON.stringify(dados,null,2)+'\n');
const tabelaAntes = ['| Quadro | S0 original | Antes S3b oficial | Final oficial | Final original | Alcançável | Mascarado |',
  '|---|---:|---:|---:|---:|---|---:|', ...oficial.quadros.map((r,i) => `| ${r.quadro} | ${s0[i]===undefined?'suplementar':s0[i].toFixed(4)+'%'} | ${porQuadro(antes,r.quadro).percentual.toFixed(4)}% | ${r.percentual.toFixed(4)}% | ${porQuadro(original,r.quadro).percentual.toFixed(4)}% | ${r.alcancavel?'sim':'não'} | ${r.mascarados} px |`)].join('\n');
const tabelaResiduos = ['| Quadro | Região/causa | Área da caixa | Pixels divergentes |','|---|---|---:|---:|',
  ...residuos.map(r=>`| ${r.quadro} | ${r.causa} | ${r.area} px | ${r.diferentes} px |`)].join('\n');
const tabelaS3b = ['| Quadro | Oficial antes | Oficial depois | Aumento (pp) | Original antes | Original depois |',
  '|---|---:|---:|---:|---:|---:|', ...oficial.quadros.map(r=>`| ${r.quadro} | ${porQuadro(antes,r.quadro).percentual.toFixed(4)}% | ${r.percentual.toFixed(4)}% | ${(r.percentual-porQuadro(antes,r.quadro).percentual).toFixed(4)} | ${porQuadro(originalAntes,r.quadro).percentual.toFixed(4)}% | ${porQuadro(original,r.quadro).percentual.toFixed(4)}% |`)].join('\n');
const tabelaEstrutura = ['| Par | Propriedade | Desenho | Extensão |','|---|---|---|---|',
  ...estrutura.diferencas.map(r=>`| ${r.par} | ${r.propriedade} | ${r.desenho} | ${r.extensao} |`)].join('\n');
const md = `# Fidelidade ao desenho — 0.25.0

Critério estrito de 0,5%: **${aprovado?'ATENDIDO':'NÃO ATENDIDO'}**. ${oficial.quadros.filter(r=>r.percentual<=.5).length} de ${oficial.quadros.length} recortes dentro do limite. Os nove originais mais o sucesso suplementar são mostrados, sem esconder estados reprovados.

Fonte viva: ${oficial.fonte}. SHA-256: ${oficial.sha256}. Relógio ${oficial.agora}, Brasília, DPR 1, tolerância 8 por canal. A medida oficial usa DOM/CSS/sprite vivos em origem inteira. A original conserva a fase fracionária do canvas. Nenhuma nova máscara; somente o botão final do cockpit (9440 px).

## Antes e depois

Limite de aumento de 0,3 ponto percentual por recorte: **${semPiora?'ATENDIDO':'NÃO ATENDIDO'}**.

${tabelaS3b}

${tabelaAntes}

S0 usava canvas original e montagem anterior dos viewports. Sua linha de base é histórica, não uma medição retroativa com origem comum. Os PNGs S0 foram sobrescritos pelos nós anteriores; não foram recriados ou apresentados como capturas antigas. S3 atualizou a versão/cache e a documentação. S3b corrigiu os oito achados do QA2, incluindo a explicação de envio na mesma linha, a remoção das larguras artificiais das contagens e o rodapé verdadeiro. A coluna Antes S3b foi medida nesta execução, antes das correções.

## Correções S3b

1. painel.js: rodapé “Chamados de todas as residências.” descreve o alcance real; não afirma filtro de 12 meses inexistente.
2. chamado-form.js/chamados.css: aviso visível ao lado do checkbox, com aria-describedby e title; todos os bloqueios, ausência de vínculo e estado permitido testados, sem variar a altura do modal.
3. chamado-form.js: máscara exata ancorada; entradas com texto extra, tags, quebras, país, fixo, números curtos/longos e vazio são reconstruídas pelos dígitos sem expor o número inteiro.
4. chamados.css: removidas as larguras mínimas e o inline-block das duas contagens, sem substituto.
5. painel.js: clique fora conserva o foco do destino; Esc e escolha de botão do menu devolvem o foco ao summary. Prova com clique real CDP no campo de busca.
6. painel.js: aprovação só com decisão ou pendência enviada; seletor visível também em Imóvel, oculto em Novo.
7. comum.js: Prestadores sai apenas da origem da barra; sete remoções locais apagadas. Menu do host e formulário de Prestadores preservados.
8. testes: preenchimentos/asserções duplicados removidos; revisão e abertura explícitas comprovadas mesmo com conferência pré-marcada.

O limite deste nó é aumento máximo de 0,3 ponto percentual por recorte. A meta global de 0,5% permanece reportada separadamente.

## Medida oficial literal

${tabela(oficial.quadros)}

## Canvas original literal

${tabela(original.quadros)}

## CSS puro e estrutura

${tabela(css.quadros)}

${estrutura.pares} pares estruturais; ${estrutura.diferencas.length} diferenças.

${tabelaEstrutura}

O desenho vivo já contém a aba Chamados com position:absolute, width:107px, min-height:39px e left/top manuais. A extensão mantém a navegação em fluxo; isso explica as diferenças de largura de título, subtítulo e navegação, e de tamanho da aba ativa. Esse estado está presente desde a linha de base S3b e a medição usa o mesmo SHA-256 antes/depois. A fonte mudou desde o relatório histórico S3; os números antigos não são uma medição da fonte atual. A margem de novo/modal é 0px 207px no palco de 1360 px e 0px 15px no iframe do diálogo. Ambos medem 900 px e estão centralizados por margin-inline:auto; a diferença fica fora do recorte. Todas as propriedades continuam medidas e registradas, sem whitelist ou tolerância extra.

## Resíduos e limitações

${tabelaResiduos}

Imóveis: “próxima →” está desabilitado na extensão porque existem seis imóveis na fixture; no desenho está habilitado para 1757. A contagem sem larguras artificiais passa a ocupar o espaço natural dos dados reais.

Textareas: o CSS vivo do desenho usa resize:none. Os campos visíveis de Novo, Editar e Marcar já computavam resize:none. No cockpit, uma regra mais específica de #cp-form .inp--area sobrescrevia o resize:none e mostrava o grip; S3b corrige essa regra para resize:none. O teste novo comprova ausência do grip nos quatro estados.

Cockpit: o rodapé do desenho diz “Chamados dos últimos 12 meses.”, mas esse filtro não existe no portal; a extensão mostra “Chamados de todas as residências.”. Diferença de texto justificada, sem máscara adicional. O aviso de envio bloqueado no Editar também é diferença justificada de informação funcional.

As áreas são diagnósticas e podem se sobrepor; não são máscaras nem parcelas aditivas. Incluem texto e a geometria automática afetada pelo texto. Lista: SLA absoluto da 1042 contradiz o relativo ilustrado, faltam legendas de encerramento e há contagens/cotações diferentes. Editar: eventos não guardam os três subtextos ilustrados, o portal não fornece serviços por prestador nem meta de três cotações; controles de data são nativos. Cockpit: sem gênero e sem ação de troca de contato, são preservados Locatário, cliente, Vincular outra residência e Usar última mensagem do cliente; Editar/Mais ações ocupam espaço que o desenho não prevê. Esses resíduos não foram ocultados nem convertidos em aprovação pela exceção de 2%.

${oficial.limitacoes.map(x=>'- '+x).join('\n')}

Marcar: 0412 já aparece locado, portanto a ação da linha abre Editar; a bancada abre GI.modalLocacao sem gravar para mostrar a criação. Sem Brusque na categoria do fixture. Datas nativas mantidas. Imóveis deriva a contagem das seis linhas disponíveis e não simula os 1751 ausentes ou os 11 campos. Vigentes permanece o filtro inicial de Locados; a comparação seleciona todos.

## Decisões funcionais preservadas

- Novo deriva o título da descrição (primeira frase/linha, até 80 caracteres); reserva Reparo de categoria. Editar mantém Título em Mais opções.
- Prestadores fica no menu do host, fora da barra de navegação do desenho.
- Confirmação e sucesso são estados sucessivos, em recortes separados.
- Abertura pelo Novo; botão final da lista removido por pedido explícito.
- Status imediato, reabertura somente para Triagem, releitura, rascunhos, cache, confirmação e permissões permanecem cobertos pelas bancadas.
- Vazios, erro, carregamento, demonstração, edição inline, fotos carregadas e múltiplas residências seguem os componentes/tokens, embora não estejam desenhados.

## Testes atualizados

S3b: novo s3b.test.mjs cobre os motivos do aviso/altura, máscara hostil, estados de aprovação, seletor nas abas, contagens naturais, textareas e navegação nas sete páginas. cockpit-fidelidade.test.mjs antes exigia foco no summary até em clique fora; agora testa clique real no #cp-busca e foco preservado, mantendo Esc e acrescentando escolha de item. gestao-fidelidade.test.mjs antes exigia data-tela de Prestadores e abaPrestadores.remove() em cinco páginas; agora exige GI.cabecalho sem remoção repetida. comum.test.mjs antes exigia gi-prestadores na barra; retira essa expectativa de apresentação, preservando a abertura pelo host e permissões. manutencao.test.mjs antes ordenava todos os títulos do manifest na barra; agora compara os seis títulos que pertencem à barra, preservando o manifest. ajustes.test.mjs antes só exigia ausência de #cp-conferi, id que não era o checkbox real; agora prova ausência de escrita antes do botão de revisão, ausência de criação com #cp-conferencia pré-marcado e exatamente uma criação após Abrir chamado. bancada/cockpit.testar.mjs remove o preencher sobreposto de Descrição e o preencher hostil idêntico; bancada/patch0231.testar.mjs e bancada/review3.testar.mjs removem asserções duplicadas do mesmo campo (não havia preencher repetido restante nesses dois arquivos). Nenhuma asserção funcional foi enfraquecida.

S3: fidelidade.test.mjs antes esperava opções sem origemComum; agora exige o padrão oficial e verifica --original. patch0231.test.mjs, manutencao.test.mjs, os.test.mjs e bancada/fatia4.testar.mjs antes exigiam 0.24.0; agora exigem 0.25.0, mantendo as asserções de recursos e permissões. Nenhum teste funcional foi afrouxado neste nó.

Nos nós anteriores: Título no Novo migrou para Descrição conforme decisão explícita; rascunho passou a ser verificado nesse campo. “atualizado há” mudou para “atualizado às”. Localização de Editar/fotos e classes SVG foram adaptadas; overflow passou a medir elementos visíveis. No modal, valor escolhido antes era P e agora é INPUT readonly com title e mesmo valor. A integração seleciona #8899 pelo identificador, em vez da posição. A antiga aba Prestadores foi retirada da barra, com as verificações de permissão preservadas. Detalhes e comandos finais estão em VALIDACAO.md.

## Comparação visual

Desenho vivo, extensão e mapa de diferenças da medida oficial:

${oficial.quadros.map(r=>`### ${r.quadro}\n\n| Desenho | Extensão | Diferença |\n|---|---|---|\n| ![Desenho](${r.quadro}/desenho.png) | ![Extensão](${r.quadro}/extensao.png) | ![Diferença](${r.quadro}/diff.png) |`).join('\n\n')}

## Cockpit em claro e escuro

${['cockpit-chamados','cockpit-novo','cockpit-confirma','cockpit-sucesso'].map(q=>`### ${q}\n\n| Largura | Claro | Escuro |\n|---|---|---|\n`+[260,300,317,334].map(w=>`| ${w} px | ![Claro](cockpit-variantes/light/${q}-${w}.png) | ![Escuro](cockpit-variantes/dark/${q}-${w}.png) |`).join('\n')).join('\n\n')}

Relatório mantido dentro da worktree: o recurso de escrita autorizado não inclui a pasta externa ~/fluxo/fidelidade-desenho/relatorio/. Nenhum stage, commit, push, PR, publicação ou acesso a instância foi realizado.
`;
await writeFile(path.join(destino,'RELATORIO.md'),md);
process.stdout.write(tabelaS3b+'\n'+(semPiora?'Aumento por recorte ≤ 0,3 pp: ATENDIDO.':'Aumento por recorte ≤ 0,3 pp: NÃO ATENDIDO.')+'\n'+(aprovado?'Meta estrita atendida.':'Meta estrita não atendida; resíduos expostos sem alterar a régua.')+'\nRelatório: '+destino+'RELATORIO.md\n');
