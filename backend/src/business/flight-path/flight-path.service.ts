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
   * 标准化多边形顶点数组：
   * - GeoJSON 多边形通常会在结尾重复首个点以闭合路径，这里去掉末尾重复点，方便旋转和扫描计算。
   * - 如果为空则直接返回。
   */
  private normalizePolygon(polygon: Polygon): Polygon {
    if (polygon.length === 0) {
      return polygon;
    }
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      return polygon.slice(0, -1);
    }
    return polygon;
  }

  /**
   * 计算多边形的几何中心（质心）
   * 这里使用简单的顶点平均值，作为旋转中心，使得整体旋转不会产生平移偏差。
   */
  private getPolygonCentroid(polygon: Polygon): Point {
    if (polygon.length === 0) {
      return [0, 0];
    }
    const { sumLng, sumLat } = polygon.reduce(
      (acc, point) => ({
        sumLng: acc.sumLng + point[0],
        sumLat: acc.sumLat + point[1],
      }),
      { sumLng: 0, sumLat: 0 },
    );
    return [sumLng / polygon.length, sumLat / polygon.length];
  }

  /**
   * 将指定点围绕给定中心按角度旋转
   * @param point 原始点坐标
   * @param center 旋转中心
   * @param angleDeg 旋转角度（度），正数为顺时针
   * @returns 旋转后的点坐标
   */
  private rotatePoint(point: Point, center: Point, angleDeg: number): Point {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const translatedX = point[0] - center[0];
    const translatedY = point[1] - center[1];

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    return [rotatedX + center[0], rotatedY + center[1]];
  }

  /**
   * 批量旋转多边形的所有顶点
   * @param polygon 多边形顶点集合
   * @param center 旋转中心
  * @param angleDeg 旋转角度（度），正数为顺时针
   */
  private rotatePolygon(polygon: Polygon, center: Point, angleDeg: number): Polygon {
    return polygon.map((point) => this.rotatePoint(point, center, angleDeg));
  }

  /**
   * 生成无人机航线路径，支持自定义扫描角度
   * @param polygon - 多边形区域的顶点坐标数组，每个顶点为[经度, 纬度]
   * @param spacing - 航线间距，单位：米
   * @param startPoint - 起飞点坐标 [经度, 纬度]
   * @param direction - 扫描方向，可选值：'horizontal'（水平）或'vertical'（垂直），默认为 'horizontal'
   * @param endPoint - 终点坐标 [经度, 纬度]，如果不设置则使用起飞点作为终点
   * @param angle - 航线相对于水平轴的旋转角度（度），正数为顺时针
   * @returns 返回航线信息对象
   */
  generateFlightPath(
    polygon: Polygon,
    spacing: number,
    startPoint: Point,
    direction: 'horizontal' | 'vertical' = 'horizontal',
    endPoint: Point | null = null,
    angle = 0,
    margin = 0,
  ): FlightPathResult {
    const normalizedPolygon = this.normalizePolygon(polygon);
    const hasPolygon = normalizedPolygon.length > 0;
    const rotationCenter = hasPolygon
      ? this.getPolygonCentroid(normalizedPolygon)
      : startPoint;

    const rotatedPolygon = hasPolygon
      ? this.rotatePolygon(normalizedPolygon, rotationCenter, -angle)
      : normalizedPolygon;

    const rotatedStart = this.rotatePoint(startPoint, rotationCenter, -angle);
    const rotatedEnd = endPoint
      ? this.rotatePoint(endPoint, rotationCenter, -angle)
      : null;

    const alignedResult = this.generateAlignedFlightPath(
      rotatedPolygon,
      spacing,
      rotatedStart,
      direction,
      rotatedEnd,
      margin,
    );

    const path = alignedResult.path.map((point) =>
      this.rotatePoint(point, rotationCenter, angle),
    );
    const waypoints = alignedResult.waypoints.map((point) =>
      this.rotatePoint(point, rotationCenter, angle),
    );

    return {
      path,
      waypoints,
    };
  }

  /**
   * 在水平/垂直对齐的坐标系中生成航线
   * @param polygon - 已对齐的多边形顶点
   * @param spacing - 航线间距
   * @param startPoint - 已对齐的起飞点
   * @param direction - 扫描方向
   * @param endPoint - 已对齐的降落点
   * @returns 航线结果
   */
  private generateAlignedFlightPath(
    polygon: Polygon,
    spacing: number,
    startPoint: Point,
    direction: 'horizontal' | 'vertical',
    endPoint: Point | null,
    margin = 0,
  ): FlightPathResult {
    if (polygon.length === 0) {
      const finalPoint = endPoint || startPoint;
      const path: Point[] =
        finalPoint[0] === startPoint[0] && finalPoint[1] === startPoint[1]
          ? [startPoint]
          : [startPoint, finalPoint];
      const waypoints: Point[] =
        endPoint && (endPoint[0] !== startPoint[0] || endPoint[1] !== startPoint[1])
          ? [endPoint]
          : [];
      return {
        path,
        waypoints,
      };
    }

    const bbox = this.calculateBoundingBox(polygon);
    const lines: ScanLine[] = [];
    const addLines: ScanLine[] = []; // 保存多余交点的扫描线
    const spacingDegrees = spacing / 111000; // 转换米到度数（粗略）
    const clampedMargin = Math.min(Math.max(margin, 0), 5000);

    if (direction === 'horizontal') {
      // 水平方向扫描
      let currentLat = bbox.min[1];
      while (currentLat <= bbox.max[1]) {
        // 与多边形求交点的平行线
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
          if (clampedMargin > 0) {
            const latRad = (currentLat * Math.PI) / 180;
            const cosLat = Math.cos(latRad);
            const metersPerDegLng =
              Math.max(Math.abs(cosLat), 1e-6) * 111320; // 避免除以0
            const marginLonDeg = clampedMargin / metersPerDegLng;
            const first = sortedIntersections[0];
            const last = sortedIntersections[sortedIntersections.length - 1];
            first.point = [first.point[0] - marginLonDeg, first.point[1]];
            last.point = [last.point[0] + marginLonDeg, last.point[1]];
          }
          
          // 保存主路径（前两个交点）
          lines.push({
            points: sortedIntersections.slice(0, 2),
            coordinate: currentLat,
            isHorizontal: true,
          });
          
          // 如果交点数量大于2，将多余的成对交点保存到 addLines
          if (sortedIntersections.length > 2) {
            for (let i = 2; i < sortedIntersections.length; i += 2) {
              const point1 = sortedIntersections[i];
              const point2 = sortedIntersections[i + 1];
              if (point1 && point2) {
                addLines.push({
                  points: [point1, point2],
                  coordinate: currentLat,
                  isHorizontal: true,
                });
              }
            }
          }
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
          if (clampedMargin > 0) {
            const metersPerDegLat = 111000;
            const marginLatDeg = clampedMargin / metersPerDegLat;
            const first = sortedIntersections[0];
            const last = sortedIntersections[sortedIntersections.length - 1];
            first.point = [first.point[0], first.point[1] - marginLatDeg];
            last.point = [last.point[0], last.point[1] + marginLatDeg];
          }
          
          // 保存主路径（前两个交点）
          lines.push({
            points: sortedIntersections.slice(0, 2),
            coordinate: currentLng,
            isHorizontal: false,
          });
          
          // 如果交点数量大于2，将多余的成对交点保存到 addLines
          if (sortedIntersections.length > 2) {
            for (let i = 2; i < sortedIntersections.length; i += 2) {
              const point1 = sortedIntersections[i];
              const point2 = sortedIntersections[i + 1];
              if (point1 && point2) {
                addLines.push({
                  points: [point1, point2],
                  coordinate: currentLng,
                  isHorizontal: false,
                });
              }
            }
          }
        }
        currentLng += spacingDegrees;
      }
    }

    // 构建航线路径
    const flightPath: Point[] = [startPoint];
    const waypoints: Point[] = [];
    let isForward = true;

    // 先处理主路径（lines）
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
        }
      }

      isForward = !isForward;
    }

    // 处理补充路径（addLines）- 按顺序飞行，也使用正反切换
    // 注意：isForward 在主路径处理完后已经切换了，所以补充路径从当前状态继续
    for (let i = 0; i < addLines.length; i++) {
      const line = addLines[i];
      if (!line) continue;
      const points = line.points;

      // 确定这条线的起点和终点（与主路径一样，使用正反切换）
      if (isForward) {
        // 正向飞行
        const startPointItem = points[0];
        const endPointItem = points[1];

        if (startPointItem && endPointItem) {
          flightPath.push(startPointItem.point);
          flightPath.push(endPointItem.point);
          waypoints.push(startPointItem.point);
          waypoints.push(endPointItem.point);
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

