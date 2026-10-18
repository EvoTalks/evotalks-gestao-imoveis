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
manifest.json          identidade 0.21.0, config e contribuições
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
app/config.html       catálogo e configuração de manutenção
app/campos.html        definição dos campos
app/historico.html     eventos de edição
```

## Locações (0.18.0)

**Locados exigem o portal conectado**, com `portalUrl` e `portalToken` configurados e as
rotas `/api/ext/locacoes*` disponíveis. Locações nunca são gravadas em `omni.storage`.
Sem conexão, as telas avisam e bloqueiam as ações de locação.

A lista de **Imóveis** continua lendo o catálogo nativo (`products`). Uma leitura de
`/locacoes/mapa` acrescenta a coluna **Situação**: Disponível ou Locado, com contrato e
locatário. O filtro Situação vale **somente para a página atual**, assim como Estado.
A chave abre **Marcar como locado**; nos já locados, abre a edição da locação.

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

## Chamados e manutenção (0.21.0)

As contribuições **Locados**, **Chamados**, **Prestadores** e **Manutenção** no atendimento são
visíveis somente para administradores (`userTypes: [0]`). Imóveis, Campos, Histórico e
Configurações continuam herdando a visibilidade do menu. Para abrir a manutenção a supervisores
e agentes, altere `userTypes` no manifest e publique uma nova versão.

Exigem o portal conectado e as rotas das Fatias 2 e 4 em `/api/ext`. Nenhum dado de
manutenção é gravado em `omni.storage`. Sem portal, as telas avisam e bloqueiam ações.
O imóvel é o ponto focal; a locação conserva seu snapshot e o contato é o vínculo.

**Chamados**: escolher o status na lista ou no modal grava na hora, atualiza a linha,
o prazo e o resumo. A recusa do portal devolve o seletor ao status anterior e explica
o motivo. Só **Cancelado** pede confirmação inline, com motivo opcional e **Voltar**.
Chamado encerrado reabre em Triagem pelo mesmo seletor. O **Salvar** cuida dos dados
e fotos, sem alterar status; rascunhos permanecem intactos durante a troca.
Fotos enviadas podem ser ampliadas inclusive em chamados encerrados; adicionar fotos
continua bloqueado nesses chamados.

No novo chamado, busque o cliente e escolha seu imóvel locado. **Escolher atendimento**
lista as conversas abertas do cliente acessíveis ao usuário, incluindo todas as filas
para supervisor ou administrador. Um único atendimento já vem escolhido. Em edição,
um clique grava o vínculo; **Tirar vínculo** o remove. A plataforma não lista encerrados:
nesses casos, use **Informar protocolo ou número do atendimento**.

**Orçamentos** aceita nome livre do prestador, valor opcional e descrição livre
(serviço, prazo e condições). O portal guarda o nome automaticamente e o reutiliza nas
sugestões. **Escolher** aplica direto; **Remover** pede um segundo clique na própria linha.

**Nota para a equipe** salva internamente sem confirmação. **Avisar o cliente no WhatsApp**
só fica disponível com atendimento vinculado e aberto daquele cliente. **Enviar ao cliente**
mostra o texto exato para um clique em **Enviar**. Só `sent:true` registra a nota enviada;
a falha mantém o texto. Se a mensagem sair e o registro falhar, repetir na mesma edição
tenta registrar sem reenviar.

**Mais opções**, fechado por padrão, reúne categoria, acesso, atendente, custos,
prestador responsável, visita, aprovação do proprietário e histórico. A faixa de aprovação
pendente ou recusada abre a decisão nesse bloco. As regras do portal continuam valendo:
aprovação pendente bloqueia Agendado/Em execução e Agendado exige visita.
Registrar decisão é interno; **Enviar ao proprietário** pede revisão da mensagem,
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
pessoa, e pode abrir a gestão. A escrita começa desligada (`cockpitAbreChamado: false`);
quando habilitada, abre chamado após revisão, vinculando o atendimento atual. O modo
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
`node test/bancada/cockpit.testar.mjs` e `node test/bancada/fatia4.testar.mjs`. Uso manual e cenários em
[test/bancada/LEIA-ME.md](test/bancada/LEIA-ME.md). A bancada tem portal em memória e
SDK sintético, isolados de qualquer instância real; os PNGs gerados não são versionados.
O teste `test/lote2.test.mjs` cobre falha de preenchidos, acordeão sem linhas neutras,
atualização sem cache, troca de chat antes do envio, mapas com chaves hostis,
confirmação de aviso e abertura do chamado por `ctx.contribution.params.chamadoId`.
O roteiro `fatia4.testar.mjs` prova escolha única, alçada, aprovação/recusa e envio real
simulado ou nota sem envio, travas de status/visita, SLA, prestadores e configuração.
Inclui dados hostis que não viram elementos, portal ausente/indisponível, demonstração
sem rede e capturas `test/bancada/capturas/fatia4-*.png` em claro, escuro e 390 px.

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

## Fotos do computador (0.21.0)

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
para administrador. O atendente consulta dados, fotos e observações no cockpit,
abre chamado vinculado ao chat e registra notas/avisos quando a escrita está
habilitada; não recebe atalhos da gestão. A escrita continua desligada por padrão.
