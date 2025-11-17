/**
 * 坐标点类型 [经度, 纬度]
 */
export type Point = [number, number];

/**
 * 多边形类型，由多个坐标点组成
 */
export type Polygon = Point[];

/**
 * 边界框类型
 */
export interface BoundingBox {
  min: Point;
  max: Point;
}

/**
 * 交点信息类型
 */
export interface Intersection {
  point: Point;
  segmentIndex: number;
}

/**
 * 扫描线类型（内部使用）
 */
export interface ScanLine {
  points: Intersection[];
  coordinate: number;
  isHorizontal: boolean;
}

/**
 * 航线结果类型
 */
export interface FlightPathResult {
  path: Point[];
  waypoints: Point[];
  capturePoints?: Point[];
  captureInterval?: number | null;
}

/**
 * 生成航线请求接口（用于 Controller）
 */
export interface GeneratePathRequest {
  polygon: number[][];  // [[lng, lat], [lng, lat], ...]
  spacing: number;
  startPoint: number[];  // [lng, lat]
  endPoint?: number[];   // [lng, lat] | null
  angle?: number;        // 扫描角度（度），0-180°，固定使用水平扫描后旋转
  margin?: number;       // 边距（米）
  captureInterval?: number | null; // 拍照间隔（米），由前端计算
}

/**
 * 生成航线响应接口（用于 Controller）
 */
export interface GeneratePathResponse {
  path: number[][];     // [[lng, lat], [lng, lat], ...]
  waypoints: number[][];
  capturePoints?: number[][];
  captureInterval?: number | null;
}

