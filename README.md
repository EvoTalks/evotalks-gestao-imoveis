# Gerenciamento de Imóveis — extensão do EvoTalks

Porte do **portal de taxas do William Imóveis** para dentro do EvoTalks, como extensão nativa:
um menu superior **Gerenciamento de Imóveis** com **Imóveis**, **Locados**, **Chamados**,
**Prestadores**, **Campos**, **Histórico** e **Configurações**, e cockpit de manutenção no atendimento.

Registra, por imóvel, informações que **não aparecem no site** (taxas, IPTU, encargos, observações
da administração) e que precisam chegar a quem atende.

| No portal (Docker + Postgres + n8n) | Aqui (extensão) |
|---|---|
| `/imoveis` + `/imovel/:codigo` | tela **Imóveis** — lista, filtros, 🟢/🟡 e o formulário de lançamento |
| `/api/ext/locacoes` | tela **Locados** — banco de locações, contatos, contratos, vigência e encerramento |
| `/api/ext/chamados` | tela **Chamados** — O.S. por imóvel locado, atendimento vinculado, orçamentos, aprovação e visita |
| `/api/ext/prestadores` | tela **Prestadores** — cadastro, categorias e ativação/desativação |
| `/api/ext/config/manutencao` | **Configurações → Manutenção** — alçada e SLA por prioridade |
| `/campos` | tela **Campos** — os cinco tipos, recorrência padrão, ativar/desativar/apagar |
| `/historico` | tela **Histórico** — quem, quando, de → para, com filtros |
| `/consultas` | **removida na 0.3.0** — o que a IA consulta se vê no MCP do portal, não aqui |
| `/login`, `/usuarios`, CSRF, sessão | some: a extensão herda o usuário logado do EvoTalks |
| espelho Postgres + sync 6h + XML | some: o catálogo já está na instância (`products`) |

## Arquivos

```
manifest.json          identidade 0.23.1, config e contribuições
app/comum.js           SDK omni, persistência, catálogo, locações e formatação
app/locacao.js         modal compartilhado de cadastro/edição e encerramento de locações
app/estilo.css         tema por tokens --ext-* (segue a whitelabel da instância)
app/imoveis.html       lista + detalhe do imóvel
app/locados.html       banco de locados + filtros + candidatos que saíram do anúncio
app/fotos.js           validação, redução e prévias de fotos escolhidas no computador
app/manutencao.js      contrato e transporte da manutenção, sem fallback para storage
app/chamados.html/js/css lista e modais de chamados, orçamentos, aprovação, prestador e visita
app/prestadores.html/js  lista, cadastro/edição e ativação/desativação de prestadores
app/painel.html/js/css   cockpit por contato e imóvel, abertura após revisão
app/cockpit.js         resumo, filtros, ordenação e snapshot seguro de consultas
app/config.html       catálogo e configuração de manutenção
app/campos.html        definição dos campos
app/historico.html     eventos de edição
```

## Datas e navegação do SDK

`startedAt` e `lastMessageAt` do SDK são segundos Unix. A referência geral
`api-omni.md` descreve os campos sem especificar a unidade. A extensão normaliza
números positivos menores que `1e11` como segundos, maiores como milissegundos e
textos ISO com fuso. `GI.dataDoChat` devolve ISO ou `null`, limitado aos anos
2000–2100. Histórico legado sem fuso passa pela adaptação UTC existente. Datas
persistidas anteriores a 2000 não são exibidas nem regravadas no portal.

O canal numérico é resolvido por `omni.queueTypes`, sem deduzir sua numeração. A
gestão da O.S. usa `omni.ui.openContribution('gi-os', params)` para todos os perfis;
`openHtml` não funciona nesta instalação. O segundo canal de passagem usa storage
com validade de 60 segundos. Nenhuma tentativa de vincular contato pelo SDK é feita.

## Locações (0.18.0)

**Locados exigem o portal conectado**, com `portalUrl` e `portalToken` configurados e as
rotas `/api/ext/locacoes*` disponíveis. A gravação de locações usa somente o portal. O cockpit pode guardar um snapshot de consulta em `omni.storage` por até 10 minutos.
Sem conexão, as telas avisam e bloqueiam as ações de locação.

