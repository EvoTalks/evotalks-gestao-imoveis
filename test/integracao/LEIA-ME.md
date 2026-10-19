# Integração real

```bash
PORTAL_DIR=/caminho/gestao-imoveis-portal-fotos node test/integracao/real.mjs
```

Sem `PORTAL_DIR`, usa `~/.worktrees/gestao-imoveis-portal-fotos`. Se o código/schema
não existir, imprime AVISO e pula com saída zero. As dependências já instaladas
são resolvidas a partir do portal; não instale pacotes nesta extensão.

`portal-real.mjs` lê `app/api.js`, `app/db.js` e `schema.sql` originais. Aplica o
schema num PGlite em memória e injeta o adaptador `query/connect/release` usado
por `app/test/chamados.test.js` do portal. Monta `criarRouter(token)` em `/api/ext`
num Express em loopback. Nada é gravado no portal, no seu banco ou no catálogo.
A única fixture SQL inicial é uma saída de anúncio sintética. Locações, chamados,
orçamentos, fotos e notas dos cenários de ouro nascem pelas telas.

A bancada usa `PORTAL_REAL_URL=http://127.0.0.1:PORTA` para encaminhar `/api/ext/`
ao router real, preservando query, bearer/autoria, corpo e status. Também aceita
`criarServidor({portalRealUrl})`, usado pelo executor dos cenários. O endereço é
a origem local (sem `/api/ext`). Sem essa opção continua usando o simulador.
O SDK permanece simulado, incluindo contatos, chats, permissões e envio; nenhuma
instância é acessada. CSP e o transporte do stub bloqueiam rede externa.

Os cenários a–i, F9 e F11 conferem estado na API ou no SQL real, inclusive as miniaturas,
o texto/chat exatos dos avisos e o vínculo do atendimento na criação pelo cockpit.
A consulta direta ao SQL não consome o transporte da extensão. Cada cenário
imprime requisições ao router (incluindo recusas e releituras) e cliques, e falha
acima de 30 requisições. O cenário F9 mais extenso usa até 23/30. O limite é aferido por cenário;
a suíte acelerada com SDK simulado não mede a cota do host entre documentos.
Os testes existentes da cota continuam provando o bloqueio antes da 31ª chamada.
Os cliques contados são chamadas a `b.clicar`; digitação, navegação entre páginas
e seleções de campo pelo teclado/CDP não entram nessa contagem.

Capturas: `../bancada/capturas/integracao-*.png`, ignoradas pelo Git. Incluem fotos
em chamado aberto/concluído, gestão, criação/confirmação/sucesso no cockpit e
atendente em 260/300/334 px, claro/escuro. PNG e JPEG são gerados em canvas; os
arquivos temporários ficam dentro desta worktree e são apagados no `finally`.
O teste recusa exceções no Chromium. As recusas artificiais ficam exclusivamente
na bancada sintética, incluindo resposta atrasada após troca de chat, janela
encerrada, falha no registro depois do envio e falha de releitura após salvar.

A comparação com o real encontrou uma diferença no simulador: escolher novamente
o orçamento atual reiniciava a aprovação e criava eventos. O real é idempotente,
preservando até uma recusa anterior. O simulador foi alinhado e um teste executa
a mesma sequência contra os dois. Na 0.21.1, o simulador também rejeita a escrita
do valor de orçamento escolhido, recalcula a aprovação ao mudar quem paga, recusa
aprovar uma cotação recusada e não cria atualização vazia. O portal é somente leitura
nesta frente; a integração verifica a resposta do código real já existente.

F9 prova salvar quem paga = proprietário **depois** da escolha, mudar prioridade,
salvar sem mudanças (zero POST) e status independente do rascunho. Adicionar,
escolher e remover orçamento têm contagem própria: no máximo três requisições,
exatamente uma releitura do chamado, sem POST vazio nem GET da lista. A aprovação
registra os padrões “Proprietário” e “WhatsApp” sem campos redundantes.

## Vínculos 0.22.0

Atendimentos são escolhidos no histórico do contato, incluindo encerrados, com
paginação local, cache e fallback para os abertos do SDK. Vínculos legados por
protocolo continuam legíveis. A integração escolhe um encerrado e confere seus
metadados no banco real antes de retornar ao aberto usado nas provas de mensagens.
O cockpit vincula imóvel de catálogo e avulso ao contato, sempre como locatário,
sem alterar o portal. As bancadas cobrem erros, rede bloqueada, troca de contato,
idempotência após releitura recusada e capturas 260/300/334 px claro/escuro.

Permissões são exercitadas com `getPermissions()` simulado: agente e supervisor
consultam/abrem no cockpit e acessam a gestão da O.S. no diálogo; administrador e usuário 531 mantêm Lista completa. O manifest reserva
Locados/Chamados/Prestadores aos ids `[1,515,528,531]` e libera cockpit e diálogo `gi-os` a `[0,1,2]`. Isso prova
a apresentação local; não equivale a autenticar um atendente numa instância.

## Verificação

