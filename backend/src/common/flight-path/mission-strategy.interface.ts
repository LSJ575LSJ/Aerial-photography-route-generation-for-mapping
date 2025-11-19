import {
  FlightMissionType,
  FlightPathResult,
  Point,
  Polygon,
} from '../../business/flight-path/flight-path.interface';

export interface MissionStrategyPayload {
  polygon: Polygon;
  spacing: number;
  startPoint: Point;
  endPoint: Point | null;
  angle: number;
  margin: number;
  captureInterval: number | null;
  gimbalYaw?: number | null;
  lateralOffset?: number | null; // 侧向偏移距离（米），由前端计算
}

export interface FlightMissionStrategy {
  readonly type: FlightMissionType;
  generate(payload: MissionStrategyPayload): FlightPathResult;
}

