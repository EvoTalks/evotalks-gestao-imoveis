/* Conta pixels divergentes por região, sem mascarar nem alterar a comparação. */
import { readFile } from 'node:fs/promises';
export async function contarRegioes(b, desenho, extensao, regioes) {
  const pngs = await Promise.all([desenho, extensao].map(async f => 'data:image/png;base64,' + (await readFile(f)).toString('base64')));
  return b.avaliar(async (urls, caixas) => {
    const pixels = await Promise.all(urls.map(src => new Promise(resolve => {
      const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const ctx = c.getContext('2d'); ctx.drawImage(i,0,0); resolve({ largura:i.width, altura:i.height, rgba:ctx.getImageData(0,0,i.width,i.height).data }); }; i.src=src;
    })));
    return caixas.map(r => {
      let diferentes=0; const [a,b]=pixels;
      for(let y=Math.floor(r.y);y<Math.ceil(r.y+r.height);y++) for(let x=Math.floor(r.x);x<Math.ceil(r.x+r.width);x++) {
        if(x<0||y<0||x>=a.largura||x>=b.largura||y>=a.altura||y>=b.altura)continue;
        if([0,1,2,3].some(c=>Math.abs(a.rgba[(y*a.largura+x)*4+c]-b.rgba[(y*b.largura+x)*4+c])>8))diferentes++;
      }
      return {...r,area:Math.ceil(r.width)*Math.ceil(r.height),diferentes};
    });
  },pngs,regioes);
}
