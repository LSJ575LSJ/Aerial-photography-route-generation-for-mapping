import { Controller, Post, Body, Logger } from '@nestjs/common';
import { FlightPathService } from './flight-path.service';
import type {
  GeneratePathRequest,
  GeneratePathResponse,
} from './flight-path.interface';

@Controller('flight-path')
export class FlightPathController {
  private readonly logger = new Logger(FlightPathController.name);

  constructor(private readonly flightPathService: FlightPathService) {}

  @Post('generate')
  generatePath(@Body() body: GeneratePathRequest): GeneratePathResponse {
    this.logger.log('========== 收到生成航线请求 ==========');
    this.logger.log(`请求时间: ${new Date().toLocaleString()}`);
    this.logger.log('请求参数:', JSON.stringify({
      polygon: body.polygon?.length || 0,
      spacing: body.spacing,
      startPoint: body.startPoint,
      endPoint: body.endPoint,
      angle: body.angle,
      margin: body.margin,
      captureInterval: body.captureInterval,
    }, null, 2));

    try {
      // 参数验证
      if (!body.polygon || body.polygon.length === 0) {
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
      const polygon: [number, number][] = body.polygon.map((p) => [
        p[0],
        p[1],
      ]) as [number, number][];
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

      this.logger.log('开始生成航线...');
      const startTime = Date.now();

      // 调用 Service 生成航线（固定使用水平扫描，通过 angle 参数控制方向）
      const result = this.flightPathService.generateFlightPath(
        polygon,
        body.spacing,
        startPoint,
        endPoint,
        angle,
        margin,
        captureInterval,
      );

      const duration = Date.now() - startTime;
      this.logger.log(`航线生成成功，耗时: ${duration}ms`);
      this.logger.log(`生成路径点数: ${result.path.length}`);
      this.logger.log(`生成航点数量: ${result.waypoints.length}`);
      this.logger.log(`生成拍照点数量: ${result.capturePoints?.length ?? 0}`);
      this.logger.log('================================');

      // 转换结果到响应格式
      return {
        path: result.path,
        waypoints: result.waypoints,
        capturePoints: result.capturePoints ?? [],
        captureInterval: result.captureInterval ?? captureInterval,
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

