import { Controller, Post, Body, Logger } from '@nestjs/common';
import type {
  GeneratePathRequest,
  GeneratePathResponse,
  FlightMissionType,
  Point,
} from './flight-path.interface';
import { MissionStrategyFactory } from '../../common/flight-path/mission-strategy.factory';
import type { StripSegmentPayload } from '../../common/flight-path/mission-strategy.interface';

@Controller('flight-path')
export class FlightPathController {
  private readonly logger = new Logger(FlightPathController.name);

  constructor(
    private readonly missionStrategyFactory: MissionStrategyFactory,
  ) {}

  @Post('generate')
  generatePath(@Body() body: GeneratePathRequest): GeneratePathResponse {
    this.logger.log('========== 收到生成航线请求 ==========');
    this.logger.log(`请求时间: ${new Date().toLocaleString()}`);
    this.logger.log('请求参数:', JSON.stringify({
      polygon: body.polygon?.length || 0,
      path: body.path?.length || 0,
      segments: body.segments?.length || 0,
      spacing: body.spacing,
      startPoint: body.startPoint,
      endPoint: body.endPoint,
      angle: body.angle,
      margin: body.margin,
      captureInterval: body.captureInterval,
      missionType: body.missionType ?? 'mapping',
      gimbalYaw: body.gimbalYaw,
      lateralOffset: body.lateralOffset,
      leftBandwidth: body.leftBandwidth,
      rightBandwidth: body.rightBandwidth,
    }, null, 2));

    try {
      // 参数验证
      const missionType: FlightMissionType = body.missionType ?? 'mapping';

      if ((!body.polygon || body.polygon.length === 0) && missionType !== 'strip') {
        this.logger.warn('多边形为空');
      }
      if (!body.startPoint || body.startPoint.length !== 2) {
        this.logger.error('起飞点无效:', body.startPoint);
        throw new Error('起飞点坐标无效');
      }
      if (body.spacing <= 0) {
        this.logger.error('航线间距无效:', body.spacing);
        throw new Error('航线间距必须大于0');
      }

      // 转换请求数据到内部类型
      const polygon: Point[] = Array.isArray(body.polygon)
        ? body.polygon.map((p) => [p[0], p[1]] as Point)
        : [];
      const startPoint: [number, number] = [
        body.startPoint[0],
        body.startPoint[1],
      ];
      const endPoint: [number, number] | null = body.endPoint
        ? [body.endPoint[0], body.endPoint[1]]
        : null;
      const angle = body.angle ?? 0;
      const margin = body.margin ?? 0;
      const captureInterval = body.captureInterval ?? null;
      const gimbalYaw = body.gimbalYaw ?? 0;
      const lateralOffset = body.lateralOffset ?? null;
      const leftBandwidth = body.leftBandwidth ?? null;
      const rightBandwidth = body.rightBandwidth ?? null;
      const stripPath: Point[] | null = Array.isArray(body.path)
        ? body.path
            .filter((p) => Array.isArray(p) && p.length === 2)
            .map((p) => [p[0], p[1]] as Point)
        : null;
      const stripSegments: StripSegmentPayload[] =
        missionType === 'strip' && Array.isArray(body.segments)
          ? body.segments
              .map((segment) => {
                if (
                  typeof segment !== 'object' ||
                  !Array.isArray(segment.corners) ||
                  segment.corners.length < 4
                ) {
                  return null;
                }
                const toPoint = (p?: number[]): Point | null =>
                  Array.isArray(p) && p.length === 2 ? [p[0], p[1]] : null;
                const corners = segment.corners
                  .slice(0, 4)
                  .map((corner) => toPoint(corner))
                  .filter((corner): corner is Point => !!corner);
                if (corners.length < 4) {
                  return null;
                }
                const fallbackP1 = corners[0];
                const fallbackP2 = corners[1];
                const p1 = toPoint(segment.p1) ?? fallbackP1;
                const p2 = toPoint(segment.p2) ?? fallbackP2;
                if (!p1 || !p2) {
                  return null;
                }
                return {
                  index: segment.index ?? 0,
                  p1,
                  p2,
                  corners,
                } as StripSegmentPayload;
              })
              .filter((seg): seg is StripSegmentPayload => !!seg)
          : [];

      this.logger.log('开始生成航线...');
      const startTime = Date.now();

      // 调用 Service 生成航线（固定使用水平扫描，通过 angle 参数控制方向）
      const strategy = this.missionStrategyFactory.getStrategy(missionType);
      const result = strategy.generate({
        polygon,
        spacing: body.spacing,
        startPoint,
        endPoint,
        angle,
        margin,
        captureInterval,
        gimbalYaw,
        lateralOffset,
        stripPath,
        stripSegments,
        leftBandwidth,
        rightBandwidth,
      });

      const duration = Date.now() - startTime;
      this.logger.log(`航线生成成功，耗时: ${duration}ms`);
      this.logger.log(`生成路径点数: ${result.path.length}`);
      this.logger.log(`生成航点数量: ${result.waypoints.length}`);
      this.logger.log(`生成拍照点数量: ${result.capturePoints?.length ?? 0}`);
      this.logger.log('================================');

      // 转换结果到响应格式（统一结构）
      return {
        path: result.path,
        waypoints: result.waypoints,
        capturePoints: result.capturePoints ?? [],
        captureInterval: result.captureInterval ?? captureInterval,
        lines:
          result.lines?.map((line) => ({
            path: line.path,
            waypoints: line.waypoints,
            capturePoints: line.capturePoints ?? [],
          })) ?? [
            {
              path: result.path,
              waypoints: result.waypoints,
              capturePoints: result.capturePoints ?? [],
            },
          ],
      };
    } catch (error: any) {
      this.logger.error('========== 生成航线失败 ==========');
      this.logger.error(`错误时间: ${new Date().toLocaleString()}`);
      this.logger.error('错误消息:', error.message);
      this.logger.error('错误堆栈:', error.stack);
      this.logger.error('================================');
      throw error;
    }
  }
}

