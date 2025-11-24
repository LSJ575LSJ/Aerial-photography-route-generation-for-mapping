import { Module } from '@nestjs/common';
import { FlightPathController } from './flight-path.controller';
import { FlightPathService } from './flight-path.service';
import { MappingMissionStrategy } from '../../common/flight-path/mapping/mapping.strategy';
import { ObliqueMissionStrategy } from '../../common/flight-path/oblique/oblique.strategy';
import { MissionStrategyFactory } from '../../common/flight-path/mission-strategy.factory';
import { StripMissionStrategy } from '../../common/flight-path/strip/strip.strategy';

@Module({
  controllers: [FlightPathController],
  providers: [
    FlightPathService,
    MappingMissionStrategy,
    ObliqueMissionStrategy,
    StripMissionStrategy,
    MissionStrategyFactory,
  ],
  exports: [FlightPathService], // 如果其他模块需要使用
})
export class FlightPathModule {}
