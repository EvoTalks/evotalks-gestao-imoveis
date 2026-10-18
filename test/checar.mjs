import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
let arquivos = 0, inline = 0, erros = 0;
function validar(nome, codigo, modulo) {
  const r = spawnSync(process.execPath, codigo === undefined ? ['--check', nome] :
    ['--check', '--input-type=' + (modulo ? 'module' : 'commonjs')], { input: codigo, encoding: 'utf8' });
  if (r.status !== 0) {
    erros++;
    process.stderr.write(nome + '\n' + (r.stderr || r.error?.message || 'Falha ao validar') + '\n');
  }
}
function visitar(pasta) {
  for (const item of readdirSync(pasta, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name.startsWith('.') || item.name === 'node_modules') continue;
    const nome = path.join(pasta, item.name);
    if (item.isDirectory()) visitar(nome);
    else if (/\.(?:js|mjs|cjs)$/.test(item.name)) { arquivos++; validar(nome); }
    else if (/\.html$/.test(item.name)) {
      const html = readFileSync(nome, 'utf8');
      let indice = 0;
      for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        indice++;
        const atributos = script[1];
        if (/(?:^|\s)src\s*=/i.test(atributos)) continue;
        const atributoTipo = atributos.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const tipo = atributoTipo ? (atributoTipo[1] || atributoTipo[2] || atributoTipo[3] || '').toLowerCase() : '';
        if (tipo && !/^(?:module|(?:text|application)\/(?:java|ecma)script)$/i.test(tipo)) continue;
        inline++;
        validar(nome + ' (inline ' + indice + ')', script[2], tipo === 'module');
      }
    }
  }
}
visitar(raiz);
process.stdout.write('Sintaxe: ' + arquivos + ' arquivos JS, ' + inline + ' scripts inline, ' + erros + ' erros.\n');
if (erros) process.exitCode = 1;
