import { readFile } from 'node:fs/promises';

/* Executado no Chromium por avaliar(). Não redimensiona nem alinha as imagens. */
export async function compararNoCanvas(aURL, bURL, mascaras = [], tolerancia = 8) {
  const carregar = src => new Promise((resolve,reject) => {
    const i = new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('PNG inválido')); i.src=src;
  });
  const [a,b] = await Promise.all([carregar(aURL),carregar(bURL)]);
  const width=Math.max(a.width,b.width),height=Math.max(a.height,b.height);
  const criar = () => { const c=document.createElement('canvas');c.width=width;c.height=height;return c; };
  const ca=criar(),cb=criar(),diff=criar();
  ca.getContext('2d').drawImage(a,0,0); cb.getContext('2d').drawImage(b,0,0);
  const aa=ca.getContext('2d').getImageData(0,0,width,height).data;
  const bb=cb.getContext('2d').getImageData(0,0,width,height).data;
  const ctx=diff.getContext('2d'),heat=ctx.createImageData(width,height);
  let diferentes=0,comparados=0,mascarados=0,descobertos=0;
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4,emA=x<a.width&&y<a.height,emB=x<b.width&&y<b.height;
    if(!emA&&!emB)continue;
    for(let c=0;c<4;c++)heat.data[i+c]=bb[i+c];
    if(mascaras.some(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)) { mascarados++;continue; }
    comparados++;
    const descoberto=emA!==emB;
    if(descoberto)descobertos++;
    if(descoberto||[0,1,2,3].some(c=>Math.abs(aa[i+c]-bb[i+c])>tolerancia)) {
      diferentes++;heat.data[i]=255;heat.data[i+1]=Math.round(bb[i+1]*.25);heat.data[i+2]=Math.round(bb[i+2]*.25);heat.data[i+3]=255;
    }
  }
  ctx.putImageData(heat,0,0);
  return { desenho:{largura:a.width,altura:a.height},extensao:{largura:b.width,altura:b.height},diferentes,comparados,mascarados,descobertos,
    percentual:comparados?diferentes/comparados*100:0,diff:diff.toDataURL('image/png') };
}
export async function compararArquivos(b, a, c, mascaras=[]) {
  const [aa,bb]=await Promise.all([readFile(a),readFile(c)]);
  return b.avaliar(compararNoCanvas,'data:image/png;base64,'+aa.toString('base64'),'data:image/png;base64,'+bb.toString('base64'),mascaras,8);
}
