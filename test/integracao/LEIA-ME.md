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

Os cenários a–i e F9 conferem estado na API ou no SQL real, inclusive as miniaturas,
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
nesta frente; o executor P8 trata a atualização vazia no código real.

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
consultam/abrem no cockpit, administrador mantém seu atalho. O manifest reserva
Locados/Chamados/Prestadores a `[0]` e libera só o cockpit a `[0,1,2]`. Isso prova
a apresentação local; não equivale a autenticar um atendente numa instância.

## Verificação

```bash
node --test test/*.test.mjs
node test/checar.mjs
node test/bancada/testar.mjs
node test/bancada/chamados.testar.mjs
node test/bancada/fatia4.testar.mjs
node test/bancada/cockpit.testar.mjs
PORTAL_DIR=/caminho/gestao-imoveis-portal-fotos node test/integracao/real.mjs
```

`test/integracao-real.test.mjs` também confere autenticação/autoria pelo proxy,
SQL real, ausência do portal com aviso e paridade da escolha idempotente, do bloqueio
do valor escolhido, da alçada depois da escolha e da alteração vazia.
`test/integracao-proxy.test.mjs` prova encaminhamento sem reescrita e preservação
dos estáticos/SDK. A saída literal consolidada da 0.22.0 está em `../evidencia-f10.txt`.
`../evidencia-f9.txt` e `evidencia.txt` preservam as rodadas anteriores.
