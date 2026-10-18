var ImageCompress = (function () {
  'use strict';

  function scale(width, height, maxEdge) {
    var edge = Math.max(width, height);
    if (edge <= maxEdge) return { width: width, height: height };
    var ratio = maxEdge / edge;
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function draw(image, width, height, quality) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        resolve(blob);
      }, 'image/jpeg', quality);
    });
  }

  function compressToTarget(file, targetBytes) {
    targetBytes = targetBytes || 100 * 1024;
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () {
        var size = scale(image.naturalWidth || image.width, image.naturalHeight || image.height, 1600);
        var quality = 0.82;
        function attempt() {
          draw(image, size.width, size.height, quality).then(function (blob) {
            if (!blob) {
              URL.revokeObjectURL(url);
              reject(new Error('This photo could not be compressed. Try a JPEG or PNG.'));
              return;
            }
            if (blob.size > targetBytes && quality > 0.45) {
              quality = Math.round((quality - 0.1) * 100) / 100;
              attempt();
              return;
            }
            if (blob.size > targetBytes && size.width > 800) {
              size = scale(Math.round(size.width * 0.8), Math.round(size.height * 0.8), 1600);
              quality = 0.75;
              attempt();
              return;
            }
            URL.revokeObjectURL(url);
            resolve(blob);
          });
        }
        attempt();
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('This photo could not be read. Try a JPEG or PNG.'));
      };
      image.src = url;
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var value = String(reader.result || '');
        resolve(value.slice(value.indexOf(',') + 1));
      };
      reader.onerror = function () {
        reject(new Error('Could not read the photo.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  return { compressToTarget: compressToTarget, blobToBase64: blobToBase64 };
})();
