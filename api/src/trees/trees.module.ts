import { Module } from '@nestjs/common';
import { TreesController } from './trees.controller';
import { TreesService } from './trees.service';

/**
 * Trees: the container resource. Exports its service because the membership,
 * people, relation and memory services all ask it the same question first —
 * *does this tree exist?* — and asking it once, in one place, is what makes
 * "404 for a tree that is not there" a property of the API rather than of
 * each endpoint.
 */
@Module({
  controllers: [TreesController],
  providers: [TreesService],
  exports: [TreesService],
})
export class TreesModule {}
