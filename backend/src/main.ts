import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 启用 CORS，允许前端跨域访问
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], // 前端开发服务器地址
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`后端服务已启动: http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
