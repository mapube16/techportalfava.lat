import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TEC_A, TEC_B, appClient, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearProyecto } from './helpers/fixtures';

describe('bootstrap', () => {
  afterAll(async () => {
    await disconnectAll();
  });

  describe('arranque de la app', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('GET /health responde 200 sin autenticacion', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('entorno incompleto', () => {
    it('importar la app lanza si falta ENTRA_TENANT_ID: muere al arrancar, no en la primera peticion', async () => {
      const original = process.env.ENTRA_TENANT_ID;
      jest.resetModules();
      // Sin esto, dotenv releeria backend/.env y repondria la variable que acabamos de quitar.
      jest.doMock('dotenv', () => ({ config: () => ({ parsed: {} }) }));
      delete process.env.ENTRA_TENANT_ID;
      try {
        await expect(import('../src/app.module')).rejects.toThrow(/ENTRA_TENANT_ID/);
      } finally {
        process.env.ENTRA_TENANT_ID = original;
        jest.dontMock('dotenv');
        jest.resetModules();
      }
    });
  });

  describe('helpers de BD para las plans siguientes', () => {
    beforeEach(async () => {
      await truncateAll();
    });

    it('appClient se conecta como fava_app y ownerClient como el owner', async () => {
      const [app] = await appClient.$queryRaw<{ usuario: string }[]>`SELECT current_user AS usuario`;
      const [owner] = await ownerClient.$queryRaw<{ usuario: string }[]>`SELECT current_user AS usuario`;
      expect(app.usuario).toBe('fava_app');
      expect(owner.usuario).not.toBe('fava_app');
    });

    it('truncateAll deja las 4 tablas vacias entre tests', async () => {
      await ownerClient.dailyEntry.createMany({
        data: [
          { technicianId: TEC_A, date: new Date('2026-01-05') },
          { technicianId: TEC_B, date: new Date('2026-01-05') },
        ],
      });
      // Desde la Fase 4 la nota cuelga de un PROYECTO: la firma el cliente.
      const proyecto = await crearProyecto();
      await ownerClient.weeklyNote.create({
        data: { technicianId: TEC_A, weekStart: new Date('2026-01-05'), projectId: proyecto.id },
      });
      await ownerClient.user.create({
        data: { email: 'truncate@fava.local', displayName: 'Truncate', roles: ['T'] },
      });
      await ownerClient.accessRequest.create({
        data: { entraOid: 'oid-truncate', email: 'truncate@fava.local', displayName: 'Truncate' },
      });

      await truncateAll();

      expect(await ownerClient.dailyEntry.count()).toBe(0);
      expect(await ownerClient.weeklyNote.count()).toBe(0);
      expect(await ownerClient.user.count()).toBe(0);
      expect(await ownerClient.accessRequest.count()).toBe(0);
    });
  });
});
