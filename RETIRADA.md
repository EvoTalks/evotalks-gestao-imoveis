# Retirada do código dormente — 0.32.0

Base: `47498a9` (0.31.2). Nenhuma alteração no portal, commit ou publicação.

## Inventário de alcance

| Entrada | Recursos diretos |
|---|---|
| manifest.json | quatro páginas abaixo e app/icone-casa.svg |
| app/imoveis.html | estilo.css, compartilhado.css, comum.js, visualizacao.css, visualizacao.js |
| app/campos.html | estilo.css, compartilhado.css, comum.js |
| app/historico.html | estilo.css, compartilhado.css, comum.js |
| app/config.html | estilo.css, compartilhado.css, comum.js |

As quatro páginas preservam seus cartões ativos; C8 retirou o cartão antigo de alçada e prazos de Configurações e seu código exclusivo. Não há imports dinâmicos nem carregamentos adicionais de arquivos por string nos módulos alcançados. `test/escopo.test.mjs` confronta o grafo com todos os arquivos de `app/`: nenhum arquivo órfão permanece.

`chamados.css` → `compartilhado.css`: somente regras efetivas compartilhadas, conservando texto das declarações e ordem da cascata. As rotas de chamados, locações e prestadores, pessoas do chat, snapshots/invalidação e auxiliares de upload foram removidos do transporte comum. Finalidade Locação permanece porque é filtro ativo de imóveis.

Os testes e roteiros de telas retiradas foram removidos. As suítes mistas foram recortadas para o domínio ativo; a regressão de preenchidos do lote 2 permanece. A integração real conserva o cenário de situação; sua execução externa não é exigida neste nó.

## Verificação

- Antes: 221 testes unitários verdes na base, conforme o brief do coordenador.
- Depois: `node --test test/*.test.mjs`: **58 testes, 58 aprovados, zero falhas e zero pulados**.
- `node test/checar.mjs`: zero erros.
- `git diff --check`: sem problemas.
- Bancadas abaixo: todas aprovadas, cada execução com `timeout 280s`.
- `estilos.testar.mjs`: **40 estados** (quatro telas e edição de imóvel × claro/escuro × 260/300/334/1360 px), todas as propriedades computadas de cada elemento e de seus pseudoelementos idênticas ao CSS da base `47498a9`. O roteiro usa `git show` dessa base como oráculo; requer o histórico Git local.
- `campos0262.testar.mjs`: campos brancos e texto preto nas quatro telas, nos dois temas, incluindo o formulário de adicionar campo.

- `test/bancada/campos0262.testar.mjs`
- `test/bancada/capas.testar.mjs`
- `test/bancada/detalhe.testar.mjs`
- `test/bancada/estilos.testar.mjs`
- `test/bancada/finalidade.testar.mjs`
- `test/bancada/largura.testar.mjs`
- `test/bancada/permissoes.testar.mjs`
- `test/bancada/situacao-editar.testar.mjs`
- `test/bancada/situacao.testar.mjs`
- `test/bancada/visualizacao.testar.mjs`
- `node test/bancada/testar.mjs`: aprovado.

## Extraídos para nomes neutros

- `app/chamados.css` → `app/compartilhado.css` (somente regras ativas).

## Arquivos apagados

- `app/chamado-form.js`
- `app/chamados.css`
- `app/chamados.html`
- `app/chamados.js`
- `app/cockpit.js`
- `app/controles-atendimento.css`
- `app/fotos.js`
- `app/manutencao.js`
- `app/os.css`
- `app/os.html`
- `app/os.js`
- `app/painel.css`
- `app/painel.html`
- `app/painel.js`
- `app/prestadores.html`
- `app/prestadores.js`
- `test/ajustes.test.mjs`
- `test/bancada.test.mjs`
- `test/bancada/SIMPLIFICACAO.md`
- `test/bancada/atendente.cenarios.mjs`
- `test/bancada/chamados.testar.mjs`
- `test/bancada/cockpit.testar.mjs`
- `test/bancada/cockpit2.cenarios.mjs`
- `test/bancada/fatia4.testar.mjs`
- `test/bancada/feat0240.testar.mjs`
- `test/bancada/fotos.cenarios.mjs`
- `test/bancada/impeditivos.cenarios.mjs`
- `test/bancada/impeditivos.testar.mjs`
- `test/bancada/lote-y.cenarios.mjs`
- `test/bancada/lote1.cenarios.mjs`
- `test/bancada/lote1.testar.mjs`
- `test/bancada/os.testar.mjs`
- `test/bancada/patch0231.testar.mjs`
- `test/bancada/pessoa.testar.mjs`
- `test/bancada/portal-chamados.mjs`
- `test/bancada/rc7.testar.mjs`
- `test/bancada/rc8.testar.mjs`
- `test/bancada/review1-p2.testar.mjs`
- `test/bancada/review1.cenarios.mjs`
- `test/bancada/review1.testar.mjs`
- `test/bancada/review3.testar.mjs`
- `test/bancada/review4.testar.mjs`
- `test/bancada/simplificar.cenarios.mjs`
- `test/bancada/status.cenarios.mjs`
- `test/bancada/tema0260.testar.mjs`
- `test/bancada/vinculos.cenarios.mjs`
- `test/chamados-fidelidade.test.mjs`
- `test/cockpit-fidelidade.test.mjs`
- `test/cockpit2.test.mjs`
- `test/feat0240.test.mjs`
- `test/fidelidade.test.mjs`
- `test/fidelidade/chamados-correcoes.mjs`
- `test/fidelidade/chamados-variantes.mjs`
- `test/fidelidade/cockpit-variantes.mjs`
- `test/fidelidade/comparar.mjs`
- `test/fidelidade/css-puro.mjs`
- `test/fidelidade/desenho.mjs`
- `test/fidelidade/estrutural.mjs`
- `test/fidelidade/gestao-residuos.mjs`
- `test/fidelidade/pares.mjs`
- `test/fidelidade/regioes.mjs`
- `test/fidelidade/relatorio.mjs`
- `test/fidelidade/residuos-chamados.mjs`
- `test/fotos-portal.test.mjs`
- `test/fotos.test.mjs`
- `test/hotfix.test.mjs`
- `test/impeditivos.test.mjs`
- `test/lote-y.test.mjs`
- `test/manutencao.test.mjs`
- `test/os.test.mjs`
- `test/pessoa.test.mjs`
- `test/s3b.test.mjs`
- `test/s3c.test.mjs`
- `test/vinculos.test.mjs`

