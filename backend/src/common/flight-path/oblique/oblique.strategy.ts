import { Injectable, Logger } from '@nestjs/common';
import { FlightPathService } from '../../../business/flight-path/flight-path.service';
import {
  FlightMissionStrategy,
  MissionStrategyPayload,
} from '../mission-strategy.interface';

const MAX_TILT_DEG = 89.9;

@Injectable()
export class ObliqueMissionStrategy implements FlightMissionStrategy {
  readonly type = 'oblique';
  private readonly logger = new Logger(ObliqueMissionStrategy.name);

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
      gimbalYaw,
      lateralOffset,
    } = payload;

    const tiltDeg = this.clampAngle(gimbalYaw ?? 0);
    // 直接使用前端计算好的偏移量
    const offset: number = (lateralOffset !== null && lateralOffset !== undefined && Number.isFinite(lateralOffset)) ? lateralOffset : 0;

    this.logger.debug(
      `Oblique strategy -> tilt: ${tiltDeg}°, lateral offset: ${offset.toFixed(3)}m`,
    );

    const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

    const createLine = (
      heading: number,
      useOffset: boolean,
    ) =>
      this.flightPathService.generateFlightPath(
        polygon,
        spacing,
        startPoint,
        endPoint,
        heading,
        margin,
        captureInterval,
        {
          missionType: this.type,
          gimbalPitchDeg: useOffset ? tiltDeg : 0,
          lateralOffset: useOffset ? offset : 0,
          lateralOffsetDirection: useOffset ? normalizeAngle(heading + 180) : null,
        },
      );

    // 1. 顶视航线（与建图一致，不偏移）
    const line1 = createLine(angle, false);
    // 2. 正向倾斜（沿原航向，朝反方向偏移）
    const line2 = createLine(angle, true);
    // 3. 反向倾斜（航向+180°，朝其反方向偏移）
    const line3 = createLine(angle + 180, true);
    // 4. 右侧倾斜（航向+90°，朝其反方向偏移）
    const line4 = createLine(angle + 90, true);
    // 5. 左侧倾斜（航向-90°，朝其反方向偏移）
    const line5 = createLine(angle - 90, true);

    const allLines = [line1, line2, line3, line4, line5].map((ln) => ({
      path: ln.path,
      waypoints: ln.waypoints,
      capturePoints: ln.capturePoints,
    }));

    // 统一结构：顶视航线作为主航线，其余作为 variants
    return {
      path: line1.path,
      waypoints: line1.waypoints,
      capturePoints: line1.capturePoints,
      captureInterval: line1.captureInterval,
      lines: allLines,
    };
  }

  private clampAngle(angle: number): number {
    if (!Number.isFinite(angle)) return 0;
    if (angle < 0) return 0;
    if (angle > MAX_TILT_DEG) return MAX_TILT_DEG;
    return angle;
  }
}

