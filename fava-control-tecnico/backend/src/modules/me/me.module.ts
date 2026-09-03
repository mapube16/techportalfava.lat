import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MisKpisController } from './mis-kpis.controller';
import { MisKpisService } from './mis-kpis.service';

@Module({
  controllers: [MeController, MisKpisController],
  providers: [MisKpisService],
})
export class MeModule {}
