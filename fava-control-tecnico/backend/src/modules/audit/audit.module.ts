import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
