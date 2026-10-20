import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
let arquivos = 0, inline = 0, erros = 0;
const manifest = path.join(raiz, 'manifest.json');
const versao = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null;
function auditarEstilosEVisibilidade() {
  for (const arquivo of ['app/estilo.css', 'app/chamados.css']) {
    const nome = path.join(raiz, arquivo);
    if (!existsSync(nome)) continue;
    const css = readFileSync(nome, 'utf8');
    for (const regra of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/\.gi-estado-[\w-]+/.test(regra[1]) && /\bcolor\s*:\s*#[\da-f]{3,8}\b/i.test(regra[2])) {
        erros++; process.stderr.write(nome + ': cor hexadecimal fixa em regra .gi-estado-* .\n');
      }
    }
  }
  if (!versao) return;
  const dados = JSON.parse(readFileSync(manifest, 'utf8'));
  const porId = new Map();
  for (const contribuicao of dados.contributions || []) {
    porId.set(contribuicao.id, contribuicao);
    for (const item of contribuicao.items || []) porId.set(item.id, item);
  }
  if (!['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-cockpit', 'gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config'].some(id => porId.has(id))) return;
  if (['0.27.0', '0.28.0', '0.29.0', '0.29.1'].includes(dados.version)) {
    for (const id of ['gi-locados', 'gi-chamados', 'gi-prestadores', 'gi-cockpit', 'gi-os']) if (porId.has(id)) {
      erros++; process.stderr.write('manifest.json: contribuição desligada: ' + id + '.\n');
    }
  }
  const restritos = ['gi-locados', 'gi-chamados', 'gi-prestadores'];
  const semRestricao = ['gi-imoveis', 'gi-campos', 'gi-historico', 'gi-config'];
  for (const id of restritos) {
    if (!porId.has(id)) continue;
    const visibilidade = porId.get(id)?.visibility;
    if (JSON.stringify(visibilidade) !== JSON.stringify({ userIds: [1, 515, 528, 531] })) {
      erros++; process.stderr.write('manifest.json: ' + id + ' deve restringir userIds exatamente a [1,515,528,531], sem userTypes.\n');
    }
  }
  for (const id of ['gi-cockpit', 'gi-os']) {
    if (!porId.has(id)) continue;
    if (JSON.stringify(porId.get(id)?.visibility?.userTypes) !== '[0,1,2]') {
      erros++; process.stderr.write('manifest.json: ' + id + ' deve definir userTypes exatamente a [0,1,2].\n');
    }
  }
  for (const id of semRestricao) if (porId.get(id)?.visibility) {
    erros++; process.stderr.write('manifest.json: ' + id + ' não deve restringir visibilidade própria.\n');
  }
}
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
      // Arquivos dormentes são preservados integralmente na 0.27.0.
      const versaoHtml = ['0.27.0', '0.28.0', '0.29.0', '0.29.1'].includes(versao) && /^(painel|os|chamados|prestadores)\.html$/.test(item.name) ? '0.26.3' : versao;
      for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
        const atributo = tag[0].match(/<(script|link)\b[^>]*?\b(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        if (versao && atributo) {
          const recurso = atributo[3] || atributo[4] || atributo[5] || '';
          if (recurso && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(recurso)) {
            const atual = recurso.match(/[?&]v=([^&]+)/);
            if (!atual) { erros++; process.stderr.write(nome + ': recurso local sem ?v=: ' + recurso + '.\n'); }
            else if (atual[1] !== versaoHtml) { erros++; process.stderr.write(nome + ': versão ' + atual[1] + ' diverge da versão ' + versao + ' do manifest.\n'); }
          }
        }
        for (const v of tag[0].matchAll(/[?&]v=([^\s"'&>]+)/g)) {
          if (versao && v[1] !== versaoHtml) {
            erros++; process.stderr.write(nome + ': versão ' + v[1] + ' diverge da versão ' + versao + ' do manifest.\n');
          }
        }
      }
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
auditarEstilosEVisibilidade();
process.stdout.write('Sintaxe: ' + arquivos + ' arquivos JS, ' + inline + ' scripts inline, ' + erros + ' erros.\n');
if (erros) process.exitCode = 1;