A lista de **Imóveis** continua lendo o catálogo nativo (`products`). Uma leitura de
`/locacoes/mapa` acrescenta a coluna **Situação**: Disponível ou Locado, com contrato e
locatário. O filtro Situação vale **somente para a página atual**, assim como Estado.
Somente o administrador vê a chave **Marcar como locado** e a edição da locação.
Situação e seu filtro continuam disponíveis para consulta em todos os perfis.

**Locados** lista e filtra por imóvel, contato, contrato, origem e vigência; mostra resumo
e paginação. **Novo locado** permite escolher um anúncio ou informar imóvel que nunca
esteve no catálogo (título, endereço, tipo, bairro e cidade). A faixa de candidatos lista
anúncios de locação que saíram nos últimos 60 dias e abre o cadastro com seu snapshot.

O locatário é escolhido pela busca de contatos do EvoTalks, disponível ao agente; seu ID
vincula a locação ao contato. Proprietário, contrato, garantia, início/fim, aluguel,
vencimento e observação completam o cadastro. Valores trafegam em centavos; datas em
`YYYY-MM-DD`. Erros de validação ou conflito mantêm o formulário aberto com o digitado.
Editar preserva os demais contatos (como fiadores) e vínculos que já existiam.

**Encerrar locação** confirma, pede motivo e mantém o histórico. O portal remove o imóvel
das buscas da assistente enquanto a locação está ativa e o devolve ao encerrar. O snapshot
da locação sobrevive à saída do anúncio do feed. As locações encerradas ficam disponíveis
para consulta pelo filtro de contrato, sem edição ou exclusão.

## Chamados e manutenção (0.23.0)

As contribuições **Locados**, **Chamados** e **Prestadores** são exclusivas do
administrador e, temporariamente, do usuário 531 (`userIds: [1,515,528,531]`). O cockpit **Manutenção** está disponível para
administradores, supervisores e atendentes (`[0,1,2]`). Todos abrem a gestão da O.S.
no diálogo `gi-os`; administrador e usuário 531 veem **Lista completa** (`gi-chamados`). Imóveis, Campos, Histórico e Configurações herdam a visibilidade do menu.

Exigem o portal conectado e as rotas das Fatias 2 e 4 em `/api/ext`. O storage guarda apenas o alvo temporário da abertura do diálogo e snapshots de consulta do cockpit (máximo 8 contatos, 10 minutos, menos de 60 mil caracteres no conjunto; sem credenciais, fotos ou arquivos). A fonte das gravações continua sendo o portal. Sem portal, as telas avisam e bloqueiam ações.
O imóvel é o ponto focal; a locação conserva seu snapshot e o contato é o vínculo.
Cada escrita do cockpit publica uma marca nova e preserva em memória a pendência externa ainda não vista, para que ambas as telas releiam as alterações.

**Chamados**: escolher o status na lista ou no modal grava na hora, atualiza a linha,
o prazo e o resumo. A recusa do portal devolve o seletor ao status anterior e explica
o motivo. Só **Cancelado** pede confirmação inline, com motivo opcional e **Voltar**.
Chamado encerrado reabre em Triagem pelo mesmo seletor. O **Salvar** cuida dos dados
e fotos, sem alterar status; rascunhos permanecem intactos durante a troca.
Só os campos alterados são enviados. Sem alteração nem fotos/notas pendentes, não
há gravação ou consulta ao salvar. Com orçamento escolhido, o valor é texto somente
leitura e nunca entra no corpo do Salvar; quem paga e prioridade podem mudar depois
da escolha. A recusa desse valor pelo portal orienta escolher outro orçamento.
Fotos enviadas podem ser ampliadas inclusive em chamados encerrados; adicionar fotos
continua bloqueado nesses chamados.

No novo chamado, busque o cliente; uma única locação já vem selecionada. **Escolher atendimento**
lista o histórico do contato, incluindo atendimentos encerrados, unido aos abertos
acessíveis ao usuário (filas adicionais para supervisor e administrador), do mais recente
ao mais antigo. Os canais seguem as constantes `omni.queueTypes` do host; uma origem
desconhecida aparece como Atendimento. Mostra dez por vez e **Mostrar mais** acrescenta dez sem nova consulta. Quando há somente um atendimento e ele está aberto, já vem
escolhido. Em edição,
um único atendimento aberto sem vínculo é oferecido no topo com **Vincular este**.
Um clique grava o vínculo; **Tirar vínculo** só aparece com vínculo e **Abrir atendimento**
só com conversa aberta. **Escolher atendimento** aguarda a seleção do cliente.
Vínculos antigos só por protocolo continuam identificados como sem conversa vinculada.
A escolha usa exclusivamente a lista, sem digitar número ou protocolo. A falha do histórico
mostra os abertos com aviso; falha total oferece **Tentar de novo**.

