import { Logger } from '@nestjs/common';

import { createApplication } from './application';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await createApplication();
  const configService = app.get(AppConfigService);

  await app.listen(configService.port, '0.0.0.0');
  Logger.log(`Cyber Academy backend listening on ${configService.port}`, 'Bootstrap');
}

void bootstrap();
