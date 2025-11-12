import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FlightPathModule } from './business/flight-path/flight-path.module';

@Module({
  imports: [FlightPathModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
