import { Injectable } from '@nestjs/common';
import { FlightPathService } from '../../../business/flight-path/flight-path.service';
import {
  FlightMissionStrategy,
  MissionStrategyPayload,
} from '../mission-strategy.interface';

@Injectable()
export class MappingMissionStrategy implements FlightMissionStrategy {
  readonly type = 'mapping';

  constructor(private readonly flightPathService: FlightPathService) {}

  generate(payload: MissionStrategyPayload) {
    const {
      polygon,
      spacing,
      startPoint,
      endPoint,
      angle,
      margin,
      captureInterval,
    } = payload;

    return this.flightPathService.generateFlightPath(
      polygon,
      spacing,
      startPoint,
      endPoint,
      angle,
      margin,
      captureInterval,
      {
        missionType: this.type,
        gimbalPitchDeg: 0,
        lateralOffset: 0,
      },
    );
  }
}

