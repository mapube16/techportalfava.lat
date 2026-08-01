import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { CONSULTA_MOVIL, esMovil, observarMovil } from './useIsMobile';
import type { MediaLike, VentanaLike } from './useIsMobile';

/**
 * `window.matchMedia` falso, mismo patron que el `Storage` falso de 03-02: la
 * dependencia del navegador entra por parametro, asi que el modulo se prueba sin
 * DOM simulado y sin instalar nada.
 *
 * Registra las consultas pedidas y cuenta los oyentes vivos — sin ese contador no
 * hay forma de probar que la limpieza se desuscribe de verdad.
 */
function ventanaFalsa(movilInicial: boolean) {
  const oyentes: ((e: { matches: boolean }) => void)[] = [];
  const consultas: string[] = [];
  const mql: MediaLike = {
    matches: movilInicial,
    addEventListener(_tipo, oyente) {
      oyentes.push(oyente);
    },
    removeEventListener(_tipo, oyente) {
      const i = oyentes.indexOf(oyente);
      if (i >= 0) oyentes.splice(i, 1);
    },
  };
  const win: VentanaLike = {
    matchMedia: (q) => {
      consultas.push(q);
      return mql;
    },
  };
  return {
    win,
    consultas,
    get oyentes() {
      return oyentes.length;
    },
    /** Lo que hace un giro de pantalla: cambia `matches` y avisa a los oyentes. */
    redimensionar(movil: boolean) {
      mql.matches = movil;
      for (const o of [...oyentes]) o({ matches: movil });
    },
  };
}

/**
 * El punto de ruptura esta escrito dos veces —una en TS y otra en CSS— porque una
 * media query no puede importar un modulo. Este es el unico caso que impide que se
 * separen: sin el, cambiar 899 en un solo lado deja la suite verde (verificado por
 * mutacion) y la app con una franja de anchos que tiene el layout de escritorio y
 * las tarjetas de movil a la vez.
 */
describe('el punto de ruptura, escrito en TS y en CSS', () => {
  it('index.css rompe en el mismo pixel que CONSULTA_MOVIL', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    const consultas = [...css.matchAll(/@media\s*\(([^)]*max-width[^)]*)\)/g)]
      .map((m) => `(${m[1].trim()})`);
    assert.ok(consultas.length > 0, 'index.css tiene que traer la media query del movil');
    assert.deepEqual([...new Set(consultas)], [CONSULTA_MOVIL]);
  });
});

/**
 * Contraste del texto secundario. Va aqui y no en un comentario porque un comentario
 * no se entera de que alguien retoco la paleta: `--text-3` daba 3.12:1 en claro y
 * 4.19:1 en oscuro, y nada lo dijo hasta que se midio a mano.
 *
 * Formula de WCAG 2.x: luminancia relativa y (L1+0.05)/(L2+0.05).
 */
const lineal = (canal: number): number => {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminancia = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lineal((n >> 16) & 255) + 0.7152 * lineal((n >> 8) & 255) + 0.0722 * lineal(n & 255);
};
const contraste = (a: string, b: string): number => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('contraste del texto secundario', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  /**
   * El valor de una variable en el bloque del tema pedido (el oscuro va despues).
   *
   * El corte admite comilla SIMPLE y DOBLE en el selector. Antes solo aceptaba la
   * doble y un formateo del CSS lo cambio: el test no encontraba el bloque oscuro y
   * fallaba por una comilla, no por un color. Un guarda-rail que se rompe con el
   * formato acaba desactivado, que es peor que no tenerlo.
   */
  const token = (nombre: string, tema: 'claro' | 'oscuro'): string => {
    const bloque = css.split(/\.fava\[data-theme=['"]dark['"]\]/);
    assert.equal(bloque.length, 2, 'index.css tiene que traer exactamente un bloque de tema oscuro');
    const trozo = tema === 'claro' ? bloque[0] : bloque[1];
    const m = trozo.match(new RegExp(`--${nombre}:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(m, `no se encuentra --${nombre} en el tema ${tema}`);
    return m[1];
  };

  // `th` (cabecera de tabla, 11px en mayusculas) pinta --text-3 sobre --surface-2:
  // es el fondo mas exigente sobre el que este color hace de TEXTO.
  for (const tema of ['claro', 'oscuro'] as const) {
    for (const fondo of ['surface', 'surface-2'] as const) {
      it(`--text-3 sobre --${fondo} pasa 4.5:1 en tema ${tema}`, () => {
        const r = contraste(token('text-3', tema), token(fondo, tema));
        assert.ok(r >= 4.5, `${r.toFixed(2)}:1 — texto normal necesita 4.5:1`);
      });
    }
  }
});

describe('esMovil', () => {
  it('lee el ancho real del dispositivo, no un toggle', () => {
    assert.equal(esMovil(ventanaFalsa(true).win), true);
    assert.equal(esMovil(ventanaFalsa(false).win), false);
  });

  it('pregunta por el punto de ruptura de la app', () => {
    const v = ventanaFalsa(true);
    esMovil(v.win);
    assert.deepEqual(v.consultas, [CONSULTA_MOVIL]);
  });

  it('sin window devuelve false sin lanzar', () => {
    assert.equal(esMovil(null), false);
  });

  it('con un window sin matchMedia devuelve false sin lanzar', () => {
    assert.equal(esMovil({}), false);
  });
});

describe('observarMovil', () => {
  it('avisa con el valor nuevo cuando cambia el ancho', () => {
    const v = ventanaFalsa(false);
    const vistos: boolean[] = [];
    observarMovil((m) => vistos.push(m), v.win);
    v.redimensionar(true);
    v.redimensionar(false);
    assert.deepEqual(vistos, [true, false]);
  });

  it('NO avisa antes de que cambie nada: el valor inicial es cosa de esMovil', () => {
    const v = ventanaFalsa(true);
    const vistos: boolean[] = [];
    observarMovil((m) => vistos.push(m), v.win);
    assert.deepEqual(vistos, []);
  });

  it('la limpieza se desuscribe: sin ella cada montaje deja un oyente vivo', () => {
    const v = ventanaFalsa(false);
    const vistos: boolean[] = [];
    const limpiar = observarMovil((m) => vistos.push(m), v.win);
    assert.equal(v.oyentes, 1);
    limpiar();
    assert.equal(v.oyentes, 0);
    v.redimensionar(true);
    assert.deepEqual(vistos, [], 'el oyente desuscrito no puede seguir recibiendo cambios');
  });

  it('sin window devuelve una limpieza inocua y no lanza', () => {
    const limpiar = observarMovil(() => {}, null);
    assert.equal(typeof limpiar, 'function');
    limpiar();
  });

  it('con un window sin matchMedia devuelve una limpieza inocua y no lanza', () => {
    const limpiar = observarMovil(() => {}, {});
    assert.equal(typeof limpiar, 'function');
    limpiar();
  });
});
