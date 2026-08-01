import { ConflictException } from '@nestjs/common';
import { WeeklyNotesService } from './weekly-notes.service';

// El render real (pdfmake + fuentes + decodificar el PNG de la firma) es harina de
// otro costal: ya está verificado a mano contra el PDF de referencia (nota-pdf.ts).
// Lo que este archivo prueba es LA ORQUESTACIÓN — que las dos firmas apunten al mismo
// hash, que no se pueda firmar dos veces, que reabrir limpie el candado — así que el
// render se sustituye por bytes fijos y no hace falta un PNG válido de verdad.
jest.mock('./nota-pdf', () => ({
  renderizarNota: jest.fn().mockResolvedValue(Buffer.from('PDF-FALSO')),
}));

const findUnique = jest.fn();
const update = jest.fn();
const dailyEntryFindMany = jest.fn();
const dailyEntryUpdateMany = jest.fn();
const conceptFindMany = jest.fn();
const notePdfCreate = jest.fn();
const noteSignatureCreate = jest.fn();

const prismaFalso = {
  client: {
    weeklyNote: { findUnique, update },
    dailyEntry: { findMany: dailyEntryFindMany, updateMany: dailyEntryUpdateMany },
    concept: { findMany: conceptFindMany },
    notePdf: { create: notePdfCreate },
    noteSignature: { create: noteSignatureCreate },
  },
} as never;

const registrar = jest.fn().mockResolvedValue(undefined);
const auditFalso = { registrar } as never;

const actor = { id: 'u-1', name: 'Admin Uno' };

/** Superconjunto de todo lo que `weeklyNote.findUnique` puede pedir en el archivo: un
    mock no respeta `select`, así que un solo fixture sirve a los dos call-sites que
    usa `firmar` (el candado y, dentro, `datosParaPdf`). */
const notaFixture = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  technicianId: 't-1',
  projectId: 'p-1',
  weekStart: new Date('2026-07-20T00:00:00.000Z'),
  status: 'submitted',
  roleTypeId: null,
  returnComment: null,
  updatedAt: new Date('2026-07-27T10:00:00.000Z'),
  version: 1,
  signedContentHash: null as string | null,
  technician: { fullName: 'Ivan Cortés' },
  project: {
    name: 'Proyecto X',
    clientName: 'Cliente X',
    locality: 'Santo Domingo',
    country: 'RD',
    supply: 'Suministro',
    contractNumber: '12345',
  },
  roleType: null,
  gastosTecnico: null,
  anticiposCliente: null,
  ...over,
});

const firmaEntrada = (nombre: string) => ({
  signerName: nombre,
  declarationAccepted: true as const,
  imagePng: 'trazo-falso-en-base64',
});

describe('WeeklyNotesService', () => {
  let service: WeeklyNotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    dailyEntryFindMany.mockResolvedValue([]);
    conceptFindMany.mockResolvedValue([{ code: 'DC', labelEs: 'Día completo' }]);
    service = new WeeklyNotesService(prismaFalso, auditFalso);
  });

  describe('gastos', () => {
    it('rechaza escribir sobre una nota ya firmada', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ signedContentHash: 'abc123' }));
      await expect(service.gastos(actor, 'n-1', [], [])).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });

    it('guarda las líneas cuando la nota todavía no está firmada', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ signedContentHash: null }));
      update.mockResolvedValueOnce(notaFixture());
      const gastosTecnico = [{ descripcion: 'Transporte', valor: '50.000' }];

      await service.gastos(actor, 'n-1', gastosTecnico, []);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { gastosTecnico, anticiposCliente: [] } }),
      );
      expect(registrar).toHaveBeenCalledTimes(1);
    });
  });

  describe('firmar', () => {
    const cuerpo = () => ({
      technician: firmaEntrada('Ivan Cortés'),
      client: firmaEntrada('Robert Peña'),
      ip: '190.1.2.3',
      userAgent: 'jest',
    });

    it('rechaza firmar una nota que no está enviada', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ status: 'draft' }));
      await expect(service.firmar(actor, 'n-1', cuerpo())).rejects.toThrow(ConflictException);
      expect(notePdfCreate).not.toHaveBeenCalled();
    });

    it('rechaza firmar dos veces la misma versión', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ signedContentHash: 'ya-firmada' }));
      await expect(service.firmar(actor, 'n-1', cuerpo())).rejects.toThrow(ConflictException);
      expect(notePdfCreate).not.toHaveBeenCalled();
    });

    it('congela UN pdf con las DOS firmas apuntando al mismo hash', async () => {
      findUnique
        .mockResolvedValueOnce(notaFixture()) // el candado en firmar()
        .mockResolvedValueOnce(notaFixture()); // dentro de datosParaPdf()
      update.mockResolvedValueOnce(notaFixture());

      await service.firmar(actor, 'n-1', cuerpo());

      expect(notePdfCreate).toHaveBeenCalledTimes(1);
      const [{ data: pdfData }] = notePdfCreate.mock.calls[0];
      expect(pdfData.version).toBe(1);
      expect(typeof pdfData.sha256).toBe('string');
      expect(pdfData.sha256).toHaveLength(64); // sha256 en hex

      expect(noteSignatureCreate).toHaveBeenCalledTimes(2);
      const firmas = noteSignatureCreate.mock.calls.map(([{ data }]) => data);
      expect(firmas.map((f) => f.kind).sort()).toEqual(['client', 'technician']);
      for (const f of firmas) {
        expect(f.pdfSha256).toBe(pdfData.sha256);
        expect(f.declarationAccepted).toBe(true);
      }

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { signedContentHash: pdfData.sha256 } }));
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ action: 'sign' }));
    });
  });

  describe('transiciones sobre una nota firmada', () => {
    it('reopen sube la versión y limpia signedContentHash', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ status: 'approved', version: 1, signedContentHash: 'hash-v1' }));
      update.mockResolvedValueOnce(notaFixture({ status: 'draft', version: 2, signedContentHash: null }));

      await service.reopen(actor, 'n-1', 'motivo de prueba');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: { increment: 1 }, signedContentHash: null }),
        }),
      );
    });

    it('rechaza devolver una nota ya firmada — hay que reabrirla', async () => {
      findUnique.mockResolvedValueOnce(notaFixture({ status: 'submitted', signedContentHash: 'hash-v1' }));
      await expect(service.return_(actor, 'n-1', 'algo está mal')).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
