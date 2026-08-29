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

  // ── El HTML: las reglas del correo no son las de la web ──

  describe.each(LANGS)('html %s', (lang) => {
    it.each(KINDS)('%s cumple lo que exige un cliente de correo', (kind) => {
      const { bodyHtml, bodyText } = render(kind, lang, DATOS);

      // Sin <style> en el head: Gmail lo tira y el correo saldria en blanco y negro.
      expect(bodyHtml).not.toMatch(/<style/i);
      // Sin nada remoto: la mitad de los clientes lo bloquean y quedaria un hueco.
      expect(bodyHtml).not.toMatch(/<img|<link|@import/i);
      // Maquetado con tablas: Outlook usa el motor de Word, flexbox no existe.
      expect(bodyHtml).toMatch(/<table/);
      expect(bodyHtml).not.toMatch(/display:\s*flex|display:\s*grid/);
      // Un <button> no se pinta en la mayoria de clientes; el boton es un <a>.
      expect(bodyHtml).not.toMatch(/<button/i);
      expect(bodyHtml).not.toMatch(/undefined|NaN|\[object/);
      // El texto plano SIEMPRE va: hay clientes que bloquean HTML por completo.
      expect(bodyText.length).toBeGreaterThan(0);
    });
  });

  it('el HTML escapa lo que escribe una persona: un motivo con < no rompe la maqueta', () => {
    const { bodyHtml } = render('note_returned', 'es', {
      ...DATOS,
      comentario: '<script>alert(1)</script> falta el martes',
    });
    expect(bodyHtml).not.toContain('<script>');
    expect(bodyHtml).toContain('&lt;script&gt;');
  });

  it('sin enlace no se pinta boton, en los dos formatos', () => {
    const sinEnlace = { ...DATOS, enlace: undefined };
    const { bodyHtml, bodyText } = render('week_missing', 'es', sinEnlace);
    // Un boton que no lleva a ningun sitio es peor que ninguno.
    expect(bodyHtml).not.toContain('href=');
    expect(bodyText).not.toContain('http');
  });

});
