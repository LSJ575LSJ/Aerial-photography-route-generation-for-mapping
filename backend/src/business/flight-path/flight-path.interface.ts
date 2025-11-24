/**
 * 坐标点类型 [经度, 纬度]
 */
export type Point = [number, number];

/**
 * 多边形类型，由多个坐标点组成
 */
export type Polygon = Point[];

export type FlightMissionType = 'mapping' | 'oblique' | 'strip';

export interface StripSegmentDto {
  index: number;
  p1: Point;
  p2: Point;
  /**
   * 角点顺序：leftFront, leftBack, rightBack, rightFront
   */
  corners: Point[];
}

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
 * 单条航线结果
 */
export interface FlightPathLine {
  path: Point[];
  waypoints: Point[];
  capturePoints?: Point[];
}

/**
 * 航线结果类型（统一结构）
 * - path/waypoints/capturePoints 始终等于 lines[0]
 * - lines 存放所有方案（建图为 1 条，倾斜为 5 条）
 */
export interface FlightPathResult {
  path: Point[];
  waypoints: Point[];
  capturePoints?: Point[];
  captureInterval?: number | null;
  lines?: FlightPathLine[];
}

export interface FlightPathGenerationOptions {
  missionType?: FlightMissionType;
  gimbalPitchDeg?: number;
  lateralOffset?: number;
  lateralOffsetDirection?: number | null;
}

/**
 * 生成航线请求接口（用于 Controller）
 */
export interface GeneratePathRequest {
  polygon?: number[][];  // [[lng, lat], [lng, lat], ...]
  spacing: number;
  startPoint: number[];  // [lng, lat]
  endPoint?: number[];   // [lng, lat] | null
  angle?: number;        // 扫描角度（度），0-180°，固定使用水平扫描后旋转
  margin?: number;       // 边距（米）
  missionType?: FlightMissionType;
  gimbalYaw?: number | null;
  lateralOffset?: number | null; // 侧向偏移距离（米），由前端计算：高度 * tan(云台垂直夹角)
  captureInterval?: number | null; // 拍照间隔（米），由前端计算
  /**
   * 带状航线专用
   */
  path?: number[][]; // 主路径点集合
  segments?: {
    index: number;
    p1: number[];
    p2: number[];
    corners: number[][];
  }[];
  leftBandwidth?: number;
  rightBandwidth?: number;
}

/**
 * 生成航线响应接口（用于 Controller）
 */
export interface GeneratePathResponse {
  path: number[][];     // [[lng, lat], [lng, lat], ...]
  waypoints: number[][];
  capturePoints?: number[][];
  captureInterval?: number | null;
  lines?: {
    path: number[][];
    waypoints: number[][];
    capturePoints?: number[][];
  }[];
}

