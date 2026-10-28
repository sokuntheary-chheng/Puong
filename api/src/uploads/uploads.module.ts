import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Uploads — FR-6.2 and FR-6.3, the file half of a family archive.
 *
 * No `PrismaService`: nothing here is a row. The photograph's *record* lives
 * on the person or the memory that points at its url, which is why this
 * module has no database of its own: the url pattern lives in
 * `common/photo-url.ts`, and the bytes live in `UPLOAD_DIR` — the directory
 * `docker-compose.yml` mounts as a volume, so a rebuild of the API image
 * does not take the family's photographs with it.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