## Arquivos alterados

- `README.md`
- `app/campos.html`
- `app/comum.js`
- `app/config.html`
- `app/estilo.css`
- `app/historico.html`
- `app/imoveis.html`
- `manifest.json`
- `test/bancada/LEIA-ME.md`
- `test/bancada/campos0262.testar.mjs`
- `test/bancada/omni-stub.js`
- `test/bancada/servidor.mjs`
- `test/bancada/testar.mjs`
- `test/checar.mjs`
- `test/checar.test.mjs`
- `test/comum.test.mjs`
- `test/fidelidade/dados-desenho.json`
- `test/fidelidade/fixture-desenho.mjs`
- `test/fidelidade/portal.mjs`
- `test/fidelidade/roteiros.mjs`
- `test/integracao-proxy.test.mjs`
- `test/integracao-real.test.mjs`
- `test/integracao/LEIA-ME.md`
- `test/integracao/real.cenarios.mjs`
- `test/lote1.test.mjs`
- `test/lote2.test.mjs`
- `test/patch0231.test.mjs`

## Arquivos adicionados

- `app/compartilhado.css`
- `test/escopo.test.mjs`
- `test/bancada/estilos.testar.mjs`
- `RETIRADA.md`

## Nó C8 — Configurações sem cartão antigo

Removidos o cartão Manutenção, seus handlers e a leitura de inicialização; `app/config.js` foi apagado por ficar sem consumidores. Os cartões de permissões, estado/conexão, sincronização e campos padrão conservam sua marcação e código. Removidos o teste exclusivo dos helpers e as respostas simuladas da rota retirada. README atualizado.

Arquivos alterados neste nó: `app/config.html`, `test/escopo.test.mjs`, `test/bancada/servidor.mjs`, `test/fidelidade/portal.mjs`, `README.md` e `RETIRADA.md`. Arquivo apagado: `app/config.js`.

Verificação C8 (cada comando com timeout de 280 s):
- Antes: 58 testes aprovados; depois: 56 aprovados, zero falhas e zero pulados.
- `node test/checar.mjs`: 46 arquivos JS e quatro scripts inline, zero erros.
- Bancada de permissões: aprovada, zero falhas.
- Bancada de largura: aprovada, zero falhas.
- Bancada de estilos: aprovada, 40 estados com todas as propriedades computadas e pseudoelementos idênticos à base 47498a9.
- Busca em app, test e README: nenhuma referência ativa restante ao cartão, rota ou helper retirados; referências neste documento são histórico de remoção.
- `git diff --check`: aprovado.

A atualização solicitada no RETIRADA.md da árvore do portal foi impedida pelo sandbox (sistema de arquivos somente leitura). O coordenador deve substituir a seção “Incompatibilidade encontrada na dependência X1” por: “O nó C8 retirou o cartão Manutenção da extensão e a chamada a `/config/manutencao`.”

## Cobertura preservada (nó C9)

Todos os substitutos estão em `test/ativos.test.mjs`. Os originais foram consultados com `git show 47498a9:test/<arquivo>`; as asserções exclusivas de funções removidas não foram recriadas.

