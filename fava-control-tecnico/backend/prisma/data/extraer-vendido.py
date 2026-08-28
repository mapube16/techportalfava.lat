"""
Las hojas de PROYECTO del Excel -> NDJSON con la matriz de dias VENDIDOS.

    python prisma/data/extraer-vendido.py "<ruta al .xls>"

Es el hermano de `extraer-excel.py`: aquel saca el lado EJECUTADO (la bitacora diaria),
este saca el lado VENDIDO (lo que dice el contrato). Sin los dos no hay delta, y el
delta es el numero con el que se negocia.

MISMA REGLA: no normaliza NADA salvo la fase. Roles y nombres salen literales; las
decisiones de fusion viven en `migrate-vendido.ts`, donde se pueden leer y discutir.

DOS FORMATOS EN EL MISMO LIBRO, y los dos hay que entenderlos:

  A) Lucchetti, JAV, Cibao, Pasta Sole -- en italiano, con los bloques
     `SUPERVISIONE MECCANICA ELETTRICA` y
     `SUPERVISIONE SOFTWARE - ELECT - MECCANICO -COLLADO` (COLLADO es errata de
     COLLAUDO), y columnas VENDIDO / EJECUTADO / Delta.

  B) `J Macedo Brasil- final` -- los mismos dos bloques se llaman `Fase Montaggio` y
     `Fase Collaudo`, y las columnas VENDUTO / ESEGUITO / DELTA. Ademas trae coste
     unitario y total, que aqui no se leen: el modelo no guarda dinero por linea.

Que esas cuatro etiquetas signifiquen montaje y collaudo NO es una interpretacion mia:
esta demostrado en `.planning/HALLAZGOS-EXCEL-COMPLETO.md` § 4.4, con la prueba textual
de las cinco hojas.

COMO SE LOCALIZAN LAS COLUMNAS. No por posicion fija: cada hoja pone el bloque en una
columna distinta (c7 en Cibao, c8 en JAV). Se busca la celda `VENDIDO`/`VENDUTO` y se
lee relativo a ella -- el rol dos a la izquierda, el tecnico una. Verificado en las
cinco hojas.
"""
import json
import re
import sys

import xlrd

HOJAS = [
    'Lucchetti Chile ',
    'JAV Brasil',
    'Cibao -Rep D',
    'Pasta Sole - Ex Molino Fenix',
    'J Macedo Brasil- final',
]

# El texto del encabezado de bloque -> la fase. Se compara en mayusculas y sin espacios
# repetidos, porque el Excel tiene `Fase  Montaggio ` con dos espacios y sobra final.
FASES = [
    ('SUPERVISIONE MECCANICA', 'MONTAJE'),
    ('FASE MONTAGGIO', 'MONTAJE'),
    ('SUPERVISIONE SOFTWARE', 'COLLAUDO'),
    ('FASE COLLAUDO', 'COLLAUDO'),
]

CABECERA_VENDIDO = ('VENDIDO', 'VENDUTO')

# Filas que cierran un bloque: son sumas, no lineas de venta.
TOTALES = ('TOTALE', 'TOTAL', 'GENERALE')


def limpio(v):
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return re.sub(r'\s+', ' ', str(v)).strip()


def entero(v):
    if isinstance(v, float):
        return int(v)
    s = limpio(v)
    return int(float(s)) if re.fullmatch(r'-?\d+(\.\d+)?', s) else None


def lineas(libro, hoja):
    s = libro.sheet_by_name(hoja)
    grid = [[limpio(s.cell_value(r, c)) for c in range(s.ncols)] for r in range(s.nrows)]

    # La commessa vigente es la ultima vista por ENCIMA de la fila actual: JAV mete tres
    # maquinas en la misma hoja, cada una con la suya, y sin esto todas las lineas
    # colgarian de la primera.
    def commessa_hasta(fila):
        ultima = None
        for r in range(fila + 1):
            for celda in grid[r]:
                m = re.search(r'COMMESSA\s*(\d+)', celda, re.I)
                if m:
                    ultima = m.group(1)
        return ultima

    def fase_hasta(fila):
        ultima = None
        for r in range(fila + 1):
            for celda in grid[r]:
                arriba = celda.upper()
                for texto, fase in FASES:
                    if arriba.startswith(texto):
                        ultima = fase
        return ultima

    for r, fila in enumerate(grid):
        for c, celda in enumerate(fila):
            if celda.upper() not in CABECERA_VENDIDO:
                continue
            fase = fase_hasta(r)
            commessa = commessa_hasta(r)
            if not fase:
                continue
            # Las lineas del bloque: desde la fila siguiente hasta que el rol se vacia
            # o aparece un total.
            ordinal = 0
            for rr in range(r + 1, len(grid)):
                rol = grid[rr][c - 2] if c >= 2 else ''
                tecnico = grid[rr][c - 1] if c >= 1 else ''
                if not rol:
                    # Una fila sin rol cierra el bloque, salvo que sea la de totales
                    # (que lleva TOTALE en la columna del tecnico).
                    if tecnico.upper() in TOTALES:
                        continue
                    break
                if rol.upper() in TOTALES:
                    break
                # El encabezado del bloque SIGUIENTE cae en la misma columna que los
                # roles (`Fase Collaudo` en J Macedo). Sin esto entra como si fuera una
                # linea de venta con el rol «Fase Collaudo», que no existe.
                if any(rol.upper().startswith(t) for t, _ in FASES):
                    break
                ordinal += 1
                yield {
                    'hoja': hoja,
                    'fila': rr + 1,
                    'commessa': commessa,
                    'fase': fase,
                    'rol': rol,
                    'tecnico': tecnico,
                    # `None` y 0 son cosas distintas: vacio = esta linea no vende (es la
                    # segunda plaza del mismo rol); 0 = se vendio cero.
                    'vendido': entero(s.cell_value(rr, c)),
                    'ejecutado': entero(s.cell_value(rr, c + 1)) if c + 1 < s.ncols else None,
                    'ordinal': ordinal,
                }


def main():
    if len(sys.argv) < 2:
        sys.exit('uso: extraer-vendido.py <ruta al .xls>')
    libro = xlrd.open_workbook(sys.argv[1])

    salida, sin_commessa, sin_vendido = [], 0, 0
    for hoja in HOJAS:
        for f in lineas(libro, hoja):
            if not f['commessa']:
                sin_commessa += 1
            if f['vendido'] is None:
                sin_vendido += 1
            salida.append(f)

    destino = 'prisma/data/vendido.ndjson'
    with open(destino, 'w', encoding='utf-8', newline='\n') as fh:
        for f in salida:
            fh.write(json.dumps(f, ensure_ascii=False) + '\n')

    print(f'{len(salida)} lineas -> {destino}')
    print(f'  sin commessa (no cuelgan de ninguna orden): {sin_commessa}')
    print(f'  sin cifra de vendido (segunda plaza del mismo rol): {sin_vendido}')
    total = sum(f['vendido'] or 0 for f in salida)
    print(f'  dias vendidos sumados: {total}')


if __name__ == '__main__':
    main()
