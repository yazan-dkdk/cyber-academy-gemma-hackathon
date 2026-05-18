import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { HttpLabOrchestratorClient, LabOrchestratorClient } from './lab-orchestrator.client';
import { LabsController } from './labs.controller';
import { LabsService } from './labs.service';

@Module({
  imports: [AuthModule, SessionModule],
  controllers: [LabsController],
  providers: [
    LabsService,
    {
      provide: LabOrchestratorClient,
      useClass: HttpLabOrchestratorClient,
    },
  ],
})
export class LabsModule {}