| Original na base 47498a9 | Substituto (título ou início do título) |
|---|---|
| fotos-portal: cota de transporte bloqueia a 31ª chamada antes de enviar e libera após 60s | ativos: cota bloqueia a 31ª chamada antes de enviar e libera aos 60s — também verifica o número de envios reais pelo transporte |
| hotfix: erros de abertura têm frases simples sem resposta crua ou status | ativos: erros simples, campos ativos, códigos e falhas de rede — Título/Descrição em lugar de Canal |
| impeditivos: F14: encerrado só oferece Reabrir para Triagem | ativos: erros simples, campos ativos, códigos e falhas de rede — apenas mensagemErro; statusDisponiveis, CHAMADO_STATUS e códigos específicos de chamados saíram |
| manutencao: manifest 0.31.2 mantém só as quatro telas ativas, sem configuração de manutenção | ativos: manifest 0.32.0 monta só quatro telas e cabeçalho segue sua ordem |
| manutencao: helpers cobrem o contrato, preservam payloads e recusam manutenção sem portal | ativos: helpers de situação e capas preservam query e corpo sem portal; ativos: transporte preserva rotas, métodos, payloads e erros via SDK/fetch |
| manutencao: Chromium: páginas esqueleto, SDK, navegação, escrita desligada e demonstração sem rede | ativos: Chromium monta quatro páginas com SDK, cfg e navegação única; ativos: definirModo distingue local, portal e portal-fora sem fallback de storage — demonstração sem rede era comportamento retirado, não recriado |
| pessoa: nome real usa users.list do host uma vez, sem consultar a rota crua | mesmo título, preservadas concorrência, cache, fallback, fullname, falhas síncronas e assíncronas; só nome sintético simplificado |
| pessoa: ordem dos atendentes preserva a ordem original do SDK | mesmo título e mesmas asserções |
| s3b: S3b: todas as páginas recebem navegação única sem manutenção no menu do host | ativos: Chromium monta quatro páginas com SDK, cfg e navegação única; ativos: manifest 0.32.0 monta só quatro telas e cabeçalho segue sua ordem |
| comum: gravações do transporte comum invalidam snapshots após sucesso nos dois transportes | ativos: transporte preserva rotas, métodos, payloads e erros via SDK/fetch — cobre o transporte restante, sem ressuscitar snapshots e marcas removidos |
| comum: locações recusam leitura e gravação sem portal, sem recorrer ao storage | ativos: helpers de situação e capas preservam query e corpo sem portal; ativos: definirModo distingue local, portal e portal-fora sem fallback de storage |
| comum: helpers usam as rotas, queries e corpos do contrato; mapa devolve códigos | ativos: helpers de situação e capas preservam query e corpo sem portal — mapa de situação/capas e código acentuado com espaços e & |
| comum: atendente e supervisor não recebem atalhos internos nem abrem gestão por GI.abrirTela | ativos: permissões filtram navegação de perfil 1/2; ativos: abrirTela encaminha telas ativas e avisa quando o host recusa — ver divergência abaixo |
| comum: gestor libera só o id temporário e administradores, com navegação e abertura coerentes | ativos: abrirTela encaminha telas ativas e avisa quando o host recusa; navegação dos quatro perfis — gestor/GESTORES_EXTRA foram removidos |
| lote1: SDK numérico, nulos e histórico chegam tipados ao portal | ativos: isoPortal mantém tipagem de datas do histórico — apenas isoPortal permanece |
| lote1: busca preserva contato sem nome e pede 100 resultados | Não contém nenhuma asserção de mensagemErro no original: testa buscarContatos, que foi removido. Cobertura da função listada mensagemErro no teste ativos: erros simples, campos ativos, códigos e falhas de rede |
| lote1: 422 nomeia campos e rede nunca expõe status nem código | ativos: erros simples, campos ativos, códigos e falhas de rede |

### Abertura de telas sem permissão

`app/comum.js:1078` define GI.abrirTela sem checar perfil ou permissão, encaminhando diretamente ao host em `app/comum.js:1080`. O bloqueio antigo era exclusivo das contribuições retiradas e não existe mais; GI.gestor/GESTORES_EXTRA também foram removidos. O teste novo cobre o encaminhamento das quatro contribuições ativas para os quatro perfis e o aviso nas duas formas de falha do host, e outros dois testes cobrem filtragem da navegação por permissões. Na base 0.31.2 esse bloqueio valia só para gi-locados, gi-chamados e gi-prestadores, que saíram; as quatro telas ativas já eram abertas sem checagem em abrirTela. A proteção delas é a da própria página (GI.exigirPermissao esconde o conteúdo e mostra "Sem acesso a esta tela"), mais a navegação filtrada por GI.pode, e a bancada de permissões prova as duas.

### Verificação C9

Cada comando foi executado com `timeout 280s`:

- `node --test test/*.test.mjs`: antes 56; depois **70 testes aprovados**, zero falhas, zero pulados (14 novos).
- `node test/checar.mjs`: 47 arquivos JS, quatro scripts inline, zero erros.
- `node test/bancada/permissoes.testar.mjs`: PASS, FAIL 0.
- `node test/bancada/testar.mjs`: PASS situação, FAIL 0.

Sem commit, push, PR ou merge. Apenas arquivos em test/ escritos pelo nó C9.
