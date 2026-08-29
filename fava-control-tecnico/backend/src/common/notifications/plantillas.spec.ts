/**
 * Lo unico que las tres lenguas se pueden hacer entre si es DERIVAR: que alguien anada
 * un aviso en castellano y se olvide del italiano. El CHECK `users_lang_valido` de la
 * migracion cubre la otra direccion (que no llegue un idioma sin plantilla); esto cubre
 * esta, y cuesta seis lineas.
 */
import { LANGS, PLANTILLAS, type Kind, idioma, render } from './plantillas';

const KINDS: Kind[] = ['note_returned', 'note_approved', 'week_missing', 'admin_digest', 'invitacion'];

const DATOS = {
  nombre: 'Giuliano',
  proyecto: 'Pasta Corta',
  semana: '2026-08-24',
  comentario: 'Falta la maquina en el martes',
  enlace: 'https://ejemplo.test/',
  lista: ['Ivan Cortes', 'Leomar Klein'],
  inalcanzables: ['Camilo Cruz'],
  invitadoPor: 'Andrea Scapin',
};

describe('plantillas de correo', () => {
  it('las tres lenguas tienen exactamente los mismos avisos', () => {
    const es = Object.keys(PLANTILLAS.es).sort();
    expect(Object.keys(PLANTILLAS.it).sort()).toEqual(es);
    expect(Object.keys(PLANTILLAS.pt).sort()).toEqual(es);
    expect(es).toEqual([...KINDS].sort());
  });

  describe.each(LANGS)('idioma %s', (lang) => {
    it.each(KINDS)('%s se renderiza sin huecos', (kind) => {
      const { subject, bodyText } = render(kind, lang, DATOS);
      // 'undefined' es el fallo real de una plantilla mal escrita: sale un correo que
      // dice «Tu nota de undefined fue devuelta» y nadie lo ve hasta que lo recibe.
      expect(subject).not.toMatch(/undefined|NaN/);
      expect(bodyText).not.toMatch(/undefined|NaN/);
      expect(subject.length).toBeGreaterThan(0);
      expect(bodyText).toContain(DATOS.enlace);
    });
  });

  it('el resumen nombra a los inalcanzables, que es su unico modo de salir a la luz', () => {
    const { bodyText } = render('admin_digest', 'es', DATOS);
    expect(bodyText).toContain('Camilo Cruz');
    expect(bodyText).toContain('Ivan Cortes');
  });

  it('sin enlace no se pinta una URL rota', () => {
    const { bodyText } = render('week_missing', 'es', { ...DATOS, enlace: undefined });
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('http');
  });

  it('un idioma que no existe cae a castellano en vez de reventar', () => {
    expect(idioma('pt')).toBe('pt');
    expect(idioma('pt-BR')).toBe('es');
    expect(idioma(null)).toBe('es');
  });
});
