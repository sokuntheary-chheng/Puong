import { Module } from '@nestjs/common';
import { RelationsController } from './relations.controller';
import { RelationsService } from './relations.service';

/** The edges of the graph, and the only place a cycle is refused. */
@Module({
  controllers: [RelationsController],
  providers: [RelationsService],
})
export class RelationsModule {}
