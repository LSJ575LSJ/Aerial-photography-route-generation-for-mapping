import { Controller, Post, Body } from '@nestjs/common';
import { FlightPathService } from './flight-path.service';
import type {
  GeneratePathRequest,
  GeneratePathResponse,
} from './flight-path.interface';

@Controller('flight-path')
export class FlightPathController {
  constructor(private readonly flightPathService: FlightPathService) {}

  @Post('generate')
  generatePath(@Body() body: GeneratePathRequest): GeneratePathResponse {
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

    // 调用 Service 生成航线
    const result = this.flightPathService.generateFlightPath(
      polygon,
      body.spacing,
      startPoint,
      body.direction || 'horizontal',
      endPoint,
      angle,
      margin,
    );

    // 转换结果到响应格式
    return {
      path: result.path,
      waypoints: result.waypoints,
    };
  }
}