**Orçamentos** aceita nome livre do prestador, valor opcional e descrição livre
(serviço, prazo e condições). O portal guarda o nome automaticamente e o reutiliza nas
sugestões. **Escolher** aplica direto; **Remover** pede um segundo clique na própria linha.
Cada operação usa no máximo três requisições: até uma gravação pendente, a operação
e uma releitura do chamado. A linha é atualizada pela resposta, sem reler a lista;
a lista completa é recarregada uma vez ao fechar se houve gravação no modal.
Se há vários blocos pendentes (dados, nota, visita ou fotos), **Salvar dados pendentes**
os grava sem fechar nem perder a cotação digitada; a operação de orçamento pode
ser repetida em seguida. A busca de prestadores espera 300 ms e não repete o mesmo termo.

**Nota para a equipe** salva internamente sem confirmação. **Avisar o cliente no WhatsApp**
só fica disponível com atendimento vinculado e aberto daquele cliente. **Enviar ao cliente**
mostra o texto exato para um clique em **Enviar**. Só `sent:true` registra a nota enviada;
a falha mantém o texto. Se a mensagem sair e o registro falhar, repetir na mesma edição
tenta registrar sem reenviar.

**Mais opções**, fechado por padrão, reúne categoria, acesso, atendente, custos,
prestador responsável, visita, aprovação do proprietário e histórico. A faixa de aprovação
pendente ou recusada abre a decisão nesse bloco. As regras do portal continuam valendo:
aprovação pendente bloqueia Agendado/Em execução e Agendado exige visita.
Registrar decisão é interno: **Aprovado**, **Recusado** e uma observação opcional.
Envia o nome do proprietário vinculado (ou “Proprietário”) e canal “WhatsApp”.
Uma recusa exige outra cotação antes de aprovar novamente, conforme o portal.
**Enviar ao proprietário** pede revisão da mensagem,
revalida o chat aberto dele e só registra envio após `sent:true`. Sem contato ou chat
acessível, registra nota interna explicando que a mensagem não saiu. A repetição após
falha de registro não reenvia dentro da mesma edição. Fotos não são enviadas ao proprietário.

**SLA** usa tempo corrido. A lista mostra primeira resposta vencida, prazo de solução
ou pausa; Editar também mostra os instantes dos prazos. Ao entrar em Aprovação,
o portal pausa a solução; ao sair, ajusta o prazo. Primeira resposta continua cobrada.
Os padrões são: emergência 15 min/24 h, alta 120 min/72 h, normal 240 min/120 h;
alçada R$ 250,00. **Configurações → Manutenção** lê e salva alçada e SLA, valida
inteiros positivos e confere o resultado por releitura no portal.

**Prestadores** tem busca, categorias, filtro de ativos e paginação local dos resultados
do portal. Cadastrar e editar preservam os dados em erros de validação; ativar/desativar
pede confirmação. Não há exclusão; prestadores inativos já vinculados permanecem visíveis
no chamado, e novos vínculos usam os ativos.

O **cockpit** consulta os chamados da locação do contato, inclusive os abertos por outra
pessoa, e pode abrir a gestão. A escrita começa habilitada (`cockpitAbreChamado: true`);
quando habilitada, abre chamado após resumo e confirmação explícita, sem caixa de
conferência repetida, vinculando o atendimento atual. O modo
`modoDemonstracao` usa somente dados sintéticos e bloqueia rede e gravação.

## Onde os campos adicionais moram

Com portal configurado, campos e valores também usam o backend compartilhado. O modo
local abaixo continua disponível apenas para experimentar os campos adicionais.

**Piloto:** `omni.storage` — por instalação **e por usuário**, no navegador dele, ~262 mil
caracteres. Outro computador começa vazio. Serve para validar as telas, não para produção.