```bash
node --test test/*.test.mjs
node test/checar.mjs
node test/bancada/testar.mjs
node test/bancada/chamados.testar.mjs
node test/bancada/fatia4.testar.mjs
node test/bancada/cockpit.testar.mjs
node test/bancada/os.testar.mjs
PORTAL_DIR=/caminho/gestao-imoveis-portal-fotos node test/integracao/real.mjs
```

`test/integracao-real.test.mjs` também confere autenticação/autoria pelo proxy,
SQL real, ausência do portal com aviso e paridade da escolha idempotente, do bloqueio
do valor escolhido, da alçada depois da escolha e da alteração vazia.
`test/integracao-proxy.test.mjs` prova encaminhamento sem reescrita e preservação
dos estáticos/SDK. As saídas literais constam do resultado do nó.

## Diálogo 0.23.0 — Parte G

O cenário **F11 atendente edita a O.S. pela gestão do diálogo** clica em Gestão no cockpit,
abre `app/os.html` pela contribuição `gi-os`, altera status e prioridade, salva nota e
orçamento, confere cada resultado no SQL real e fecha pelo SDK. São 18/30 requisições
no cenário, com os perfis do SDK simulados; não acessa nenhuma instância.
A edição compartilha o mesmo módulo usado na tela administrativa. Captura:
`../bancada/capturas/integracao-f11-dialogo.png`.

`openHtml` foi recusado pelo host ou terminou em 404 com prefixo de versão na instalação
observada. A abertura usa `openContribution('gi-os', params)` e visibility `[0,1,2]`;
`gi-chamados` usa os ids `[1,515,528,531]` e daria `not_found` para atendentes. O canal alternativo
`gi-os-alvo` é validado, expira em 60 s e é removido após ler. Sua expiração, dados inválidos,
params vazios, falhas e troca de chat são provados na bancada `os.testar.mjs`.

As saídas literais são entregues no resultado do nó.


## Cockpit 2 — Parte C (0.23.0)

O cenário **F12 edição rápida e vínculo no cockpit com banco real** cria uma O.S.
sintética e, como atendente, grava status, prioridade, responsável, quem paga e
visita. Cada campo usa exatamente 1 requisição; o vínculo do chat também custa 1.
Confere os campos diretamente nas tabelas reais do PGlite, o selo Este atendimento,
o aviso editado e sua nota com notificou_cliente=true. O cenário usa 11/30 consultas,
sem mudar arquivos ou dados persistentes do portal. Captura:
`../bancada/capturas/integracao-f12-edicao-rapida.png`.

O runner do cockpit acrescenta os testes de cache opcional por contato, cópia,
filtros, cancelamento, recusas, janela encerrada e capturas dos estados novos.
As saídas literais são entregues no resultado do nó.
O validador genérico conserva os mesmos 17 erros/11 avisos já comparados com a base
na evidência F11 (ícones nativos e convenções anteriores), sem diagnóstico novo da Parte C.

Lote 1: os cenários compartilhados de `../bancada/lote1.cenarios.mjs` (na bancada,
`lote1.cenarios.mjs`) exercitam dados numéricos/nulos, contato sem nome, imóvel fora do
espelho, autoria com emoji, histórico sem ISO, valor brasileiro, resposta do POST perdida,
faixa/toast/rodapé e erro hostil, nota WebChat e janela fechada, cinquenta prévias em fila
de quatro, doze fotos com confirmação/cancelamento e limite de requisições, snapshot
sem rede, atualização limitada e falhas de inicialização. O portal de bancada valida texto,
ids seguros e datas com fuso com os mesmos nomes de campos do portal real.
As expectativas anteriores de duas consultas sem residência, atualização automática de
snapshot fresco, código cru de erro e texto antigo da janela foram atualizadas conforme
este lote; as provas de gravação, preservação de rascunho e isolamento continuam.


## Lote 2 — impeditivos (F14)

`impeditivos.cenarios.mjs` é executado tanto pelo runner do cockpit quanto pela
integração real. Cobre ausência de contato, portal fora/local com retry real de
`/info`, consulta sem escrita, supervisor/531/600, duas residências com chamados,
escolha explícita no Novo, segundos Unix, reabertura e 409, aprovação pendente e
inclusão do contato na locação existente preservando todas as pessoas e o contrato.
No portal real, a data gravada e a lista de contatos são conferidas no PGlite.
Dado legado de 1970 permanece inalterado no banco e não aparece como data na tela.

Capturas `f14-*.png` / `real-f14-*.png`: 48 estados por execução em 260/300/334 px,
claro/escuro, incluindo reabertura, aprovação e conflito de locação. A faixa de
DEMONSTRAÇÃO é vermelha e persistente em todas as telas. O stub inclui segundos,
ms, ISO, zero, null e texto inválido; a API estrita recusa início fora de 2000–2100.
As alterações de expectativas anteriores exigem escolha explícita de imóvel,
restringem status terminal a Reabrir e preservam as demais provas de cada fluxo.

Rodada isolada: `node test/bancada/impeditivos.testar.mjs`.
As saídas literais são entregues no resultado do nó; não versionar logs de evidência.
