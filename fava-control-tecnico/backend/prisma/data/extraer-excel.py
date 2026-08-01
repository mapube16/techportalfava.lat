"""
Excel -> NDJSON. El único paso que necesita Python: `xlrd` lee el .xls (BIFF) y no
hay equivalente decente en Node. Se corre UNA vez y su salida se versiona, para que
`migrate-excel.ts` sea reproducible sin Python instalado.

    python prisma/data/extraer-excel.py "<ruta al .xls>"

No normaliza NADA salvo la fecha: los nombres, los roles y los proyectos salen tal
cual están en la hoja. Las decisiones de fusión viven en `migrate-excel.ts`, donde se
pueden leer, discutir y cambiar sin volver a tocar el .xls.
"""
import datetime
import json
import sys

import xlrd

# La hoja `Parametros` numera los conceptos y esa numeración es la fuente de verdad,
# NO la columna `Dato`: el catálogo del propio Excel tiene un error de origen y llama
# «LR» tanto al 4 (no remunerado, externos) como al 5 (libre remunerado, internos).
# Alguien tecleó «NR» a mano en 560 filas y dejó otras 1.021 sin corregir.
CONCEPTO = {1: 'DC', 2: 'DFD', 3: 'DVSF', 4: 'NR', 5: 'LR', 6: 'DVRC', 8: 'MD', 9: 'IL'}

COLUMNAS = ['TÉCNICO', 'Tipo', 'Proyecto', 'Maquina', 'Año', 'Mes', 'Día', 'Concepto', 'Dato', 'Novedad']


def filas(libro, hoja):
    s = libro.sheet_by_name(hoja)
    idx = {c: [str(s.cell_value(0, i)).strip() for i in range(s.ncols)].index(c) for c in COLUMNAS}
    for r in range(1, s.nrows):
        def txt(col):
            return str(s.cell_value(r, idx[col])).strip()

        def num(col):
            v = s.cell_value(r, idx[col])
            try:
                return int(float(v))
            except (TypeError, ValueError):
                return None

        concepto = num('Concepto')
        # Sin concepto la fila no dice nada: son las 1.009 celdas de relleno del
        # calendario. Se cuentan en el resumen y no se emiten.
        if concepto is None:
            yield None
            continue

        anio, dia = num('Año'), num('Día')
        mes = txt('Mes')            # llega como '01_Enero ', con el número delante
        try:
            fecha = datetime.date(anio, int(mes.split('_')[0]), dia).isoformat()
        except (TypeError, ValueError, IndexError):
            fecha = None

        yield {
            'tecnico': txt('TÉCNICO'),
            'tipo': txt('Tipo'),
            'proyecto': txt('Proyecto'),
            'maquina': txt('Maquina'),
            'fecha': fecha,
            'concepto': concepto,
            'codigo': CONCEPTO.get(concepto),
            # «En Fabrica» va pegado a la etiqueta del 1 y del 2 en el catálogo, pero
            # los datos usan las dos variantes bajo el mismo número: es un modificador.
            'enFabrica': 'fabrica' in txt('Novedad').lower().replace('á', 'a'),
            'datoCrudo': txt('Dato'),
            'hoja': hoja,
            'fila': r + 1,
        }


def main():
    if len(sys.argv) < 2:
        sys.exit('uso: extraer-excel.py <ruta al .xls>')
    libro = xlrd.open_workbook(sys.argv[1])
    salida, vacias, sin_fecha, sin_codigo = [], 0, 0, 0

    for hoja in ('2025', '2026'):
        for f in filas(libro, hoja):
            if f is None:
                vacias += 1
                continue
            if not f['fecha']:
                sin_fecha += 1
                continue
            if not f['codigo']:
                sin_codigo += 1
            salida.append(f)

    destino = 'prisma/data/excel-2025-2026.ndjson'
    with open(destino, 'w', encoding='utf-8', newline='\n') as fh:
        for f in salida:
            fh.write(json.dumps(f, ensure_ascii=False) + '\n')

    print(f'{len(salida)} filas -> {destino}')
    print(f'  descartadas por vacías (relleno del calendario): {vacias}')
    print(f'  descartadas por fecha ilegible: {sin_fecha}')
    print(f'  con un concepto fuera del catálogo de 8: {sin_codigo}')


if __name__ == '__main__':
    main()
