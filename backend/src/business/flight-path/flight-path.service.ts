import { Injectable } from '@nestjs/common';
import {
  Point,
  Polygon,
  BoundingBox,
  Intersection,
  ScanLine,
  FlightPathResult,
} from './flight-path.interface';

@Injectable()
export class FlightPathService {
  /**
   * 计算两点之间的距离
   * @param point1 - 第一个点的坐标 [经度, 纬度]
   * @param point2 - 第二个点的坐标 [经度, 纬度]
   * @returns 两点之间的距离（米）
   */
  calculateDistance(point1: Point, point2: Point): number {
    const R = 6371000; // 地球半径（米）
    const lat1 = (point1[1] * Math.PI) / 180;
    const lat2 = (point2[1] * Math.PI) / 180;
    const dLat = ((point2[1] - point1[1]) * Math.PI) / 180;
    const dLon = ((point2[0] - point1[0]) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 计算路径总长度
   * @param points - 路径点数组
   * @returns 路径总长度（米）
   */
  calculatePathLength(points: Point[]): number {
    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      if (current && next) {
        totalLength += this.calculateDistance(current, next);
      }
    }
    return totalLength;
  }

  /**
   * 计算多边形的边界框
   * @param path - 多边形顶点数组
   * @returns 边界框对象，包含最小和最大经纬度
   */
  calculateBoundingBox(path: Polygon): BoundingBox {
    let minLng = Infinity,
      maxLng = -Infinity;
    let minLat = Infinity,
      maxLat = -Infinity;

    path.forEach((point) => {
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
    });

    return {
      min: [minLng, minLat],
      max: [maxLng, maxLat],
    };
  }

  /**
   * 计算两线段交点
   * @param line1Start - 第一条线段起点
   * @param line1End - 第一条线段终点
   * @param line2Start - 第二条线段起点
   * @param line2End - 第二条线段终点
   * @returns 交点坐标或 null（如果不相交）
   */
  findIntersection(
    line1Start: Point,
    line1End: Point,
    line2Start: Point,
    line2End: Point,
  ): Point | null {
    const x1 = line1Start[0],
      y1 = line1Start[1];
    const x2 = line1End[0],
      y2 = line1End[1];
    const x3 = line2Start[0],
      y3 = line2Start[1];
    const x4 = line2End[0],
      y4 = line2End[1];

    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denominator === 0) return null;

    const t =
      ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const u = -(((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) /
      denominator);

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    return null;
  }

  /**
   * 找出平行线与多边形所有边的交点
   * @param line - 平行线的两个端点
   * @param polygon - 多边形顶点数组
   * @returns 交点信息数组
   */
  findIntersections(
    line: [Point, Point],
    polygon: Polygon,
  ): Intersection[] {
    const intersections: Intersection[] = [];
    if (polygon.length < 2) return intersections;

    for (let i = 0; i < polygon.length - 1; i++) {
      const p1 = polygon[i];
      const p2 = polygon[i + 1];
      if (p1 && p2) {
        const intersection = this.findIntersection(
          line[0],
          line[1],
          p1,
          p2,
        );
        if (intersection) {
          intersections.push({
            point: intersection,
            segmentIndex: i,
          });
        }
      }
    }
    // 检查与最后一条边的交点
    const lastPoint = polygon[polygon.length - 1];
    const firstPoint = polygon[0];
    if (lastPoint && firstPoint) {
      const intersection = this.findIntersection(
        line[0],
        line[1],
        lastPoint,
        firstPoint,
      );
      if (intersection) {
        intersections.push({
          point: intersection,
          segmentIndex: polygon.length - 1,
        });
      }
    }
    return intersections;
  }

  /**
   * 生成无人机航线路径
   * @param polygon - 多边形区域的顶点坐标数组，每个顶点为[经度, 纬度]
   * @param spacing - 航线间距，单位：米
   * @param startPoint - 起飞点坐标 [经度, 纬度]
   * @param direction - 扫描方向，可选值：'horizontal'（水平）或'vertical'（垂直），默认为 'horizontal'
   * @param endPoint - 终点坐标 [经度, 纬度]，如果不设置则使用起飞点作为终点
   * @returns 返回航线信息对象
   */
  generateFlightPath(
    polygon: Polygon,
    spacing: number,
    startPoint: Point,
    direction: 'horizontal' | 'vertical' = 'horizontal',
    endPoint: Point | null = null,
  ): FlightPathResult {
    const bbox = this.calculateBoundingBox(polygon);
    const lines: ScanLine[] = [];
    const spacingDegrees = spacing / 111000; // 转换米到度数（粗略）

    if (direction === 'horizontal') {
      // 水平方向扫描
      let currentLat = bbox.min[1];
      while (currentLat <= bbox.max[1]) {
        const line: [Point, Point] = [
          [bbox.min[0] - 0.01, currentLat],
          [bbox.max[0] + 0.01, currentLat],
        ];

        const intersections = this.findIntersections(line, polygon);
        if (intersections.length >= 2) {
          // 对每一层的交点按经度排序
          const sortedIntersections = intersections.sort(
            (a, b) => a.point[0] - b.point[0],
          );
          lines.push({
            points: sortedIntersections,
            coordinate: currentLat,
            isHorizontal: true,
          });
        }
        currentLat += spacingDegrees;
      }
    } else {
      // 垂直方向扫描
      let currentLng = bbox.min[0];
      while (currentLng <= bbox.max[0]) {
        const line: [Point, Point] = [
          [currentLng, bbox.min[1] - 0.01],
          [currentLng, bbox.max[1] + 0.01],
        ];

        const intersections = this.findIntersections(line, polygon);
        if (intersections.length >= 2) {
          // 对每一层的交点按纬度排序
          const sortedIntersections = intersections.sort(
            (a, b) => a.point[1] - b.point[1],
          );
          lines.push({
            points: sortedIntersections,
            coordinate: currentLng,
            isHorizontal: false,
          });
        }
        currentLng += spacingDegrees;
      }
    }

    // 构建航线路径
    const flightPath: Point[] = [startPoint];
    const waypoints: Point[] = [];
    let currentPoint = startPoint;
    let isForward = true;

    // 从第一条线开始处理每条线
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const points = line.points;

      // 确定这条线的起点和终点
      if (isForward) {
        // 正向飞行
        const startPointItem = points[0];
        const endPointItem = points[1];

        if (startPointItem && endPointItem) {
          flightPath.push(startPointItem.point);
          flightPath.push(endPointItem.point);
          waypoints.push(startPointItem.point);
          waypoints.push(endPointItem.point);
          currentPoint = endPointItem.point;
        }
      } else {
        // 反向飞行
        const startPointItem = points[1];
        const endPointItem = points[0];

        if (startPointItem && endPointItem) {
          flightPath.push(startPointItem.point);
          flightPath.push(endPointItem.point);
          waypoints.push(startPointItem.point);
          waypoints.push(endPointItem.point);
          currentPoint = endPointItem.point;
        }
      }

      isForward = !isForward;
    }

    // 添加终点
    const finalPoint = endPoint || startPoint;
    flightPath.push(finalPoint);

    return {
      path: flightPath,
      waypoints: waypoints,
    };
  }
}

