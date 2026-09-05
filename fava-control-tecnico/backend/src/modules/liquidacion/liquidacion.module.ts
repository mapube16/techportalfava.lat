import { Module } from '@nestjs/common';
import { LiquidacionController } from './liquidacion.controller';
import { LiquidacionService } from './liquidacion.service';

@Module({
  controllers: [LiquidacionController],
  providers: [LiquidacionService],
})
export class LiquidacionModule {}
