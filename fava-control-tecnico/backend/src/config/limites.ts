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
 * 2 MB por comprobante. Un ticket escaneado y legible ocupa ~300 KB tras el
 * redimensionado del cliente; el margen es para el que suba un PDF del banco. Sin tope,
 * una foto de móvil sin redimensionar son 3-8 MB y el volumen de Postgres tiene 5 GB.
 */
export const RECIBO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * El cuerpo JSON más grande que se acepta: el comprobante más el 33 % que engorda el
 * base64, más un margen para la etiqueta y el resto del JSON.
 *
 * No se sube «por si acaso»: cada byte de más es superficie para quien quiera llenar
 * el volumen de Postgres.
 */
export const LIMITE_CUERPO_JSON = `${Math.ceil((RECIBO_MAX_BYTES * 4) / 3 / 1024 / 1024) + 1}mb`;