A escolha do modo e as chamadas ao backend ficam em `app/comum.js`. Se o portal estiver
configurado mas indisponível, a extensão avisa em vez de cair silenciosamente no modo local.

## Catálogo

As telas leem `products` por `omni.data.request` (blueprint Sails, com `where`/`limit`/`skip`).
Se o `where` for recusado, o código cai para leitura paginada e filtro local — a tela mostra qual
caminho respondeu, no rodapé da lista.

O recorte do catálogo vem da configuração da instalação:

| chave | padrão | para quê |
|---|---|---|
| `marca` | `WILLIAM IMÓVEIS BOULEVARD` | filtra o `brand` — é o que separa os imóveis do resto do catálogo |
| `prefixoCodigo` | `535` | o código do site não mostra o prefixo da imobiliária (`5350060` → `0060`) |
| `rotulo` | `imóvel` | palavra usada nos textos |

## Testar localmente

Sem npm install: `node test/checar.mjs`, `node --test test/*.test.mjs`,
`node test/bancada/testar.mjs`, `node test/bancada/chamados.testar.mjs`,
`node test/bancada/cockpit.testar.mjs`, `node test/bancada/fatia4.testar.mjs` e
`node test/bancada/os.testar.mjs`. Uso manual e cenários em
[test/bancada/LEIA-ME.md](test/bancada/LEIA-ME.md). A bancada tem portal em memória e
SDK sintético, isolados de qualquer instância real; os PNGs gerados não são versionados.
O teste `test/lote2.test.mjs` cobre falha de preenchidos, acordeão sem linhas neutras,
atualização sem cache, troca de chat antes do envio, mapas com chaves hostis,
confirmação de aviso e abertura do chamado por `ctx.contribution.params.chamadoId`.
O roteiro `fatia4.testar.mjs` prova escolha única, alçada, aprovação/recusa e envio real
simulado ou nota sem envio, travas de status/visita, SLA, prestadores e configuração.
Inclui dados hostis que não viram elementos, portal ausente/indisponível, demonstração
sem rede e capturas `test/bancada/capturas/fatia4-*.png` em claro, escuro e 390 px.

A regressão `test/ajustes.test.mjs` cobre os itens 1–6 do contrato 0.21.1,
contagem de requisições, leitura do valor escolhido, perfis, textos e menos cliques.
`test/integracao/real.cenarios.mjs` repete a escolha e o Salvar de quem paga/prioridade
contra o router e SQL reais do portal, e mede adicionar/escolher/remover (teto de três).
Veja [test/integracao/LEIA-ME.md](test/integracao/LEIA-ME.md). As saídas literais são entregues no resultado do nó.

## Instalar

```
extension_installs_probe_manifest  { manifesturl }                    → installable: true
extension_installs_install         { manifesturl, label,
                                     filters: { include: { userIds: [SEU_ID] } } }
```

Sempre restrito a você primeiro: a entrega é **imediata** para todo usuário que caia no filtro.

## Limites conhecidos

- Os itens de menu abrem em **tela cheia** (`mode: fullscreen`), desde a 0.2.0 — a 0.1.0 usava
  diálogo e a lista ficava espremida. **`size` não é aceito fora de `dialog`**: em `fullscreen` o
  campo tem de sair do manifest.
- `url` de item de menu **não aceita `#` nem query string**: cada tela é um arquivo próprio, e é
  por isso que não há SPA com rota por hash.
- Renomear campo usa `omni.forms.openDynamic`; onde ele não estiver disponível, a tela avisa em vez
  de falhar.

## Contexto

- Portal original: `base-conhecimento/clientes/william-imoveis/portal-taxas/` (cofre)
- Decisão que criou o portal: `william-imoveis-decisoes.md`, ADR-14
- Mecânica de extensões: vault DOCS, `Sistemas/Evotalks/Extensões/`

## Fotos do computador (0.21.1)

Nos modais Novo e Editar chamado, **Buscar na pasta** adiciona fotos do computador.
**Buscar fotos** continua consultando as últimas 50 mensagens do atendimento escolhido.
Os arquivos locais aparecem com prévia, nome, tamanho e remoção antes de salvar.

