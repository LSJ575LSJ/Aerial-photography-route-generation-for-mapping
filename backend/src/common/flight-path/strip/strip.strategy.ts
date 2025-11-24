import { Injectable, Logger } from '@nestjs/common';
import {
  FlightMissionType,
  FlightPathLine,
  FlightPathResult,
  Point,
  Polygon,
} from '../../../business/flight-path/flight-path.interface';
import { FlightPathService } from '../../../business/flight-path/flight-path.service';
import {
  FlightMissionStrategy,
  MissionStrategyPayload,
  StripSegmentPayload,
} from '../mission-strategy.interface';

@Injectable()
export class StripMissionStrategy implements FlightMissionStrategy {
  readonly type: FlightMissionType = 'strip';
  private readonly logger = new Logger(StripMissionStrategy.name);

  constructor(private readonly flightPathService: FlightPathService) {}

  generate(payload: MissionStrategyPayload): FlightPathResult {
    const { stripSegments, spacing, captureInterval } = payload;

    if (!stripSegments || stripSegments.length === 0) {
      this.logger.error('带状航线任务缺少 segments 数据');
      throw new Error('Strip mission requires at least one segment.');
    }

    this.logger.debug(`Strip mission -> segments: ${stripSegments.length}`);

    const lines: FlightPathLine[] = stripSegments.map((segment) => {
      const heading = this.calculateHeading(segment.p1, segment.p2);//求航向
      const polygon = this.toPolygon(segment);//将角点转换为多边形

      const partial = this.flightPathService.generateFlightPath(
        polygon,
        spacing,
        segment.p1,
        segment.p2,
        heading,
        0,
        captureInterval,
        {
          missionType: this.type,
        },
      );

      return {
        path: partial.path,
        waypoints: partial.waypoints,
        capturePoints: partial.capturePoints,
      };
    });

    const primary = lines[0] ?? { path: [], waypoints: [], capturePoints: [] };

    return {
      path: primary.path,
      waypoints: primary.waypoints,
      capturePoints: primary.capturePoints,
      captureInterval,
      lines,
    };
  }

  private toPolygon(segment: StripSegmentPayload): Polygon {
    const corners = segment.corners ?? [];
    if (corners.length < 4) {
      throw new Error(`Segment ${segment.index} corners data is invalid.`);
    }
    const [leftFront, leftBack, rightBack, rightFront] = corners as [
      Point,
      Point,
      Point,
      Point,
    ];
    return [leftFront, leftBack, rightBack, rightFront, leftFront];
  }

  private calculateHeading(p1: Point, p2: Point): number {
    const angle = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
    return ((angle % 360) + 360) % 360;
  }
}

