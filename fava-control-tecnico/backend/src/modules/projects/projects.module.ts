import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ProjectsService } from './projects.service';
import { SoldDaysService } from './sold-days.service';

@Module({
  controllers: [ProjectsController, OrdersController],
  providers: [ProjectsService, SoldDaysService, OrdersService],
})
export class ProjectsModule {}