Aceita JPEG, PNG, WEBP e GIF, conferindo também os bytes iniciais e a decodificação.
São até **10 arquivos por seleção**, **20 pendentes** e **25 MB por arquivo original**.
O navegador reduz o lado maior a 1600 px, sem ampliar, e recodifica em JPEG 0,82
(transparência sobre branco). Acima de 1,5 MB, tenta qualidade 0,7 e depois 1280 px;
se ainda exceder, informa a recusa por arquivo. GIF animado vira uma foto estática.
A redução evita enviar originais grandes pelo proxy do SDK, que limita as requisições.

Primeiro grava o chamado e as referências do chat; depois envia as fotos locais,
uma por vez, com progresso e bloqueio de cliques. Se uma falhar, as demais continuam:
o formulário permanece em edição do chamado salvo, preservando as que falharam.
Repetir envia os pendentes; o portal reconhece os mesmos bytes e não duplica o anexo.
A cota local compartilhada de 30 requisições/minuto bloqueia o transporte antes de
exceder o limite, informa a espera e mantém as fotos para nova tentativa. A plataforma
também aplica a cota da instalação/usuário, inclusive entre documentos diferentes.

Requer as rotas do portal **POST /api/ext/chamados/:id/anexos/upload**
(`nome`, `mimetype`, `dados_base64` sem prefixo e `miniatura_base64` opcional) e
**GET /api/ext/chamados/:id/anexos/:aid/arquivo**. O portal valida novamente os tipos,
bytes iniciais, base64 estrito, até 2 MiB decodificados e 20 uploads por chamado;
a rota de upload aceita corpo JSON até 3 MB. Só a leitura do arquivo carrega a foto inteira;
o detalhe devolve metadados e miniaturas; listas continuam sem bytes. As fotos do computador ficam no portal, pois
o SDK não oferece upload de arquivo. Sem portal conectado, nenhuma foto é enviada.

As fotos locais enviam também uma miniatura JPEG de até 160 px e 30 KB, incluída no detalhe do chamado.
Abrir Editar usa essas miniaturas; fotos antigas sem miniatura mostram o nome em um quadro neutro.
Clique para ampliar dentro do modal: só então a foto inteira é consultada, com proteção contra cliques repetidos.

Provas locais: `test/fotos.test.mjs`, `test/fotos-portal.test.mjs`, helpers em
`test/manutencao.test.mjs` e cenários `test/bancada/fotos.cenarios.mjs`, executados
pela bancada de chamados. As imagens são geradas por canvas no próprio teste,
escolhidas pelo CDP e removidas no final. As capturas `fotos-*.png` ficam em
`test/bancada/capturas/`. Nenhuma imagem real é usada.

## Integração real

`PORTAL_DIR=/caminho/gestao-imoveis-portal-fotos node test/integracao/real.mjs`
executa os cenários de ouro no Chromium contra o router e schema originais do
portal, com PGlite em memória e SDK simulado. Não altera o portal nem acessa
instâncias; usa somente dados e imagens sintéticos. Sem portal disponível,
imprime aviso e pula. A bancada aceita `PORTAL_REAL_URL` para encaminhar a API
sem reescrever respostas. Instruções, limites da prova e fricções observadas em
[test/integracao/LEIA-ME.md](test/integracao/LEIA-ME.md).

O cockpit atende tipos 0, 1 e 2. Locados, Chamados e Prestadores continuam apenas
para administrador e usuário 531. O atendente consulta dados, fotos e observações no cockpit,
abre chamado vinculado ao chat e registra notas/avisos quando a escrita está
habilitada; **Gestão** abre a edição completa no diálogo para os três perfis. A escrita está habilitada por padrão.

## Vínculos no cockpit (0.22.0)

Atendente, supervisor e administrador podem **Vincular residência** ao contato da
conversa. Busque por código, título ou bairro (300 ms, até oito resultados), ou use
**Não está no catálogo**. Só o título é obrigatório fora do catálogo; contrato é opcional.
A confirmação mostra imóvel e contato antes do POST, sempre como locatário.
Com locação existente, **Vincular outra residência** mantém a consulta no mesmo cockpit.
Demonstração e portal ausente/indisponível desabilitam o vínculo. Uma releitura recusada
após gravar não repete o POST. Locados, Chamados e Prestadores seguem para administrador e usuário 531.

