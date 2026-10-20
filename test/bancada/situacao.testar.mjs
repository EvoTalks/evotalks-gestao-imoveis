import { PERMISSOES_PADRAO } from './portal-permissoes.mjs';
import { criarServidor } from './servidor.mjs';
import { abrirChromium } from './chromium.mjs';
import { testarSituacao } from './situacao.cenarios.mjs';
const s = criarServidor({ permissoes: { 9999: { ...PERMISSOES_PADRAO, mudar_situacao: true } }, situacoes: { 'DEMO-002': 'reservado', 'DEMO-003': 'indisponivel' } });
await new Promise(r => s.listen(0, '127.0.0.1', r));
let b;
try { b = await abrirChromium(); await testarSituacao(b, 'http://127.0.0.1:' + s.address().port); }
finally { if (b) await b.fechar(); s.closeAllConnections(); await new Promise(r => s.close(r)); }
