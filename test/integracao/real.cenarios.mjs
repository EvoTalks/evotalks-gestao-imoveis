import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { testarAtendente } from '../bancada/atendente.cenarios.mjs';

export async function testarReal(b, origem, real) {
  const texto = s => b.avaliar(s => document.querySelector(s)?.textContent || '', s);
  const sql = async (s, p = []) => (await real.pg.query(s, p)).rows;
  const chamado = async id => (await sql('SELECT * FROM chamados WHERE id=$1', [id]))[0];
  const modal = () => b.esperar(() => !!document.querySelector('#c-pasta'));
  const livre = () => b.esperar(() => !!document.querySelector('#c-orc-nome') && !document.querySelector('#c-salvar-orcamento').disabled && !document.querySelector('#c-status').disabled);
  const fechar = async () => { await b.clicar('.gi-modal [data-cancelar]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  const abrir = async id => { await b.esperar(id => !!document.querySelector('[data-editar="' + id + '"]'), id); await b.clicar('[data-editar="' + id + '"]'); await modal(); await livre(); };
  const salvar = async () => { await b.clicar('.gi-modal [data-ok]'); await b.esperar(() => !document.querySelector('.gi-modal')); };
  const navegar = async tela => { await b.navegar(origem + '/app/' + tela + '.html?perfil=admin'); await b.esperar(() => !!window.GI && GI.modo === 'portal'); };
  async function cenario(nome, fn) {
    const inicio = real.requisicoes.length, cliquesAntes = cliques;
    await fn();
    const chamadas = real.requisicoes.slice(inicio);
    assert.ok(chamadas.length > 0 && chamadas.length <= 30, nome + ': orçamento de 30/min, recebido ' + chamadas.length);
    assert.deepEqual(b.erros, []);
    process.stdout.write('OK real ' + nome + ': ' + chamadas.length + '/30 requisições; ' + (cliques - cliquesAntes) + ' cliques; banco conferido\n');
  }
  let cliques = 0;
  const clicarOriginal = b.clicar;
  b.clicar = async function (seletor) { cliques++; return clicarOriginal(seletor); };
  let locacaoId, id;
  const pasta = mkdtempSync(path.join(fileURLToPath(new URL('./', import.meta.url)), '.imagens-'));
  try {
    await cenario('a candidatas e cadastro manual em Locados', async () => {
      await navegar('locados'); await b.esperar(() => !document.querySelector('#b-novo').disabled);
      await b.clicar('#b-candidatas'); await b.esperar(() => !!document.querySelector('[data-candidata="0"]'));
      await b.clicar('[data-candidata="0"]'); await b.esperar(() => !!document.querySelector('#l-locatario'));
      await b.preencher('#l-locatario', 'Demonstração Um'); await b.esperar(() => !!document.querySelector('[data-contato="0"]')); await b.clicar('[data-contato="0"]');
      await salvar();
      await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Imóvel que Saiu do Anúncio'));
      assert.equal((await sql("SELECT count(*)::int AS n FROM locacoes WHERE imovel_codigo='DEMO-SAIDA'"))[0].n, 1);
      await b.clicar('#b-novo'); await b.esperar(() => !!document.querySelector('#l-titulo'));
      await b.preencher('#l-titulo', 'Avulso Integração Demonstração'); await b.preencher('#l-endereco', 'Rua Inexistente, zero');
      await b.preencher('#l-locatario', 'Demonstração Um'); await b.esperar(() => !!document.querySelector('[data-contato="0"]')); await b.clicar('[data-contato="0"]');
      await salvar();
      await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Avulso Integração'));
      locacaoId = (await sql("SELECT id FROM locacoes WHERE imovel_titulo='Avulso Integração Demonstração'"))[0].id;
      assert.equal((await sql('SELECT contato_id FROM locacao_contatos WHERE locacao_id=$1', [locacaoId]))[0].contato_id, 9901);
      await b.captura('integracao-a-locados');
    });
    await cenario('b chamado na gestão escolhendo chat da lista', async () => {
      await navegar('chamados'); await b.esperar(() => !document.querySelector('#b-novo').disabled);
      await b.clicar('#b-novo'); await modal(); await b.preencher('#c-cliente', 'Demonstração Um');
      await b.esperar(() => !!document.querySelector('[data-contato="0"]')); await b.clicar('[data-contato="0"]');
      await b.esperar(() => document.querySelector('#c-locacao').options.length >= 2 && !!document.querySelector('[data-atendimento="0"]'));
      const indice = await b.avaliar(() => Array.from(document.querySelector('#c-locacao').options).find(o => o.textContent.includes('Avulso Integração')).value);
      await b.preencher('#c-locacao', indice); await b.preencher('#c-titulo', 'Reparo Sintético Integração');
      await b.preencher('#c-descricao', 'Relato sintético <img src=x onerror="window.__xss=1">'); await b.preencher('#c-prioridade', 'alta');
      await b.clicar('[data-atendimento="0"]'); await salvar();
      id = (await sql("SELECT id FROM chamados WHERE titulo='Reparo Sintético Integração'"))[0].id;
      const c = await chamado(id);
      assert.equal(c.locacao_id, locacaoId); assert.equal(c.atendimento_chat_id, 8801); assert.equal(c.prioridade, 'alta');
      assert.match(c.descricao, /<img/);
      await abrir(id); assert.equal(await b.avaliar(() => window.__xss), undefined); await b.captura('integracao-b-chamado');
    });
    await cenario('c PNG e JPEG pela pasta, miniaturas e foto inteira', async () => {
      const imagens = await b.avaliar(() => ['image/png', 'image/jpeg'].map((tipo, i) => {
        const c = document.createElement('canvas'); c.width = 48; c.height = 32; const ctx = c.getContext('2d');
        ctx.fillStyle = i ? '#00f' : '#f00'; ctx.fillRect(0, 0, 48, 32); return c.toDataURL(tipo).split(',')[1];
      }));
      const arquivos = ['sintetica.png', 'sintetica.jpg'].map((nome, i) => { const f = path.join(pasta, nome); writeFileSync(f, Buffer.from(imagens[i], 'base64')); return f; });
      await b.arquivos('#c-pasta', arquivos); await b.esperar(() => document.querySelectorAll('#c-pendentes img').length === 2);
      await salvar(); await abrir(id); await b.esperar(() => document.querySelectorAll('#c-fotos img').length === 2);
      const anexos = await sql('SELECT id,origem,miniatura AS miniatura_base64 FROM chamado_anexos WHERE chamado_id=$1', [id]);
      assert.equal(anexos.length, 2); assert.ok(anexos.every(a => a.origem === 'upload' && a.miniatura_base64));
      await b.clicar('[data-ampliar="0"]'); await b.esperar(() => document.querySelector('#c-foto-inteira img')?.naturalWidth === 48);
      await b.captura('integracao-c-foto-aberto'); await b.clicar('#c-fechar-foto'); await fechar();
    });
    await cenario('d status imediato na lista e no modal, linha e resumo', async () => {
      const resumoAntes = await texto('#gi-resumo');
      await b.preencher('[data-status-id="' + id + '"]', 'concluido');
      await b.esperar(id => document.querySelector('[data-status-id="' + id + '"]').value === 'concluido' && !document.querySelector('[data-status-id="' + id + '"]').disabled, id);
      assert.equal((await chamado(id)).status, 'concluido'); assert.notEqual(await texto('#gi-resumo'), resumoAntes);
      await abrir(id); await b.esperar(() => document.querySelectorAll('#c-fotos img').length === 2);
      assert.equal(await b.avaliar(() => document.querySelector('#c-buscar-pasta').matches(':disabled')), true);
      await b.clicar('[data-ampliar="1"]'); await b.esperar(() => document.querySelector('#c-foto-inteira img')?.naturalWidth === 48);
      assert.equal((await sql('SELECT count(*)::int AS n FROM chamado_anexos WHERE chamado_id=$1', [id]))[0].n, 2);
      await b.captura('integracao-c-foto-concluido'); await b.clicar('#c-fechar-foto');
      await b.preencher('#c-status', 'triagem'); await livre(); assert.equal((await chamado(id)).status, 'triagem');
      assert.match(await texto('#c-selo'), /Triagem/); await fechar();
      assert.equal(await b.avaliar(id => document.querySelector('[data-status-id="' + id + '"]').value, id), 'triagem');
      await b.captura('integracao-d-status');
    });
    await cenario('e orçamento livre e prestador reutilizado sem acento/caixa', async () => {
      await abrir(id);
      for (const nome of ['Técnico Sintético Integração', '  tecnico sintetico integracao  ']) {
        await b.preencher('#c-orc-nome', nome); await b.preencher('#c-orc-observacao', 'Descrição livre, sem preço definido.');
        await b.clicar('#c-salvar-orcamento'); await livre();
      }
      const lista = await real.api('/prestadores'); assert.equal(lista.total, 1);
      const orc = await sql('SELECT * FROM chamado_orcamentos WHERE chamado_id=$1 ORDER BY id', [id]);
      assert.equal(orc.length, 2); assert.equal(orc[0].prestador_id, orc[1].prestador_id);
      assert.equal(orc[0].valor_centavos, null); assert.equal(orc[1].observacao, 'Descrição livre, sem preço definido.');
      await b.captura('integracao-e-orcamentos');
    });
    await cenario('f alçada, aprovação, visita e conclusão', async () => {
      await b.clicar('#c-mais summary'); await b.preencher('#c-quem-paga', 'proprietario'); await b.preencher('#c-valor', '650,10');
      await salvar(); await abrir(id);
      assert.equal((await chamado(id)).aprovacao_status, 'pendente');
      await b.preencher('#c-status', 'agendado'); await livre();
      assert.equal((await chamado(id)).status, 'triagem'); assert.match(await texto('#c-status-controle'), /aprovação.*pendente/);
      await b.clicar('#c-registrar-decisao'); await b.preencher('#c-aprovacao-por', 'Proprietário Sintético'); await b.clicar('#c-aprovar'); await livre();
      assert.equal((await chamado(id)).aprovacao_status, 'aprovada');
      await b.preencher('#c-visita-inicio', '2026-12-01T14:00'); await salvar(); await abrir(id);
      assert.ok((await chamado(id)).visita_inicio);
      await b.preencher('#c-status', 'agendado'); await livre(); assert.equal((await chamado(id)).status, 'agendado');
      await b.preencher('#c-status', 'concluido'); await livre(); assert.equal((await chamado(id)).status, 'concluido');
      await b.captura('integracao-f-concluido'); await fechar();
    });
    await cenario('g nota interna e aviso no chat com texto exato', async () => {
      await abrir(id);
      for (const [nota, avisar] of [['Nota interna sintética integração', false], ['Aviso sintético exato ao cliente', true]]) {
        await b.preencher('#c-nota', nota);
        if (avisar) { await b.esperar(() => !document.querySelector('#c-avisar').disabled); await b.clicar('#c-avisar'); }
        await b.clicar('#c-salvar-nota');
        if (avisar) { await b.esperar(() => !document.querySelector('#c-confirmacao').hidden); await b.clicar('#c-confirmar-acao'); }
        await b.esperar(() => document.querySelector('#c-nota').value === '');
        assert.equal((await sql("SELECT texto,notificou_cliente FROM chamado_eventos WHERE chamado_id=$1 AND tipo='nota' ORDER BY id DESC LIMIT 1", [id]))[0].texto, nota);
        assert.equal((await sql("SELECT notificou_cliente FROM chamado_eventos WHERE chamado_id=$1 AND tipo='nota' ORDER BY id DESC LIMIT 1", [id]))[0].notificou_cliente, avisar);
      }
      assert.deepEqual(await b.avaliar(() => bancada.mensagens), [{ chatId: 8801, payload: { text: 'Aviso sintético exato ao cliente' } }]);
      await b.captura('integracao-g-notas'); await fechar();
    });
    await cenario('h cancelar com motivo', async () => {
      await abrir(id); await b.preencher('#c-status', 'triagem'); await livre();
      await b.preencher('#c-status', 'cancelado');
      await b.preencher('#c-status-controle [data-status-motivo]', 'Cancelamento sintético por solicitação');
      await b.clicar('#c-status-controle [data-status-confirmar]'); await livre();
      assert.equal((await chamado(id)).status, 'cancelado'); assert.equal((await chamado(id)).motivo_cancelamento, 'Cancelamento sintético por solicitação');
      await b.captura('integracao-h-cancelado'); await fechar();
    });
    await cenario('i atendente abre chamado do chat e vê na gestão', async () => {
      await b.navegar(origem + '/app/painel.html?perfil=agente&escrita=1');
      await b.esperar(() => !!document.querySelector('[data-chamado]'));
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-gestao]')), false);
      assert.match(await texto('#cp-conteudo'), /Reparo Sintético Integração/);
      await b.clicar('#cp-tab-novo'); await b.preencher('#cp-titulo', 'Cockpit Sintético Integração');
      await b.captura('integracao-i-novo-vinculado');
      await b.clicar('#cp-revisar'); await b.captura('integracao-i-confirmacao'); await b.clicar('#cp-conferi'); await b.clicar('#cp-confirmar');
      await b.esperar(() => !!document.querySelector('#cp-sucesso'));
      assert.equal(await b.avaliar(() => !!document.querySelector('#cp-ver-gestao')), false);
      await b.captura('integracao-i-sucesso');
      const c = (await sql("SELECT * FROM chamados WHERE titulo='Cockpit Sintético Integração'"))[0];
      assert.equal(c.atendimento_chat_id, 8801); assert.equal(c.solicitante_contato_id, 9901); assert.equal(c.origem, 'atendimento');
      assert.equal(c.atendente_user_id, 9999);
      await b.esperar(() => bancada.chamadas.filter(c => c.caminho.includes('/contatos/9901/chamados')).length >= 2);
      await navegar('chamados'); await b.esperar(() => document.querySelector('#gi-corpo').textContent.includes('Cockpit Sintético Integração'));
      await b.captura('integracao-i-cockpit-na-gestao');
    });
    await cenario('6 perfis e notas no cockpit real', async () => {
      await testarAtendente(b, origem, id, async (n, texto) => {
        const ev = (await sql("SELECT * FROM chamado_eventos WHERE chamado_id=$1 AND tipo='nota' ORDER BY id DESC LIMIT 1", [n]))[0];
        assert.equal(ev.texto, texto); assert.equal(ev.notificou_cliente, texto.startsWith('<img'));
      });
    });
    await cenario('6 navegação interna respeita os perfis', async () => {
      for (const perfil of ['agente', 'supervisor', 'admin']) {
        await b.navegar(origem + '/app/imoveis.html?perfil=' + perfil);
        await b.esperar(() => !!document.querySelector('#gi-nav .gi-nav'));
        for (const tela of ['gi-locados', 'gi-chamados', 'gi-prestadores']) {
          assert.equal(await b.avaliar(tela => !!document.querySelector('[data-tela="' + tela + '"]'), tela), perfil === 'admin');
        }
        if (perfil !== 'admin') {
          await b.avaliar(() => {
            bancada.aberturas = []; omni.ui.openContribution = async id => { bancada.aberturas.push(id); };
            GI.abrirTela('gi-locados'); GI.abrirTela('gi-chamados'); GI.abrirTela('gi-prestadores');
          });
          assert.deepEqual(await b.avaliar(() => bancada.aberturas), []);
        }
      }
      assert.equal((await chamado(id)).atendimento_chat_id, 8801);
    });
    await cenario('6 troca rápida de chat sem misturar contato', async () => {
      await b.navegar(origem + '/app/painel.html?perfil=agente');
      await b.esperar(() => !!document.querySelector('[data-chamado]'));
      await b.avaliar(async () => { await omni.chats.select(8802); await omni.chats.select(8801); });
      await b.esperar(() => document.querySelector('#cp-nome').textContent.includes('Um') && !!document.querySelector('[data-chamado]'));
      assert.doesNotMatch(await texto('#cp-nome'), /Dois/);
      assert.equal(await b.avaliar(() => !!document.querySelector('[data-gestao]')), false);
      assert.equal((await chamado(id)).atendimento_chat_id, 8801);
    });
    for (const tema of ['claro', 'escuro']) for (const largura of [260, 300, 334]) {
      await cenario('6 atendente ' + largura + 'px ' + tema, async () => {
        await b.viewport(largura, 1100); await b.navegar(origem + '/app/painel.html?perfil=agente&tema=' + tema);
        await b.esperar(() => !!document.querySelector('[data-chamado]'));
        await b.clicar('[data-detalhes="' + id + '"]'); await b.esperar(() => !!document.querySelector('[data-observacoes]'));
        await b.avaliar(() => { document.querySelector('[data-observacoes]').closest('details').open = true; });
        assert.match(await texto('[data-observacoes]'), /Nota interna sintética cockpit/);
        assert.equal(await b.avaliar(() => document.querySelectorAll('.gi-cp-fotos img').length), 2);
        await b.clicar('.gi-cp-fotos button'); await b.esperar(() => document.querySelector('[data-imagem] img')?.naturalWidth === 48);
        assert.equal(await b.avaliar(() => !!document.querySelector('[data-nota]')), false, 'somente consulta com opção desligada');
        assert.equal(await b.avaliar(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await b.avaliar(() => window.__xss), undefined);
        await b.avaliar(() => scrollTo(0, 0));
        const altura = await b.avaliar(() => Math.ceil(document.querySelector('#gi-cockpit').getBoundingClientRect().height) + 100);
        await b.viewport(largura, altura);
        await b.captura('integracao-atendente-' + largura + '-' + tema);
        await b.clicar('#cp-tab-novo'); assert.match(await texto('#cp-conteudo'), /desligada/);
      });
    }
    process.stdout.write('OK real j: cada cenário respeitou no máximo 30 requisições por minuto; zero exceções no Chromium.\n');
  } finally { b.clicar = clicarOriginal; rmSync(pasta, { recursive: true, force: true }); }
}
