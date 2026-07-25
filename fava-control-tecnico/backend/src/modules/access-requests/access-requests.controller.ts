import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AllowUnprovisioned } from '../../common/auth/allow-unprovisioned.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AccessRequestsService } from './access-requests.service';

@Controller('api/access-requests')
export class AccessRequestsController {
  constructor(private readonly service: AccessRequestsService) {}

  /**
   * El unico endpoint escribible por cualquier miembro del tenant: por eso es el
   * unico con rate limit (el ThrottlerGuard no es global, decision del Plan 01-01).
   */
  @Post()
  @AllowUnprovisioned()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  solicitar(@Req() req: Request) {
    // biome-ignore lint: con token valido el guard siempre deja req.entra.
    return this.service.solicitar(req.entra!, req.user ?? null);
  }

  @Get()
  @Roles('A', 'S')
  listar() {
    return this.service.listar();
  }

  @Patch(':id')
  @Roles('A', 'S')
  descartar(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status?: string }) {
    return this.service.descartar(id, body?.status ?? '');
  }
}
