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

Os cenários a–i conferem estado na API ou no SQL real, inclusive as miniaturas,
o texto/chat exatos dos avisos e o vínculo do atendimento na criação pelo cockpit.
A consulta direta ao SQL não consome o transporte da extensão. Cada cenário
imprime requisições ao router (incluindo recusas e releituras) e cliques, e falha
acima de 30 requisições. O maior cenário usa 24/30. O limite é aferido por cenário;
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
a mesma sequência contra os dois. Nenhum defeito do portal foi encontrado nos
cenários exercitados; seu código permanece inalterado.

## Fricções

Leitura das capturas de gestão e cockpit, incluindo as seis combinações de tema e
largura. As quantidades abaixo descrevem o roteiro mínimo a partir da tela aberta;
seleções de cliente/imóvel continuam exigindo a digitação e a escolha do resultado.

| Fluxo observado | Fricção e correção sugerida |
|---|---|
| Atendente abre chamado: Novo → Revisar → Conferi → Abrir, 4 cliques | A confirmação e a caixa “Conferi” repetem a revisão. Avaliar retirar só a caixa, mantendo resumo e confirmação explícita. Não alterado nesta frente. |
| Atendente avisa o cliente: Fotos e observações → Avisar → Salvar → Confirmar, 4 cliques (mais 1 se o chamado estiver recolhido) | Nota e mensagem compartilham a mesma área. Avaliar ações separadas “Nota interna” e “Avisar cliente”, mantendo confirmação de envio. |
| Cadastro por candidata: Candidatas → imóvel → contato → Salvar, 4 cliques | O candidato precisa de um locatário selecionado. Sugerir iniciar o cadastro pelo contato quando ele já estiver conhecido. |
| Novo chamado na gestão: Novo → contato → atendimento → Salvar, 4 cliques, além da seleção do imóvel | Cliente e imóvel são necessários; título também é obrigatório. Se há só uma locação, ela poderia vir selecionada. Preservados os seletores e as validações atuais. |
| Aprovação e visita: cenário completo com 8 cliques e 24/30 requisições | Reabrir o modal para conferir alterações repete consultas de configuração/prestadores/lista. Avaliar cache curto e atualização da seção após salvar, com invalidação após escrita. |
| Aprovação e visita em “Mais opções” | A faixa “Registrar decisão” leva à seção, mas a visita continua exigindo abrir as opções e rolar. Avaliar seção própria de agendamento quando a decisão estiver aprovada. |
| Cadastro do orçamento | Só o nome do prestador é obrigatório; valor e descrição são opcionais. Nenhum campo obrigatório redundante encontrado aqui. Dois nomes com caixa/acento diferentes geram um único prestador. |
| Cockpit estreito com muitas observações | A leitura é vertical e longa, especialmente após ampliar a foto. Avaliar últimas notas primeiro e expansão do restante; manter acesso a todo o histórico. Sem rolagem horizontal nas capturas. |
| Rascunho de nota ao trocar aba/chat | O rascunho não é persistido. Avaliar guardar rascunhos por chat/chamado ou avisar antes de sair. Nunca reaproveitar texto no contato seguinte. |
| Fotos e observações carregadas sob demanda | Exigem um clique adicional, mas evitam uma consulta por chamado na abertura do cockpit. Há mensagem de carregamento, erro com nova tentativa e respeito à cota. |
| Configuração desligada | Atendente só consulta, e Novo explica que a abertura está desligada. Para habilitar é necessária a configuração pelo administrador; não há atalho para gestão no perfil do atendente. |
| Cabeçalho das outras telas | Corrigido: os atalhos internos de Locados, Chamados e Prestadores também somem para atendente/supervisor; `GI.abrirTela` recusa abrir essas contribuições nesses perfis. |
| Texto técnico e orientação impossível | Corrigidos: “SLA” aparece como “Prazo”; ausência de locação orienta pedir cadastro ao administrador; fotos não mandam o atendente para gestão; atalhos da gestão somem também após criar o chamado. |
| Espera de cota e envio recusado | A cota informa aguardar cerca de um minuto. A janela encerrada salva a nota para a equipe e informa que o cliente não foi avisado. Falha no registro após envio permite repetir sem duplicar a mensagem. |

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
SQL real, ausência do portal com aviso e paridade da escolha idempotente.
`test/integracao-proxy.test.mjs` prova encaminhamento sem reescrita e preservação
dos estáticos/SDK. A saída final fica em `evidencia.txt`.
