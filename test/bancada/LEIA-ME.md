# Bancada de Locados

Requer Node 22. Não há dependência npm, banco externo, Docker nem build.

```bash
node test/bancada/servidor.mjs
```

Abra `http://127.0.0.1:4178/app/locados.html` ou `/app/imoveis.html`.
`PORT=4180` troca a porta. O servidor escuta apenas no loopback.

O HTML recebe `omni-stub.js` somente nesta bancada. As telas publicadas não o referenciam.
O stub simula o perfil de agente, `ready`, `session`, `http.request`, `contacts.search`,
`data.request('products…')`, storage e `ui.openContribution`. `portal.bancada.invalid`
é um identificador sintético: o stub transforma as chamadas em requests ao próprio servidor.
Bearer e autoria também são sintéticos; não use nenhuma credencial real.
O stub recusa outros destinos e a CSP limita conexões ao próprio servidor.

O portal de mentira mantém tudo em memória e reiniciar o processo restaura as fixtures:
três imóveis do catálogo, duas pessoas fictícias, três locações (uma com prazo próximo,
outra vencida) e um imóvel que saiu do anúncio. Ele implementa listagem e filtros,
resumo, mapa, candidatas, detalhe com histórico, criação, edição, encerramento e
locações por contato de `/api/ext`. Também responde `/info`, `/campos` e `/preenchidos`
para abrir a lista nativa. As respostas extras de campos/valores são vazias.
Não substitui os testes SQL, MCP ou de transações do portal verdadeiro.

Variações para conferir manualmente:

- `?modo=local`: portal não configurado; ações de locação bloqueadas, sem gravação local.
- `?modo=fora`: portal indisponível; ações bloqueadas e aviso visível.
- `?tema=escuro`: tokens sintéticos escuros; combina com os parâmetros acima.
- Número do contrato `FORCAR-422`: devolve 422 para verificar preservação dos campos.
- Cadastrar de novo `DEMO-002`: devolve 409 por locação ativa.

Na tela Locados, crie um locado avulso, digite “Demonstração” no locatário e **selecione
um resultado**. O proprietário pode ser informado pelo nome. Para catálogo, use a chave
na lista de Imóveis ou o seletor e a busca no modal. A faixa dos candidatos abre a lista
dos imóveis que saíram do anúncio, com snapshot para cadastrar mesmo sem catálogo.

## Verificação automática

```bash
node test/checar.mjs
node --test test/*.test.mjs
node test/bancada/testar.mjs
```

O primeiro comando extrai scripts inline e usa `node --check` em cada um e em todos os
arquivos `.js`, `.mjs` e `.cjs`; falha com status diferente de zero se algum for inválido.
Ignora dependências e diretórios ocultos. Não precisa gerar arquivos temporários.
O teste do verificador injeta erros JS/inline e confere a saída não zero.
Os testes de `comum.js` provam a barreira sem portal, rotas e payloads, normalização dos
contatos e navegação. O teste da bancada HTTP prova o ciclo CRUD, filtros e recusas.

O último comando inicia servidor isolado em porta livre, abre Chromium headless e testa
as duas telas, sem pacote de automação. Usa o protocolo CDP e o WebSocket nativo do Node.
Detecta um Chromium instalado no sistema ou no cache Puppeteer desta máquina; para outro:

```bash
CHROMIUM_PATH=/caminho/do/chromium node test/bancada/testar.mjs
```

O perfil temporário fica nesta pasta e é removido ao terminar. `TMPDIR` relativo ao perfil
mantém os sockets Unix curtos e em disco; não usa o tmpfs. O modo de processo único evita
a falha de ownership de descritores dos subprocessos no sandbox desta máquina.

Os fluxos automatizados conferem lista, filtros, vencimentos, edição sem perder vínculos,
cadastro avulso e do catálogo, valor em centavos, contato selecionado, 422 e 409 sem perda
de dados, candidatos, encerramento com motivo, histórico, situação disponível após encerrar,
modo sem portal e portal fora, tema escuro e modal estreito, sem exceções no navegador.

Capturas ficam em `test/bancada/capturas/` e são ignoradas pelo Git:

- `01-locados.png`
- `02-erro-422-preservado.png`
- `03-imoveis-situacao.png`
- `04-marcar-catalogo.png`
- `05-encerradas.png`
- `06-sem-portal.png`
- `07-locados-escuro.png`
- `08-modal-estreito.png`


## Manutenção (0.20.0)

O manifest 0.20.0 declara `/app/chamados.html`, `/app/prestadores.html` e
`/app/painel.html` (contribuição `gi-cockpit`). As telas de gestão e o cockpit
estão implementados e cobertos pelas bancadas.

