import { Injectable, Logger } from '@nestjs/common';
import proj4 from 'proj4';
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
  // WGS84 地理坐标系（经纬度）
  private readonly wgs84 = 'EPSG:4326';
  // Web Mercator 投影坐标系，用于在平面上按米进行几何计算
  private readonly webMercator = 'EPSG:3857';

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

    // 去掉每一段的首尾点（startPoint 和 endPoint），只保留扫描线点
    const trimmedLines: FlightPathLine[] = lines.map((line) => {
      // 去掉 path 的首尾点
      let trimmedPath = line.path;
      if (line.path.length >= 2) {
        trimmedPath = line.path.slice(1, -1);
      } else if (line.path.length === 1) {
        // 如果只有1个点，保留它（可能是特殊情况）
        trimmedPath = line.path;
      }

      return {
        path: trimmedPath,
        waypoints: line.waypoints, // waypoints 通常不包含起降点，直接使用
        capturePoints: line.capturePoints, // capturePoints 通常不包含起降点，直接使用
      };
    });

    // 合并所有段的航线成一条连续路径
    const mergedPath: Point[] = [];
    const mergedWaypoints: Point[] = [];
    const mergedCapturePoints: Point[] = [];

    for (const line of trimmedLines) {
      if (line.path.length > 0) {
        mergedPath.push(...line.path);
      }
      if (line.waypoints.length > 0) {
        mergedWaypoints.push(...line.waypoints);
      }
      if (line.capturePoints && line.capturePoints.length > 0) {
        mergedCapturePoints.push(...line.capturePoints);
      }
    }

    // 构建合并后的主航线
    const primary: FlightPathLine = {
      path: mergedPath,
      waypoints: mergedWaypoints,
      capturePoints: mergedCapturePoints.length > 0 ? mergedCapturePoints : undefined,
    };

    this.logger.debug(
      `带状航线合并完成: ${lines.length} 段 -> 路径点数: ${mergedPath.length}, 航点数: ${mergedWaypoints.length}, 拍照点数: ${mergedCapturePoints.length}`,
    );

    return {
      path: primary.path,
      waypoints: primary.waypoints,
      capturePoints: primary.capturePoints,
      captureInterval,
      lines: trimmedLines, // 保留各段的独立航线（已去掉首尾点），供前端选择显示
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

  /**
   * 计算带状航线段 p1 -> p2 的航向角（度）
   * 为保证与后端航线生成逻辑一致，先将经纬度投影到 Web Mercator 平面，
   * 在米单位的平面坐标中使用 atan2 计算角度。
   */
  private calculateHeading(p1: Point, p2: Point): number {
    const [x1, y1] = proj4(this.wgs84, this.webMercator, p1);
    const [x2, y2] = proj4(this.wgs84, this.webMercator, p2);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return ((angle % 360) + 360) % 360;
  }
}

