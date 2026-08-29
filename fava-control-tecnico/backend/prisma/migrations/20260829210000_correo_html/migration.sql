-- Fase 9b — el cuerpo HTML del correo, junto al de texto.
--
-- NO SUSTITUYE a `body_text`. Los dos viajan en el mismo envio: hay clientes que
-- bloquean el HTML por completo, y un correo que solo fuera HTML se veria vacio en
-- ellos. El texto es la alternativa, no un resto historico.
--
-- Se guarda RENDERIZADO y no se genera al enviar, por lo mismo que `body_text`: lo que
-- se manda tiene que ser exactamente lo que se encolo. Si manana se corrige una
-- plantilla, los avisos que ya estaban en cola siguen diciendo lo que decian cuando el
-- hecho ocurrio — un aviso es la foto de un momento, no una consulta en vivo.

ALTER TABLE "notifications" ADD COLUMN "body_html" TEXT;

-- Nullable a proposito: las filas que ya estan encoladas no tienen HTML y se mandan
-- como texto, que es exactamente lo que se decidio cuando se encolaron. Rellenarlas
-- ahora seria reescribir un aviso pasado.
