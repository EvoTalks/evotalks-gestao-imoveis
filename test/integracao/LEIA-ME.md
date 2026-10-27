# Integração local

`node test/integracao/real.mjs` valida a persistência da situação pelo portal local de testes. Sem o repositório do portal, informa que a integração foi pulada. Defina `PORTAL_DIR` para habilitar.

Para colunas 0.33.0, rode `PORTAL_DIR=<worktree-do-portal> node test/integracao/colunas.mjs`.
Exige o portal da Parte 1, usa PGlite em memória e Chromium: layout por usuário,
recarga, valores em lote, edição Sim/Não e exclusão da busca da Williane.
Não acessa instância real nem grava no repositório do portal.
