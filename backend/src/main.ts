import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 根据 NODE_ENV 加载对应的 .env 文件
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : process.env.NODE_ENV === 'local' || process.env.LOAD_LOCAL_ENV === 'true'
  ? '.env.local'
  : '.env';

// 加载环境变量文件
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 从环境变量读取 CORS 配置
  const corsOrigin = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  
  // 启用 CORS，允许前端跨域访问
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`后端服务已启动: http://localhost:${port}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`加载的环境变量文件: ${envFile}`);
}
bootstrap();
