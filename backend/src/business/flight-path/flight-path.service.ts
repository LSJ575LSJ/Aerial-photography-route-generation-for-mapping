import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(FlightPathService.name);
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
   * @param endPoint - 终点坐标 [经度, 纬度]，如果不设置则使用起飞点作为终点
   * @param angle - 航线相对于水平轴的旋转角度（度），0-180°，固定使用水平扫描后旋转
   * @param margin - 边距（米）
   * @returns 返回航线信息对象
   */
  generateFlightPath(
    polygon: Polygon,
    spacing: number,
    startPoint: Point,
    endPoint: Point | null = null,
    angle = 0,
    margin = 0,
  ): FlightPathResult {
    this.logger.debug(`开始生成航线 - 多边形点数: ${polygon.length}, 间距: ${spacing}m, 角度: ${angle}°, 边距: ${margin}m`);
    
    try {
      const normalizedPolygon = this.normalizePolygon(polygon);
      const hasPolygon = normalizedPolygon.length > 0;
      
      if (!hasPolygon) {
        this.logger.warn('多边形为空，将生成从起飞点到降落点的直线路径');
      }
      
      const rotationCenter = hasPolygon
        ? this.getPolygonCentroid(normalizedPolygon)
        : startPoint;

      this.logger.debug(`旋转中心: [${rotationCenter[0].toFixed(6)}, ${rotationCenter[1].toFixed(6)}]`);

      const rotatedPolygon = hasPolygon
        ? this.rotatePolygon(normalizedPolygon, rotationCenter, -angle)
        : normalizedPolygon;

      const rotatedStart = this.rotatePoint(startPoint, rotationCenter, -angle);
      const rotatedEnd = endPoint
        ? this.rotatePoint(endPoint, rotationCenter, -angle)
        : null;

      this.logger.debug(`旋转后的起飞点: [${rotatedStart[0].toFixed(6)}, ${rotatedStart[1].toFixed(6)}]`);
      if (rotatedEnd) {
        this.logger.debug(`旋转后的降落点: [${rotatedEnd[0].toFixed(6)}, ${rotatedEnd[1].toFixed(6)}]`);
      }

      const alignedResult = this.generateAlignedFlightPath(
        rotatedPolygon,
        spacing,
        rotatedStart,
        rotatedEnd,
        margin,
      );

      this.logger.debug(`对齐坐标系中生成的路径点数: ${alignedResult.path.length}, 航点数: ${alignedResult.waypoints.length}`);

      const path = alignedResult.path.map((point) =>
        this.rotatePoint(point, rotationCenter, angle),
      );
      const waypoints = alignedResult.waypoints.map((point) =>
        this.rotatePoint(point, rotationCenter, angle),
      );

      this.logger.debug(`最终路径点数: ${path.length}, 最终航点数: ${waypoints.length}`);

      return {
        path,
        waypoints,
      };
    } catch (error: any) {
      this.logger.error(`生成航线时发生错误: ${error.message}`);
      this.logger.error(`错误堆栈: ${error.stack}`);
      throw error;
    }
  }

  /**
   * 在水平对齐的坐标系中生成航线（固定使用水平扫描）
   * @param polygon - 已对齐的多边形顶点
   * @param spacing - 航线间距
   * @param startPoint - 已对齐的起飞点
   * @param endPoint - 已对齐的降落点
   * @param margin - 边距（米）
   * @returns 航线结果
   */
  private generateAlignedFlightPath(
    polygon: Polygon,
    spacing: number,
    startPoint: Point,
    endPoint: Point | null,
    margin = 0,
  ): FlightPathResult {
    if (polygon.length === 0) {
      this.logger.debug('多边形为空，生成直线路径');
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
    this.logger.debug(`边界框: min[${bbox.min[0].toFixed(6)}, ${bbox.min[1].toFixed(6)}], max[${bbox.max[0].toFixed(6)}, ${bbox.max[1].toFixed(6)}]`);
    
    // groups[i] 存储所有平行线的第 i 对交点（即第 2i+1, 2i+2 个交点）
    const groups: Intersection[][] = [];
    const spacingDegrees = spacing / 111000; // 转换米到度数（粗略）
    const clampedMargin = Math.min(Math.max(margin, 0), 5000);
    
    if (clampedMargin !== margin) {
      this.logger.warn(`边距值 ${margin}m 被限制到 ${clampedMargin}m (范围: 0-5000m)`);
    }

    // 水平方向扫描（固定使用水平扫描）
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
        
        // 使用递归方法将当前线的所有交点对分组到 groups，并在此阶段应用边距
        this.processIntersectionPairs(
          sortedIntersections,
          groups,
          currentLat,
          clampedMargin,
        );
      }
      currentLat += spacingDegrees;
    }
    
    this.logger.debug(`水平扫描完成，生成 ${groups.length} 个交点对组`);

    if (groups.length === 0) {
      this.logger.warn('未生成任何扫描线，可能多边形太小或间距太大');
    }

    // 构建航线路径
    this.logger.debug('开始构建航线路径...');
    const flightPath: Point[] = [startPoint];
    const waypoints: Point[] = [];
    let isForward = true;

    // 按 groups 顺序处理：groups[0] → groups[1] → groups[2] ...
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      if (!group || group.length === 0) continue;

      // 每个 group 内部按顺序处理（保持 zigzag 正反切换）
      for (let i = 0; i < group.length; i += 2) {
        const point1 = group[i];
        const point2 = group[i + 1];

        if (point1 && point2) {
          if (isForward) {
            // 正向飞行
            flightPath.push(point1.point);
            flightPath.push(point2.point);
            waypoints.push(point1.point);
            waypoints.push(point2.point);
          } else {
            // 反向飞行
            flightPath.push(point2.point);
            flightPath.push(point1.point);
            waypoints.push(point2.point);
            waypoints.push(point1.point);
          }
          isForward = !isForward;
        }
      }
    }

    // 添加终点
    const finalPoint = endPoint || startPoint;
    flightPath.push(finalPoint);

    this.logger.debug(`航线路径构建完成: 路径点数 ${flightPath.length}, 航点数 ${waypoints.length}`);

    return {
      path: flightPath,
      waypoints: waypoints,
    };
  }

  /**
   * 递归处理当前线的所有交点对，动态分组到 groups 数组
   * groups[i] 存储所有平行线的第 i 对交点（即第 2i+1, 2i+2 个交点）
   * 实现 zigzag 逻辑：偶数索引（0,2,4...）顺序插入，奇数索引（1,3,5...）逆序插入
   * @param intersections - 当前线的所有交点（已排序）
   * @param groups - 分组数组，groups[i] 存储所有线的第 i 对交点
   */
  private processIntersectionPairs(
    intersections: Intersection[],
    groups: Intersection[][],
    currentLat: number,
    margin: number,
  ): void {
    // 递归处理第 j 对交点
    function processPair(j: number): void {
      // 如果当前线没有第 j 对（即 2*j+1 超出长度），停止
      if (j * 2 + 1 >= intersections.length) return;

      // 动态扩展 groups：如果还没有第 j 组，就新建一个空数组
      if (j >= groups.length) {
        groups.push([]);
      }

      // 获取当前对的两个点
      const point1 = intersections[j * 2];
      const point2 = intersections[j * 2 + 1];
      
      if (point1 && point2) {
        // 计算当前纬度对应的经度缩放，用于边距换算
        let adjustedPoint1 = point1;
        let adjustedPoint2 = point2;

        if (margin > 0) {
          const latRad = (currentLat * Math.PI) / 180;
          const cosLat = Math.cos(latRad);
          const metersPerDegLng =
            Math.max(Math.abs(cosLat), 1e-6) * 111320; // 避免除以0
          const marginLonDeg = margin / metersPerDegLng;

          adjustedPoint1 = {
            point: [point1.point[0] - marginLonDeg, point1.point[1]],
            segmentIndex: point1.segmentIndex,
          };
          adjustedPoint2 = {
            point: [point2.point[0] + marginLonDeg, point2.point[1]],
            segmentIndex: point2.segmentIndex,
          };
        }

        // 根据 group 索引的奇偶性决定插入方式（zigzag）
        if (j % 2 === 0) {
          // 偶数索引（0, 2, 4...）：顺序插入（push），从下到上
          groups[j].push(adjustedPoint1);
          groups[j].push(adjustedPoint2);
        } else {
          // 奇数索引（1, 3, 5...）：逆序插入（unshift），从上到下
          // 注意：先插入右侧点再插入左侧点
          groups[j].unshift(adjustedPoint2);
          groups[j].unshift(adjustedPoint1);
        }
      }

      // 递归处理下一对
      processPair(j + 1);
    }

    // 开始处理当前线的所有交点对（从第0对开始）
    processPair(0);
  }
}

