import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

/**
 * People — the records the whole product exists to keep. Not exported: every
 * question about a person is asked through this module's controller, and the
 * relations module reads rows through Prisma rather than through a service
 * that would only forward the call.
 */
@Module({
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
