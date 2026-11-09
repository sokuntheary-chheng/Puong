import { Module } from '@nestjs/common';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

/**
 * Memories — and the one place FR-6.6 ("private means private") is
 * implemented, for both the list and a single read.
 */
@Module({
  controllers: [MemoriesController],
  providers: [MemoriesService],
})
export class MemoriesModule {}
