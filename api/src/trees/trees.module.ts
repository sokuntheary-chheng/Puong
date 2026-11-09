import { Module } from '@nestjs/common';
import { SuccessorshipsController } from './successorships.controller';
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
  /* `SuccessorshipsController` lives here rather than in its own module
     because it answers the same service this module already owns — it is
     "my nominations", read off `TreesService`, not a new resource. */
  controllers: [TreesController, SuccessorshipsController],
  providers: [TreesService],
  exports: [TreesService],
})
export class TreesModule {}
