# Gerenciamento de Imóveis — extensão do EvoTalks

Porte do **portal de taxas do William Imóveis** para dentro do EvoTalks, como extensão nativa:
um menu superior **Gerenciamento de Imóveis** com **Imóveis**, **Locados**, **Campos**,
**Histórico** e **Configurações**.

Registra, por imóvel, informações que **não aparecem no site** (taxas, IPTU, encargos, observações
da administração) e que precisam chegar a quem atende.

| No portal (Docker + Postgres + n8n) | Aqui (extensão) |
|---|---|
| `/imoveis` + `/imovel/:codigo` | tela **Imóveis** — lista, filtros, 🟢/🟡 e o formulário de lançamento |
| `/api/ext/locacoes` | tela **Locados** — banco de locações, contatos, contratos, vigência e encerramento |
| `/campos` | tela **Campos** — os cinco tipos, recorrência padrão, ativar/desativar/apagar |
| `/historico` | tela **Histórico** — quem, quando, de → para, com filtros |
| `/consultas` | **removida na 0.3.0** — o que a IA consulta se vê no MCP do portal, não aqui |
| `/login`, `/usuarios`, CSRF, sessão | some: a extensão herda o usuário logado do EvoTalks |
| espelho Postgres + sync 6h + XML | some: o catálogo já está na instância (`products`) |

## Arquivos

```
manifest.json          identidade 0.18.0, config e contribuições
app/comum.js           SDK omni, persistência, catálogo, locações e formatação
app/locacao.js         modal compartilhado de cadastro/edição e encerramento de locações
app/estilo.css         tema por tokens --ext-* (segue a whitelabel da instância)
app/imoveis.html       lista + detalhe do imóvel
app/locados.html       banco de locados + filtros + candidatos que saíram do anúncio
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

Sem npm install: `node test/checar.mjs`, `node --test test/*.test.mjs` e
`node test/bancada/testar.mjs`. Uso manual e cenários em
[test/bancada/LEIA-ME.md](test/bancada/LEIA-ME.md). A bancada tem portal em memória e
SDK sintético, isolados de qualquer instância real; os PNGs gerados não são versionados.

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
