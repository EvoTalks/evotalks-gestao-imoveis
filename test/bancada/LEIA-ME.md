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
