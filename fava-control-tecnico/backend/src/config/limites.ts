/**
 * Los dos topes de tamaño, JUNTOS, porque uno depende del otro.
 *
 * Estaban separados —el del comprobante en el controlador, el del cuerpo JSON en
 * ninguna parte— y de ahí salió NOTA-08b rota entera: el endpoint anunciaba 2 MB por
 * comprobante y Express, sin límite configurado, usaba su defecto de 100 KB. Con 60 KB
 * subía; con 200 KB devolvía `Cannot POST /api/weekly-notes/<id>/receipts`, porque el
 * cuerpo se descarta ANTES de enrutar y la petición no llega a casar con ninguna ruta.
 * O sea que la foto de un ticket ya redimensionada (~300 KB) fallaba siempre, y el
 * síntoma decía «esa ruta no existe» cuando existía perfectamente.
 *
 * Aquí el límite del cuerpo se CALCULA del de comprobante, así que subir uno sube el
 * otro y no se pueden volver a desincronizar.
 */

/**
 * 8 MB por comprobante.
 *
 * Eran 2 MB y se quedaban cortos justo donde importa: el cliente reduce las FOTOS, pero
 * un PDF no se toca —no se puede recomprimir en el navegador— y el que sale de una app
 * de escaneo o del banco pasa de 5 MB con facilidad. El técnico que se topaba con eso
 * en obra no tenía forma de arreglarlo desde el móvil.
 *
 * El tope no decide cuánto se guarda: lo decide lo que se sube. Las fotos entran a ~1 MB
 * porque el cliente baja la calidad hasta que caben (ver `reducirImagen`), así que 8 MB
 * es un techo para el caso raro, no el tamaño esperado. Con 14 técnicos y la base en
 * 11 MB de un volumen de 5 GB, el margen es amplio — pero es un dato que conviene mirar
 * de vez en cuando, no una garantía eterna.
 */
export const RECIBO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * El cuerpo JSON más grande que se acepta: el comprobante más el 33 % que engorda el
 * base64, más un margen para la etiqueta y el resto del JSON.
 *
 * No se sube «por si acaso»: cada byte de más es superficie para quien quiera llenar
 * el volumen de Postgres.
 */
export const LIMITE_CUERPO_JSON = `${Math.ceil((RECIBO_MAX_BYTES * 4) / 3 / 1024 / 1024) + 1}mb`;
