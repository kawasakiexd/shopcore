import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DemoService } from '../modules/demo/demo.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});
try {
  const demo = app.get(DemoService);
  await demo.reset();
  console.log('Demo reset complete');
} finally {
  await app.close();
}
