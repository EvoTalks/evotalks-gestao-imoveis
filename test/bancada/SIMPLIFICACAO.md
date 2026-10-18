# Cobertura — simplificação e status imediato (F6–F8)

Somente extensão e simulador local, dados e imagens sintéticos. Versão 0.21.0 e `?v=` preservados.

Escolheu o status na lista ou no modal, grava na hora. Salvar cuida dos dados e fotos.
Cancelado pede confirmação inline com motivo opcional e Voltar. Nenhum diálogo nativo.

| Contrato | Prova automatizada |
| --- | --- |
| Status 1–2, 4 e 7 | `status.cenarios.mjs`: uma requisição por troca, linha/prazo/resumo sem F5 nem reconstruir a lista, selo/prazo do modal, rascunhos intactos, Salvar sem status, fila serial e bloqueio de repetição |
| Status 3 | Cancelamento na lista e modal; Voltar sem escrita; confirmação envia motivo escapado; Salvar não descarta confirmação pendente |
| Status 5–6 | Recusas 409 aprovação pendente/recusada/encerrado e 422 sem visita; select restaurado; Registrar decisão no modal; status `constructor`/`__proto__`; sem portal/demonstração com zero requisições de manutenção |
| Status 8 | Foto inteira em concluído e cancelado com um clique/uma requisição; fechar e repetir usa cache; buscar pasta/chat e adicionar continuam desabilitados |
| Status 9 | `dialogos.test.mjs`: varre JS/HTML fora de comentários/literais, reprova chamadas nativas e testa exemplos proibidos/permitidos |
| Status 10 | Orçamento incluído após status recusado, com select já restaurado e sem status em `aplicarPendentes` |
| F6 | `simplificar.cenarios.mjs`: cliente/imóvel, campos e erros preservando digitado, atendimentos por contato/filas, vínculo imediato, notas e envio confirmado, orçamento livre e sugestões, Mais opções e dados hostis |
| Fotos | `fotos.cenarios.mjs`: canvas PNG/JPEG, redução, limites, nomes hostis, chat+pasta, sequência, falha parcial, cota e retry idempotente; fotos escolhidas preservadas ao encerrar pelo select |
| Lote Y | `lote-y.cenarios.mjs`: miniaturas sem baixar arquivos, clique duplo, cota real, cancelamento inline, orçamento/nota/dados, aprovação/envio e descarte/retry de fotos |
| Fatia 4 e cockpit | `fatia4.testar.mjs` e `cockpit.testar.mjs`: aprovação, proprietário, prestador/visita, SLA e cockpit preservados |

Regressão demonstrada: o novo cenário F8 no código anterior termina com exit 1,
`AssertionError: 0 !== 8` (selects de status ausentes). A foto inteira em chamado
encerrado também é verificada por clique real no Chromium, com imagem de canvas.

Validação completa:

```bash
node --test test/*.test.mjs
node test/checar.mjs
node test/bancada/testar.mjs
node test/bancada/chamados.testar.mjs
node test/bancada/fatia4.testar.mjs
node test/bancada/cockpit.testar.mjs
```

Capturas locais: `capturas/status-{lista,modal}-390-{claro,escuro}.png`,
`simplificar-*.png`, `fotos-*.png`, `lote-y-*.png` e `fatia4-*.png`.
As quatro bancadas usam servidores e perfis próprios, sem instância real.
