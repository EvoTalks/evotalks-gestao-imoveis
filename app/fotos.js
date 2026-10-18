/* Fotos locais: validação antes do decoder e redução antes de usar a cota do portal. */
(function () {
  'use strict';
  var fotos = {}, limite = 1.5 * 1024 * 1024;
  fotos.dimensoes = function (largura, altura, maximo) {
    if (!(largura > 0 && altura > 0 && Number.isFinite(largura) && Number.isFinite(altura))) throw new Error('Não foi possível decodificar a imagem.');
    var escala = Math.min(1, (maximo || 1600) / Math.max(largura, altura));
    return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
  };
  fotos.nomeSeguro = function (nome) { return String(nome || '').replace(/[\\/"'<>\x00-\x1f\x7f-\x9f]/g, '_').slice(0, 120).trim() || 'foto'; };
  fotos.tamanho = function (bytes) {
    return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB' :
      bytes >= 1024 ? (bytes / 1024).toFixed(1).replace('.', ',') + ' KB' : bytes + ' bytes';
  };
  fotos.tipoBytes = function (b) {
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'image/png';
    var texto = String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 12));
    if (/^GIF8[79]a/.test(texto)) return 'image/gif';
    if (/^RIFF[\s\S]{4}WEBP/.test(texto)) return 'image/webp';
    return null;
  };
  function ler(blob, metodo) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () { resolve(leitor.result); };
      leitor.onerror = function () { reject(new Error('Não foi possível ler a foto.')); };
      leitor[metodo](blob);
    });
  }
  function decodificar(arquivo) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(arquivo);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Imagem inválida.')); };
      img.src = url;
    });
  }
  fotos.processar = function (arquivo) {
    return Promise.resolve().then(function () {
      if (!arquivo || arquivo.size > 25 * 1024 * 1024) throw new Error('A foto ultrapassa 25 MB.');
      if (!arquivo.size || !/^image\/(jpeg|png|webp|gif)$/.test(arquivo.type)) throw new Error('Escolha uma imagem JPEG, PNG, WEBP ou GIF.');
      var cabeca = arquivo.slice(0, 12);
      return (cabeca.arrayBuffer ? cabeca.arrayBuffer() : ler(cabeca, 'readAsArrayBuffer')).then(function (bytes) {
        if (fotos.tipoBytes(new Uint8Array(bytes)) !== arquivo.type) throw new Error('O conteúdo (bytes iniciais) não corresponde ao tipo da imagem.');
        return decodificar(arquivo).catch(function () { throw new Error('Não foi possível decodificar a imagem.'); });
      });
    }).then(function (imagem) {
      function codificar(maximo, qualidade) {
        var d = fotos.dimensoes(imagem.width, imagem.height, maximo), canvas = document.createElement('canvas');
        canvas.width = d.largura; canvas.height = d.altura;
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Não foi possível preparar a imagem.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, d.largura, d.altura);
        ctx.drawImage(imagem, 0, 0, d.largura, d.altura);
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('Não foi possível reduzir a imagem.')); }, 'image/jpeg', qualidade);
        });
      }
      function miniatura() {
        return codificar(160, 0.7).then(function (blob) {
          return blob.size > 30 * 1024 ? codificar(160, 0.5) : blob;
        }).then(function (blob) {
          return blob.size > 30 * 1024 ? codificar(80, 0.5) : blob;
        }).then(function (blob) {
          if (!blob.size || blob.size > 30 * 1024) return null;
          return ler(blob, 'readAsDataURL').then(function (url) { return url.slice(url.indexOf(',') + 1); });
        }).catch(function () { return null; });
      }
      return Promise.resolve().then(function () { return codificar(1600, 0.82); }).then(function (blob) {
        return blob.size > limite ? codificar(1600, 0.7) : blob;
      }).then(function (blob) {
        return blob.size > limite ? codificar(1280, 0.7) : blob;
      }).then(function (blob) {
        if (!blob.size || blob.size > limite) throw new Error('A foto reduzida ainda ultrapassa 1,5 MB. Escolha uma imagem menor.');
        return ler(blob, 'readAsDataURL').then(function (url) {
          return miniatura().then(function (mini) { return { nome: fotos.nomeSeguro(arquivo.name), nomeOriginal: arquivo.name || 'foto', mimetype: 'image/jpeg',
            tamanho: blob.size, dados_base64: url.slice(url.indexOf(',') + 1), previa: url, miniatura_base64: mini }; });
        });
      }).finally(function () { if (imagem.close) imagem.close(); });
    });
  };
  GI.fotos = fotos;
})();