Regressões: `test/vinculos.test.mjs`, cenários F10 nas bancadas de chamados e cockpit,
e integração com histórico encerrado e criação de locação no PGlite do portal real.

## Gestão da O.S. no atendimento (0.23.0, Parte G)

A entrada fixa **Chamados de manutenção** no menu do atendimento e o botão **Gestão**
do cockpit abrem `gi-os` (`chatMenu`, diálogo `xl`, perfis `[0,1,2]`). A edição é inline,
compartilhada com a gestão administrativa por `app/chamado-form.js`: status imediato,
dados alterados, atendimento, fotos do chat/pasta, orçamentos, aprovação, notas/avisos
e histórico. **Voltar à lista** consulta os chamados do contato selecionado; **Fechar**
usa `omni.ui.close()`. Novo chamado já recebe esse contato e a locação única, quando existir.

O alvo vem primeiro de `contribution.params.chamadoId`; o segundo canal é `gi-os-alvo`
no storage, com `{ chamadoId, contatoId, em }`, inteiros positivos e validade de 60 s.
A chave é removida após a leitura, inclusive quando vencida ou com params presentes.
Sem alvo, a página lista o contato do atendimento; troca de atendimento invalida respostas
pendentes. Sem portal, a página bloqueia gravações; demonstração usa dados sintéticos sem rede.

Use `omni.ui.openContribution('gi-os', params)`. O `openHtml` não funciona nesta instalação:
sem prefixo de versão o host recusa a URL; com prefixo o recurso retorna 404. Abrir o
item administrativo `gi-chamados` como atendente resulta em `not_found`, pois ele continua
restrito aos ids `[1,515,528,531]`. A visibilidade do diálogo permite os três perfis e não altera as regras
de gravação do portal. O portal não recebeu mudanças.

`test/bancada/os.testar.mjs` prova parâmetros, storage, lista/novo por contato, edição por
atendente, erros, demonstração, isolamento e perfis; capturas `os-*.png` em 1280/390 px,
claro/escuro. O cenário F11 da integração real confere as gravações no PGlite.
As melhorias de usabilidade da Parte C seguem em outra etapa.


## Cockpit 2 (0.23.0, Parte C)

O cabeçalho filtra por Abertos, Atrasados, Aguardando proprietário e Emergências.
Os chips e a busca por título/O.S. combinam os filtros; a lista mostra dez por vez,
prioriza o vínculo com o chat atual e mantém a ordem por urgência. ⟳ ignora os caches;
a idade da última leitura aparece junto ao resumo. Um contato já visto pinta a consulta
anterior enquanto o portal responde; erros transitórios não viram snapshot. Qualquer
POST invalida o snapshot daquele contato e as gravações seguem uma fila única.
`GI.invalidarSnapshots()` compartilha a invalidação após gravações no portal, inclusive as feitas no diálogo da O.S.; falha do storage não interrompe a gravação.

Quando a escrita está habilitada, o detalhe permite editar status, prioridade,
atendente, pagador e visita, com retorno na linha e rollback em recusas. Cancelamento
pede confirmação e motivo opcional. Cada campo custa uma requisição de gravação;
não há releitura da lista. A nota para a equipe continua em Fotos e observações.
Gestão abre o mesmo diálogo completo da Parte G, em todos os perfis.

As ações incluem copiar protocolo/resumo em texto puro, vincular o atendimento e
Avisar cliente, com texto editável, confirmação, checagem de chat aberto e proteção
da janela de envio. Um aviso enviado não se repete ao tentar novamente salvar sua nota.
A cópia usa `document.execCommand('copy')`, compatível com o iframe do host.

O cartão Imóvel oferece pessoas, telefones, endereço e código para copiar. A abertura
de chamados começa somente pela aba Novo do topo; com múltiplas residências, a escolha no Novo é explícita. No Novo, Mais detalhes recolhe os campos
secundários e Usar última mensagem do cliente sugere a descrição, editável. A categoria
sugere apenas o placeholder do título. Após criar: Gestão, copiar resumo e voltar à lista.
Esc volta/fecha o estado aberto; Enter confirma campos de uma linha. Claro/escuro e
260/300/334 px são exercitados na bancada, com capturas dos novos estados.

