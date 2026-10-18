# Cobertura F6 — simplificação dos chamados

Contrato: itens 1 a 14 da seção EXTENSÃO de `william-simplificar/contrato.md`.
Somente bancada local, dados sintéticos e versão 0.21.0.

| Itens | Prova automatizada |
| --- | --- |
| 1 | `simplificar.cenarios.mjs`: faixa pendente e Registrar decisão abrem Mais opções; `fatia4.testar.mjs`: decisão aprovada/recusada e envio ao proprietário |
| 2 | `simplificar.cenarios.mjs`: um Salvar, dados antes de status, recusa mantém modal e informa dados salvos, cancelar com motivo, reabrir em Triagem |
| 3–4 | `simplificar.cenarios.mjs`: cliente/imóvel, título, prioridade, acesso/atendente em Mais opções e 422/409 preservando o digitado |
| 5 | `simplificar.cenarios.mjs`: lista por cliente, deduplicação mine/filas, supervisor/admin, vínculo imediato em edição, único automático no novo, tirar vínculo, manual só protocolo e falha de listagem |
| 6, 10 | `fotos.cenarios.mjs`: PNG/JPEG de canvas, redução, limites, nome hostil, chat+pasta, Salvar com status e fotos, sequência, falha parcial, cota e deduplicação; conclusão com upload recusado permite retry sem reabrir |
| 7 | `simplificar.cenarios.mjs`: prestador livre, descrição, sem valor, reaproveitamento/sugestão após 300 ms, escolha direta e remoção em dois cliques; unidades cobrem estimativa e inativos |
| 8 | `simplificar.cenarios.mjs` e `lote2.test.mjs`: nota interna direta, elegibilidade, texto/chat exatos, confirmação única, sent verdadeiro/falso/ausente, forbidden, chat encerrado e retry de registro sem novo envio |
| 9 | `simplificar.cenarios.mjs`: Mais opções fechado e aberto; `fatia4.testar.mjs`: custos, prestador e visita pelo Salvar, aprovação e histórico preservados |
| 11 | `simplificar.cenarios.mjs`: linha e resumo atualizam sem F5; recusa parcial atualiza dados por trás do modal; demais gravações e fechamento recarregam a lista |
| 12 | `simplificar.cenarios.mjs`: protocolos, mensagens, nomes e descrições hostis como texto; perfis; 260/300/334/390 px, claro/escuro, zero exceções; `portal-chamados.mjs`: nomes automáticos e valor null |
| 13 | `manutencao.test.mjs`: filtro/mesclagem por contato sem duplicar, apenas estados explicitamente abertos, texto e normalização do prestador |
| 14 | `checar.mjs` e `manutencao.test.mjs`: manifest 0.21.0 e todos os recursos/?v=; README atualizado |

Regressões verificadas antes da conclusão:

- Unidades novas no código anterior: `GI.mesclarAtendimentos is not a function` e `422 !== 201` para orçamento sem valor.
- Nova bancada com `app/chamados.js` do HEAD anterior: exit 1 em Mais opções ausente (`undefined !== false`). Código atual restaurado após a prova.
- Novo cenário concluir+upload com falha, antes da correção de retomada: modal não fechava no retry. Depois da correção, repete o upload mantendo Concluído.

Comandos de validação:

```bash
node --test test/*.test.mjs
node test/checar.mjs
node test/bancada/testar.mjs
node test/bancada/chamados.testar.mjs
node test/bancada/fatia4.testar.mjs
node test/bancada/cockpit.testar.mjs
```

Capturas locais (ignoradas pelo Git):
`capturas/simplificar-{novo,editar}-390-{claro,escuro}.png`, `fotos-*.png` e `fatia4-*.png`.
As quatro bancadas usam servidores e perfis de navegador próprios, sem instância real.

## Resultado verificado

Todos os comandos abaixo terminaram com exit 0. Saída literal resumida:

```text
node --test test/*.test.mjs
# tests 46
# pass 46
# fail 0

node test/checar.mjs
Sintaxe: 25 arquivos JS, 5 scripts inline, 0 erros.

node test/bancada/testar.mjs
Bancada: todos os fluxos passaram. Capturas em test/bancada/capturas/.

node test/bancada/chamados.testar.mjs
OK fotos: concluir e enviar fotos no mesmo Salvar; falha parcial permite repetir upload sem reabrir nem perder fotos
OK fotos: limites 10 por seleção e 20 pendentes, sem perda silenciosa; sem portal botão bloqueado e zero uploads
OK paginação 27 resultados; sem portal e demonstração bloqueiam escrita; zero exceções

node test/bancada/fatia4.testar.mjs
OK capturas claro/escuro e 390 px; sem portal e demonstração: zero escrita/storage/rede; zero exceções no Chromium

node test/bancada/cockpit.testar.mjs
Cockpit: todas as provas passaram. Capturas em test/bancada/capturas/cockpit-*.png
```

`git diff --check`: exit 0, sem saída.
`git add`: exit 128, `index.lock: Read-only file system`. Alterações mantidas no working tree para revisão e commit pelo coordenador.
