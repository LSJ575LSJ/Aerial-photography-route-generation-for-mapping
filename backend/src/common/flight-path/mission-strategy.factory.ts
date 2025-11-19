import { Injectable } from '@nestjs/common';
import { FlightMissionType } from '../../business/flight-path/flight-path.interface';
import { FlightMissionStrategy } from './mission-strategy.interface';
import { MappingMissionStrategy } from './mapping/mapping.strategy';
import { ObliqueMissionStrategy } from './oblique/oblique.strategy';

@Injectable()
export class MissionStrategyFactory {
  private readonly registry: Record<FlightMissionType, FlightMissionStrategy>;

  constructor(
    mappingStrategy: MappingMissionStrategy,
    obliqueStrategy: ObliqueMissionStrategy,
  ) {
    this.registry = {
      mapping: mappingStrategy,
      oblique: obliqueStrategy,
    };
  }

  getStrategy(type: FlightMissionType = 'mapping'): FlightMissionStrategy {
    return this.registry[type] ?? this.registry.mapping;
  }
}