Regressões: `test/cockpit2.test.mjs`, `test/bancada/cockpit2.cenarios.mjs` (incluído no
runner do cockpit) e cenário F12 da integração real com conferência em PGlite.
Saídas literais são entregues no resultado do nó, sem arquivos de evidência versionados.

### Lote 1 — dados, feedback e cota (0.23.0)

O cockpit e o formulário compartilhado normalizam ids, nomes, telefone, canal, protocolo,
filas e datas antes de gravar no portal. Imóveis do catálogo levam uma reserva do título,
tipo, bairro e cidade; o cabeçalho de autoria usa texto Latin1 sem controles. Valores
aceitam `1.500,00`, `1500,00`, `1500.00` e `R$ 1.500,00`.

As ações mostram faixa de sucesso/erro e toast; no formulário, o rodapé repete o recado.
Erros persistem até fechar ou outra ação, sucessos somem em 8 segundos. A criação cuja
resposta se perde confere título, atendimento e criação nos últimos 3 minutos antes de
permitir repetir. Se a conferência também falhar, consulte a lista antes de outra abertura.
WebChat permite aviso ao cliente; janela fechada preserva a nota interna.

Um snapshot fresco evita consultar o contato novamente. Na primeira consulta, a locação
é conhecida antes de pedir chamados, evitando a chamada para contatos sem residência.
Com existência de locação já conhecida, ambas as leituras são iniciadas em paralelo.
A atualização manual exige intervalo de 5 segundos. A edição usa três chamadas ao portal
(além de `/info` na abertura da contribuição); prévias do SDK usam fila de quatro.
Antes de enviar muitas fotos, o formulário conta requisições e pede confirmação acima
de dez pendentes. O envio mostra progresso, permite cancelar as restantes e confirma
Fechar/Esc sem travar o formulário até terminar o lote.

`test/bancada/lote1.cenarios.mjs` é compartilhado pela bancada do cockpit e pela integração
com o portal real em memória. Também pode ser executado isoladamente com
`node test/bancada/lote1.testar.mjs`. As provas usam somente fixtures sintéticas.


### Lote 2 — perfis e fluxos sem impeditivos (0.23.0)

`cockpitAbreChamado` tem padrão `true`. Desligado, oculta Novo e a
edição rápida; a consulta e Gestão em diálogo continuam, com uma linha neutra sobre
a configuração. Sem contato, o cockpit orienta o caminho Sem contato cadastrado →
Adicionar dados a contato existente. Portal fora/local orienta conferir URL/token;
Tentar novamente refaz `/info`. Todas as telas exibem faixa vermelha persistente
“DEMONSTRAÇÃO · dados fictícios” quando a demonstração está ligada.

Os chamados incluem todas as residências do contato, com etiqueta do imóvel e filtro
Todas / imóvel. Título e contrato identificam a residência; no Novo, havendo mais de
uma, é obrigatório escolher explicitamente antes de preencher e confirmar a abertura.
Um conflito de imóvel já locado apresenta contrato e contatos atuais e oferece
Adicionar este contato à locação, com confirmação. A extensão relê a locação e envia
sua lista completa, acrescentando somente o locatário; preserva contrato e pessoas.
Esse vínculo funciona mesmo com a abertura de chamados desligada.

Chamados concluídos/cancelados oferecem somente o estado atual e **Reabrir (volta
para Triagem)** no cockpit e na gestão. O retorno do portal atualiza selo e prazo;
um 409 explica usar Reabrir e restaura o seletor. Aprovação pendente orienta
Gestão → Aprovação e oferece Gestão na própria linha da edição rápida.

`startedAt` e `lastMessageAt` do SDK são segundos Unix. `GI.dataDoChat` normaliza
segundos, milissegundos e ISO com fuso para ISO, aceitando apenas os anos 2000–2100.
Valores inválidos/zero e datas legadas em 1970 são desconhecidos na exibição;
a extensão não reescreve o dado legado do portal. Veja [api-omni-nota.md](api-omni-nota.md).

Regressões em `test/impeditivos.test.mjs`, `test/hotfix.test.mjs` e
`test/bancada/impeditivos.cenarios.mjs`, compartilhadas por cockpit e integração real.
Há 48 capturas de estados novos em 260/300/334 px claro/escuro por execução, incluindo
reabertura, aprovação e inclusão na locação. Runner isolado:
`node test/bancada/impeditivos.testar.mjs`.

