import { Module } from '@nestjs/common';
import { FlightPathController } from './flight-path.controller';
import { FlightPathService } from './flight-path.service';

@Module({
  controllers: [FlightPathController],
  providers: [FlightPathService],
  exports: [FlightPathService], // 如果其他模块需要使用
})
export class FlightPathModule {}

