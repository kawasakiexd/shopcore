import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { ProblemDetailsSchema } from './common/errors/problem-details.js';
import { zodToOpenApi } from './common/http/zod-openapi.js';

export function setupSwagger(app: INestApplication, publicApiUrl: string): void {
  const config = new DocumentBuilder()
    .setTitle('ShopCore API')
    .setDescription(
      [
        'Production-style e-commerce REST API. Money is integer minor units (USD cents). Errors use RFC 9457 `application/problem+json`.',
        '',
        '## Demo credentials',
        '',
        '- Admin: `admin@example.com` / `DemoAdmin123!`',
        '- Customer: `customer@example.com` / `DemoCustomer123!`',
        '- Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC',
        '',
        'Walkthrough: authorize as customer → browse `/v1/products` → `PUT /v1/cart/items/{id}` → `POST /v1/orders` → `POST /v1/orders/{id}/checkout` → pay → order becomes `PAID`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer(publicApiUrl)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ProblemDetails = zodToOpenApi(ProblemDetailsSchema, 'output');

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    yamlDocumentUrl: 'docs/openapi.yaml',
    swaggerOptions: { persistAuthorization: true },
  });
}