### Liberação temporária da gestão (id 531)

A 0.23.0 preserva a liberação do hotfix 0.22.1: Locados, Chamados e Prestadores
usam `visibility.userIds: [1,515,528,531]`, sem `userTypes`. A navegação e Lista
completa usam o helper único `GI.gestor()` e `GI.GESTORES_EXTRA = [531]` em
`app/comum.js`. O usuário 600 atendente/supervisor não ganha esse acesso. O diálogo
`gi-os` continua disponível aos perfis `[0,1,2]`. Para revogar a exceção, esvazie
`GI.GESTORES_EXTRA` e substitua os três filtros por `visibility.userTypes: [0]`,
ajustando junto o verificador e os testes.

Patch 0.23.1: o cockpit relê silenciosamente escritas de outras telas, preserva o rascunho e exibe um único ícone nos recados.

0.24.0: botão Editar inline na O.S., grade de fotos selecionáveis e erros de rede legíveis com rascunho preservado. Escritas usam timeout de 30 s (leituras, 20 s); o host pode abortar antes e devolver status 0.

### Fidelidade ao desenho

`node test/fidelidade/comparar.mjs` mede os nove recortes da extensão contra
`~/design/tela.html` **lido ao vivo** (`TELA_HTML` sobrescreve o caminho). Usa o
Chromium já instalado da bancada, sem npm, rede externa ou instância. Exemplos:

```sh
node test/fidelidade/comparar.mjs lista modal
node test/fidelidade/comparar.mjs --limite 0.5
node test/fidelidade/comparar.mjs lista --so-desenho --limite 0
node test/fidelidade/estrutural.mjs
node --test test/fidelidade.test.mjs
```

Relatórios JSON/Markdown, os PNGs e o mapa de calor vermelho ficam em
`test/fidelidade/saida/` (ignorado). Por padrão o comparador apenas mede; somente
`--limite` reprova por percentual. Tolerância: 8 por canal RGBA; diferenças de
tamanho contam integralmente na área sem cobertura, sem redimensionar imagens.
A autocomparação usa relatórios separados e não substitui a linha de base.

Os seletores `data-evox` identificam o cartão `.gi` nas páginas e `.gi-modal` nos
modais: o overlay, sombra fora da caixa, título e legenda do quadro não entram.
No cockpit recorta-se `.phone .panel`, excluindo barra e borda do host e a
legenda: o telefone mede 317 px; seu painel mede 315 px pelos dois pixels da
borda. O iframe da extensão tem 317 px; ambos os tamanhos ficam no relatório,
sem ajuste artificial. Scrollbars são ocultadas via CDP nas duas capturas.
O viewport de referência é descoberto pelo CSS do canvas (atualmente 1440 px,
cartões de 1360 px). As páginas da extensão usam a largura do cartão e sua
altura como viewport; os modais usam o viewport de 1360×1100, preservando a
rolagem interna real. O roteiro nunca aplica o CSS do desenho na extensão.

O fixture fixo em `test/fidelidade/dados-desenho.json` contém somente textos,
valores e células extraídos do desenho, sem HTML/CSS. `fixture-desenho.mjs` faz a
tradução para o contrato do portal de mentira e do host (`?fixture=desenho`);
`test/fidelidade.test.mjs` aponta cada valor que sumiu quando o desenho muda.
Relógio: 17/10/2026 20:41 em Brasília, injetado antes dos scripts; dedução e
inconsistências ficam no fixture e no relatório. Intervalos ficam congelados e
timeouts funcionais continuam ativos. Não se inventam imóveis, campos ou fotos
para completar contagens ilustrativas do desenho.

Estados que a versão atual não consegue reproduzir recebem `alcancavel: false`
e motivo explícito. Confirmação e sucesso simultâneos não existem na 0.24.0:
a confirmação é comparada e o sucesso OS-1052 ganha PNG suplementar. Somente o
botão final “Abrir chamado” do cockpit Chamados é mascarado, por pedido explícito;
o JSON informa seletor, coordenadas e quantidade de pixels excluídos. Os testes
provam autocomparação 0%, sensibilidade a deslocamento real de 1 px, tolerância,
máscara e penalização por tamanhos diferentes. Nenhum teste antigo é alterado.