`portal-chamados.mjs` implementa todas as rotas das Fatias 2 e 4 em memória e compartilha
as locações do servidor. Há oito chamados (um de cada status, números 1001–1008),
quatro prestadores, uma aprovação pendente e um SLA vencido. O primeiro chamado é de
outro contato do mesmo imóvel. `chamados_abertos` nas locações tem contagem real.
Reiniciar o servidor restaura os dados; cada servidor tem seu próprio estado.
As recusas restauram o estado anterior da operação. Isso é uma simulação, não prova
as transações SQL do portal verdadeiro.

Convenções de URL (combináveis com `modo` e `tema`):

- `?chat=8801`: contato 9901 (duas locações); `8802`: contato 9902;
  `8803`: proprietário 9903; `8804`: atendimento sem contato; `0`: nenhum atendimento.
  Sem parâmetro, seleciona 8801.
- `?escrita=1`: liga `cockpitAbreChamado`. Sem ele, `false`.
- `?demonstracao=1`: liga `modoDemonstracao`. Sem ele, `false`. Nas páginas de
  manutenção, `GI.definirModo` não consulta `/info` e `GI.chamarPortal` recusa rede.
  O stub também bloqueia `fetch` e `omni.http.request`. O nó do cockpit deve prover
  os dados sintéticos da tela sem chamar o transporte. O aviso é fixo no documento.
- `?tema=escuro`: mantém os tokens escuros existentes.

SDK simulado: `chats.getSelected/get/listMine/listByQueue/getMessages/getFile/select/sendMessage`,
`users.list` (três agentes), `session.getUser`, `contacts.get/search` e
`on/off('omniChatSelected')`. `select` troca o atendimento e emite o evento.
O perfil padrão é agente; `listByQueue` rejeita com `forbidden` para ele, como o SDK.
`getMessages(chatId, {limit,before})` devolve texto e mídia com `fileRef`;
`getFile` resolve uma imagem sintética em data URL, sem rede.
Envios são apenas registrados em `bancada.mensagens` como `{chatId,payload}`.
`bancada.recusarEnvio = true` simula `forbidden` da janela de 24 horas.
`bancada.eventos`, `bancada.chamadas` e `bancada.rede` permitem verificar efeitos.
Nenhum envio alcança instância real.

Helpers públicos em `app/manutencao.js`:

- `GI.chamados(filtros)`, `chamadosObter`, `chamadosCriar`, `chamadosAtualizar`,
  `chamadosStatus(id,status,motivo)`, `chamadosNota(id,dados)`, `chamadosAnexos(id,anexos)`,
  `chamadosPorLocacao(id,filtros)`, `chamadosPorContato(id,filtros)`,
  `chamadosAtendimentosVinculados(contatoId)`.
- `GI.chamadosPrestador(id,prestadorId)`, `chamadosVisita(id,dados)`,
  `chamadosOrcamentoCriar(id,dados)`, `chamadosOrcamentoEscolher(id,orcamentoId)`,
  `chamadosOrcamentoApagar(id,orcamentoId)`, `chamadosAprovacao(id,dados)`.
- `GI.prestadores(filtros)`, `prestadoresCriar`, `prestadoresAtualizar`,
  `prestadoresAtivar`, `prestadoresDesativar`, `manutencaoConfig`, `manutencaoConfigSalvar`.
- `GI.CHAMADO_STATUS`, `CHAMADO_STATUS_CLASSES`, `CHAMADO_PRIORIDADES`,
  `CHAMADO_PRIORIDADE_CLASSES`, `CHAMADO_CATEGORIAS`, `CHAMADO_CATEGORIA_CLASSES`.
  Classes sem estilo na Fatia 1 (azul, cancelado, prioridade, categoria) devem ser
  definidas pelo nó visual nos seus CSS, derivadas de tokens `--ext-*`.
- Funções puras: `GI.chamadoNumero(numero)`, `chamadoPrazo(chamado,agora)`
  (agora em ISO, Date ou milissegundos), `chamadoTrilha(status)` (sete objetos
  `{status,rotulo,feito,atual,cancelado}`; cancelamento não infere status anteriores),
  `mascaraDocumento` e `mascaraTelefone`. Retornam dados/texto, nunca HTML.
  Todo consumidor que usa `innerHTML` continua obrigado a passar texto por `GI.escapar`.

`test/manutencao.test.mjs` valida helpers, sequência, recusas com rollback,
filtros, contatos do imóvel, vínculos, status, reabertura, orçamento escolhido,
alçada, aprovação, visita, prestadores, configuração e SLA com relógio controlado.
Também abre Chromium para verificar os esqueletos, o SDK, escrita desligada,
demonstração sem rede e larguras 260/300/334 px. O teste completo de Locados continua
em `node test/bancada/testar.mjs`.
