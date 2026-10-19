/* Provas de apresentação com SDK/portal isolados, sem dados ou rede reais. */
import assert from 'node:assert/strict';
import { abrirExtensao } from './roteiros.mjs';
import { principal } from './ambiente.mjs';

export async function testarCorrecoes() {
  let s = await abrirExtensao('novo', { largura:900, altura:960 });
  try {
    const b=s.b;
    const novo=await b.avaliar(()=>({
      ids:[...document.querySelectorAll('[data-atendimento]')].map(n=>n.textContent.match(/#\d+/)[0]),
      mensagens:[...document.querySelectorAll('[data-atendimento] .gi-atend__txt')].map(n=>({texto:n.textContent,estilo:getComputedStyle(n).fontStyle})),
      datas:[...document.querySelectorAll('[data-atendimento] .gi-ajuda')].map(n=>n.textContent),
      cliente:document.querySelector('#c-cliente').value,
      fotos:document.querySelector('#c-resumo-fotos').textContent,
      altura:Math.ceil(document.querySelector('.gi-modal').getBoundingClientRect().height),
      mais:document.querySelector('#c-mais').getBoundingClientRect().height,
      footer:document.querySelector('.gi-modal-rodape').textContent
    }));
    assert.deepEqual(novo.ids,['#2660','#2641','#2121']);
    assert.equal(novo.mensagens.length,3);
    assert.ok(novo.mensagens.every(m=>/^“.*”$/.test(m.texto)&&m.estilo==='italic'));
    assert.match(novo.datas[0],/Marina · hoje às 21:12/);
    assert.match(novo.datas[1],/Marina · 17\/10 às 14:08/);
    assert.match(novo.datas[2],/Tiago · 28\/08 às 10:02/);
    assert.equal(novo.cliente,'Carla Menezes · (47) 9 ••••-1234');
    assert.equal(novo.fotos,'Nenhuma foto no atendimento #2660.');
    assert.equal(novo.altura,960); assert.equal(novo.mais,0);
    await b.clicar('.gi-mais-link'); assert.equal(await b.avaliar(()=>document.querySelector('#c-mais').open),true);
    await b.clicar('.gi-mais-link'); assert.equal(await b.avaliar(()=>document.querySelector('#c-mais').getBoundingClientRect().height),0);
    await b.clicar('#c-buscar-protocolo'); await b.preencher('#c-busca-atendimento','2641');
    assert.equal(await b.avaliar(()=>document.querySelectorAll('[data-atendimento]').length),1);
    await b.preencher('#c-busca-atendimento','');
    // A mesma leitura que alimenta a prévia abastece a conferência automática de fotos.
    await b.avaliar(()=>{
      const get=omni.chats.getMessages; bancada.leiturasFotos=[];
      omni.chats.getMessages=(id,op)=>{bancada.leiturasFotos.push({id,op});return id===2660?Promise.resolve([{id:'foto-sintetica',direction:'in',fileRef:'sintetica',fileName:'teste.png',mimetype:'image/png'}]):get(id,op);};
    });
    await b.clicar('#c-carregar-fotos'); await b.esperar(()=>!!document.querySelector('#c-fotos [data-foto]'));
    assert.equal(await b.avaliar(()=>document.querySelector('#c-resumo-fotos').textContent),'1 foto no atendimento #2660.');
    assert.equal(await b.avaliar(()=>document.querySelector('#c-fotos [data-foto]').closest('.ph')!==null),true);
    await b.clicar('[data-atendimento="1"]'); await b.esperar(()=>document.querySelector('#c-resumo-fotos').textContent.includes('#2641'));
    await b.clicar('[data-atendimento="0"]'); await b.esperar(()=>document.querySelector('#c-resumo-fotos').textContent==='1 foto no atendimento #2660.');
    assert.equal(await b.avaliar(()=>bancada.leiturasFotos.filter(x=>x.id===2660).length),1);
    await b.clicar('.gi-modal [data-cancelar]');
    await b.avaliar(()=>{
      const buscar=omni.contacts.search, get=omni.chats.getMessages;
      omni.contacts.search=async(...args)=>(await buscar(...args)).map(c=>({...c,phone:'5547999991234'}));
      bancada.paginasMensagem=[];
      omni.chats.getMessages=(id,op)=>{
        if(id!==2660)return get(id,op);
        bancada.paginasMensagem.push(op);
        return Promise.resolve(op.before?[{id:'primeira',direction:'in',text:'Primeira mensagem sintética',at:'2026-10-17T19:00:00Z'}]:Array.from({length:50},(_,i)=>({id:'saida-'+i,direction:'out',text:'Mensagem da equipe',at:'2026-10-17T20:00:00Z'})));
      };
    });
    await b.clicar('#b-novo'); await b.preencher('#c-cliente','Carla'); await b.esperar(()=>!!document.querySelector('[data-contato]')); await b.clicar('[data-contato="0"]');
    await b.esperar(()=>document.querySelector('[data-atendimento="0"] .gi-atend__txt')?.textContent==='“Primeira mensagem sintética”');
    assert.equal(await b.avaliar(()=>document.querySelector('#c-cliente').value),'Carla Menezes · (47) 9 ••••-1234');
    await b.clicar('[data-atendimento="0"]'); await b.esperar(()=>document.querySelector('#c-resumo-fotos').textContent==='Nenhuma foto no atendimento #2660.');
    assert.equal(await b.avaliar(()=>bancada.paginasMensagem.filter(p=>!p.before).length),1);
    assert.equal(await b.avaliar(()=>bancada.paginasMensagem.filter(p=>p.before==='saida-49').length),1);
    await b.avaliar(()=>{omni.contacts.search=async()=>[{id:103,name:'Carla Menezes',phone:''}];});
    await b.preencher('#c-cliente','Carla'); await b.esperar(()=>!!document.querySelector('[data-contato]')); await b.clicar('[data-contato="0"]');
    assert.equal(await b.avaliar(()=>document.querySelector('#c-cliente').value),'Carla Menezes');
    assert.deepEqual(b.erros,[]);
  } finally {await s.fechar();}
  s=await abrirExtensao('modal',{largura:900,altura:1853});
  try {
    const b=s.b;
    const editar=await b.avaliar(()=>({
      trilha:[...document.querySelectorAll('#c-trilha small')].map(n=>n.textContent.trim()),
      historico:[...document.querySelectorAll('#c-historico li')].map(n=>n.textContent),
      cores:[...document.querySelectorAll('#c-historico .dot')].map(n=>getComputedStyle(n).borderColor),
      orc:document.querySelector('#c-orcamentos').textContent,
      aprov:document.querySelector('.gi-aprov').textContent,
      valor:{value:document.querySelector('#c-valor').value,readonly:document.querySelector('#c-valor').readOnly,title:document.querySelector('#c-valor').title},
      recado:document.querySelector('.gi-modal-recado').dataset.padrao,
      rotulo:document.querySelector('[data-ok]').textContent,
      altura:Math.ceil(document.querySelector('.gi-modal').getBoundingClientRect().height),
      corpo:document.querySelector('.gi-modal-corpo').getBoundingClientRect().height,
      nota:document.querySelector('#c-nota').checkVisibility(),
      foto:document.querySelector('.ph--add').textContent
    }));
    assert.deepEqual(editar.trilha,['17/10 · 14:20','17/10 · 15:05','2 cotações','acima da alçada','visita do prestador','','']);
    assert.match(editar.historico[0],/Chamado aberto pela Williane \(IA\)/);
    assert.match(editar.historico[1],/Status: Novo para Triagem, por Marina/);
    assert.match(editar.historico[3],/Cotação de Mestre Encanador: R\$\s340,00/);
    assert.match(editar.historico[4],/Nota interna de Marina“Cliente só atende depois das 18h.”/);
    assert.notEqual(editar.cores[0],editar.cores[2]);
    assert.match(editar.orc,/5 prestadores de Hidráulica cadastrados/);
    assert.match(editar.aprov,/O valor passa da alçada de R\$\s250,00\. O proprietário recebe valor, fotos e prazo no WhatsApp e responde com um toque\./);
    assert.deepEqual(editar.valor,{value:'280,00',readonly:true,title:'Definido pelo orçamento escolhido'});
    assert.equal(editar.recado,'Última alteração: Marina · 17/10 às 17:25');
    assert.equal(editar.rotulo,'Atualizar'); assert.equal(editar.altura,1853); assert.ok(editar.corpo>1700); assert.equal(editar.nota,true);
    assert.doesNotMatch(editar.foto,/vídeo/);
    await b.clicar('#c-abrir-atendimento'); assert.equal(await b.avaliar(async()=> (await omni.chats.getSelected()).id),2641);
    await b.clicar('.gi-aprov-consultar'); assert.equal(await b.avaliar(()=>document.querySelector('.gi-aprov-opcoes').open),true);
    await b.clicar('.gi-aprov-consultar'); assert.equal(await b.avaliar(()=>document.querySelector('.gi-aprov-opcoes').getBoundingClientRect().height),0);
    await b.clicar('#c-pedir-cotacao'); assert.equal(await b.avaliar(()=>document.querySelector('.gi-orc-opcoes').open),true);
    await b.preencher('#c-nota','Nota sintética'); assert.equal(await b.avaliar(()=>document.querySelector('#c-salvar-nota').checkVisibility()),true);
    assert.deepEqual(b.erros,[]);
  }finally{await s.fechar();}
}
if(principal(import.meta.url)){await testarCorrecoes();process.stdout.write('OK S2A2: três atendimentos com aspas, hoje/data, telefone, fotos automáticas, opções recolhidas, trilha, histórico por campos, aprovação, nota e modal inteiro.\n');}
