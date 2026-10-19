/* Cliente CDP mínimo sobre o WebSocket nativo do Node 22, sem pacote npm. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function abrirChromium({ antesDeCarregar } = {}) {
  const raiz = fileURLToPath(new URL('./', import.meta.url));
  const cache = '/srv/devhome/.cache/puppeteer/chrome';
  const candidatos = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  if (existsSync(cache)) candidatos.push(...readdirSync(cache).sort().reverse().map(v => path.join(cache, v, 'chrome-linux64/chrome')));
  const executavel = process.env.CHROMIUM_PATH || candidatos.find(p => existsSync(p));
  if (!executavel) throw new Error('Defina CHROMIUM_PATH para um Chromium já instalado.');
  const perfil = mkdtempSync(path.join(raiz, '.perfil-'));
  mkdirSync(path.join(perfil, 'tmp'));
  const filho = spawn(executavel, ['--headless=new', '--no-sandbox', '--no-zygote', '--single-process', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-crashpad-for-testing',
    '--disable-sync', '--remote-debugging-port=0', '--user-data-dir=' + perfil, '--disk-cache-dir=' + path.join(perfil, 'cache'), 'about:blank'],
  // TMPDIR relativo mantém o socket Unix do Chromium abaixo do limite de 108 bytes.
  { cwd: perfil, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: '.', XDG_DATA_HOME: path.join(perfil, 'dados') } });
  let ws;
  async function fechar() {
    if (ws) ws.close();
    if (filho.exitCode === null) {
      const saiu = new Promise(resolve => filho.once('exit', resolve));
      filho.kill('SIGKILL'); await saiu;
    }
    rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  try {
    const endereco = await new Promise((resolve, reject) => {
      let texto = '';
      const limite = setTimeout(() => reject(new Error('Chromium não abriu em 15s.\n' + texto.slice(-2000))), 15000);
      filho.once('error', err => { clearTimeout(limite); reject(err); });
      filho.once('exit', codigo => { clearTimeout(limite); reject(new Error('Chromium saiu: ' + codigo + '\n' + texto.slice(-1500))); });
      filho.stderr.on('data', chunk => {
        texto += chunk;
        const achado = texto.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (achado) { clearTimeout(limite); resolve(achado[1]); }
      });
    });
    ws = new WebSocket(endereco);
    await new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error('WebSocket CDP não conectou em 10s.')), 10000);
      ws.onopen = () => { clearTimeout(limite); resolve(); };
      ws.onerror = () => { clearTimeout(limite); reject(new Error('Falha ao conectar WebSocket CDP.')); };
    });
    let id = 0, sessionId;
    const pendentes = new Map(), erros = [];
    ws.onmessage = ev => {
      const r = JSON.parse(ev.data);
      if (r.id) {
        const p = pendentes.get(r.id);
        if (!p) return;
        pendentes.delete(r.id); clearTimeout(p.limite);
        if (r.error) p.reject(new Error(r.error.message)); else p.resolve(r.result);
      } else if (r.method === 'Runtime.exceptionThrown') erros.push(r.params.exceptionDetails.text + ': ' + (r.params.exceptionDetails.exception?.description || ''));
    };
    function enviar(method, params = {}, sessao = sessionId) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        const limite = setTimeout(() => { pendentes.delete(n); reject(new Error('CDP timeout: ' + method)); }, 10000);
        pendentes.set(n, { resolve, reject, limite });
        ws.send(JSON.stringify({ id: n, method, params, ...(sessao ? { sessionId: sessao } : {}) }));
      });
    }
    const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true }));
    await enviar('Runtime.enable'); await enviar('Page.enable');
    if (antesDeCarregar) await enviar('Page.addScriptToEvaluateOnNewDocument', { source: antesDeCarregar });
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    async function avaliar(fn, ...args) {
      const r = await enviar('Runtime.evaluate', { expression: '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')', awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    }
    async function esperar(fn, ...args) {
      for (let i = 0; i < 120; i++) {
        if (await avaliar(fn, ...args)) return;
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('Condição não atingida: ' + fn.toString());
    }
    return {
      avaliar, esperar, erros,
      navegar: async url => {
        await enviar('Page.navigate', { url });
        await esperar(() => document.readyState === 'complete' && !!window.bancada);
      },
      clicar: seletor => avaliar(s => { const el = document.querySelector(s); if (!el || el.disabled) throw new Error('Botão ausente ou desabilitado: ' + s); el.click(); }, seletor),
      preencher: (seletor, valor) => avaliar((s, v) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, seletor, valor),
      arquivos: async (seletor, files) => {
        const { root } = await enviar('DOM.getDocument');
        const { nodeId } = await enviar('DOM.querySelector', { nodeId: root.nodeId, selector: seletor });
        if (!nodeId) throw new Error('Input de arquivo ausente: ' + seletor);
        await enviar('DOM.setFileInputFiles', { nodeId, files });
      },
      captura: async nome => {
        mkdirSync(path.join(raiz, 'capturas'), { recursive: true });
        const { data } = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(path.join(raiz, 'capturas', nome + '.png'), Buffer.from(data, 'base64'));
      },
      viewport: (width, height) => enviar('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      fechar
    };
  } catch (err) { await fechar(); throw err; }
}
