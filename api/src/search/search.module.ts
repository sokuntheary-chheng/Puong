import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** The stretch feature: search, filter and pagination over one tree. */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
