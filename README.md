# Gerenciamento de Imóveis — 0.33.2

Quatro telas: Imóveis, Campos, Histórico e Configurações.
Ordens de serviço estão na extensão `evotalks.ordens-servico`.

## 0.30.0 — Capas e situação

A lista mostra miniaturas de capa (72×54), com placeholder sem imagem. As capas são consultadas uma vez por código enquanto a tela permanece aberta. Situação acompanha Ver Imóveis, sem coluna própria em Permissões.

### Situação no formulário de edição

A situação do imóvel aparece no início do modal Editar e pode ser alterada por usuários
com acesso a Imóveis (`ver_imoveis`). Atualizar grava a situação e os campos adicionais;
falhas mantêm o formulário aberto com os valores digitados.

## 0.29.0 — Detalhe completo do imóvel

Os filtros de Imóveis ficam alinhados, sem a nota sobre a assistente. Clique no código ou
título (também por Enter/Espaço) para conferir o detalhe somente leitura, em janela central
com metade da largura e rolagem interna. Em telas estreitas ela ocupa quase toda a largura.
O card principal mantém identificação, foto principal grande, miniaturas, descrição,
características do site e catálogo. Um segundo card, com cerca de 23% da tela, fica à
direita sem deslocar o principal: Situação, Valores e Informações adicionais (inclusive
vazios). Cada card tem rolagem própria; abaixo de 1100 px o adendo fica embaixo e os dois
compartilham a rolagem. Ambos fecham juntos, sem repetir valores ou campos internos no
principal. Valores do portal são centavos; fotos e links aceitam
somente HTTP/HTTPS. O detalhe consulta `/imovel/:codigo` uma vez e mantém cache por código
até sair da tela. Sem portal ou em caso de erro, conserva os dados disponíveis e avisa.
Editar e Situação mantêm suas ações próprias. Feche por ×, Esc ou clique no fundo.

Validação: `node --test test/*.test.mjs`, `node test/checar.mjs` e todas as bancadas
`test/bancada/*.testar.mjs`. A nova `detalhe.testar.mjs` prova filtros, teclado, dimensões,
rolagem, campos, cache, fallback e segurança; capturas em `test/bancada/capturas/detalhe-0290-1400-{claro,escuro}.png`.

## 0.28.0 — Permissões por usuário

Configurações → **Permissões** permite ao administrador buscar usuários pelo nome e
salvar somente as linhas alteradas. Os cinco acessos são Ver Imóveis, Editar imóveis,
Criar e editar campos, Ver Histórico e Ver Configurações. O portal
fornece os padrões: usuário novo vê e edita imóveis; os demais acessos começam negados.
Administradores (tipo 0) têm tudo marcado e travado. A alteração é gravada no portal e
vale nas próximas chamadas; cada página mantém sua consulta de permissões em memória.

As abas seguem os acessos; o menu do host continua disponível e o endereço direto
mostra “Sem acesso a esta tela. Peça ao administrador para liberar.” quando bloqueado.
Sem edição, os botões Editar/Excluir somem. Quem vê Imóveis pode alterar a Situação.
Modo local conserva os acessos liberados. Com portal configurado, falha ao consultar
permissões bloqueia os controles em vez de recorrer aos padrões locais.

As chamadas enviam `X-GI-User-Id` e `X-GI-User-Type`. **É controle de uso, não segurança**:
o portal confia na identidade declarada e quem tem seu token no navegador consegue
contornar as restrições. A tela traz esse limite de forma discreta. A lista de usuários
vem de `omni.users.list()` e a tela usa somente identificador, nome e perfil.

A bancada `test/bancada/permissoes.testar.mjs` cobre administrador e agente, padrões,
edição, situação, acesso direto, gravação seletiva, escape de HTML e recusas 403.

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

## Instalar

```
extension_installs_probe_manifest  { manifesturl }                    → installable: true
extension_installs_install         { manifesturl, label,
                                     filters: { include: { userIds: [SEU_ID] } } }
```

Sempre restrito a você primeiro: a entrega é **imediata** para todo usuário que caia no filtro.


## Arquivos e validação

`manifest.json` monta as quatro páginas HTML de `app/`. Todas usam `estilo.css`, `compartilhado.css` e `comum.js`; Imóveis também usa `visualizacao.css` e `visualizacao.js`. O ícone é `icone-casa.svg`.

Execute `node --test test/*.test.mjs`, `node test/checar.mjs` e cada `test/bancada/*.testar.mjs` com timeout de 280 segundos.

### Colunas (0.33.2)
Na tela Imóveis, **Colunas** define visibilidade, ordem, largura, alinhamento e texto vertical por usuário. Arraste cabeçalhos ou suas bordas; o funil filtra e ordena o catálogo inteiro. Filtros temporários ficam nesta sessão. Um campo Sim/Não pode ser marcado como **Fora da Williane** na tela Campos.

Na 0.33.1, separadores destacam as bordas dos cabeçalhos. Funções encerra a tabela com 104 px fixos e permanece visível durante a rolagem horizontal. O funil aplica classificação e seleção imediatamente; aparência e visibilidade continuam no botão Colunas.

Na 0.33.2, arrastar a borda direita de uma coluna muda só a largura dela, como no Excel: no primeiro movimento as larguras renderizadas são congeladas, as colunas à esquerda ficam paradas e a sobra vira um espaço vazio antes de Funções.
