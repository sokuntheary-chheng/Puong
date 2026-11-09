import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { createReadStream, mkdirSync } from 'node:fs';
import type { Express, Response } from 'express';
import { diskStorage } from 'multer';
import { uploadDirectory, UploadsService } from './uploads.service';

/** What an upload answers, and what a person or memory then stores. */
export class PhotoDto {
  @ApiProperty({
    example: '/api/uploads/3f9c1a7be2d04f5c8a61b7d90e4c2f11.jpg',
    description:
      'The URL to keep — it is already under `/api`, so it works behind nginx in production and through the Vite proxy in development.',
  })
  url: string;

  @ApiProperty({ example: '3f9c1a7be2d04f5c8a61b7d90e4c2f11.jpg' })
  filename: string;

  @ApiProperty({ example: 248_113, description: 'Bytes as stored.' })
  sizeBytes: number;
}

/**
 * Photographs — FR-6.2 (accept JPEG/PNG/WebP up to 5 MB, store on a Docker
 * volume) and FR-6.3 (serve them from a dedicated route).
 *
 * **Why a controller rather than `express.static`:** `express.static` is
 * mounted outside the Nest pipeline, so it answers to *anybody who knows the
 * URL* — and a photograph attached to a `PRIVATE` memory would be fetchable
 * with no session at all, which is FR-6.6 leaking through the file layer
 * instead of the JSON. As a route, the photograph inherits the global
 * `AuthGuard`: the browser sends the same `httpOnly` cookie it sends for
 * everything else, so an `<img>` tag needs nothing extra and a stranger with
 * a URL gets 401.
 *
 * **Uploading needs a session, and only a session.** The file is not attached
 * to anything yet; authorisation happens where it is attached — a
 * `CONTRIBUTOR` may create the memory (FR-6.1), and ownership decides what
 * they may later do with it. Requiring a tree id here would ask the upload to
 * prove something the next request has to prove again anyway.
 *
 * The storage options are a module-level constant because `UseInterceptors`
 * is evaluated when the class is declared, long before any request — which is
 * also why the destination reads the environment through `uploadDirectory()`
 * rather than through `ConfigService`: same value, one function, no second
 * source for the path to end up in.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('photos')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const directory = uploadDirectory();
          mkdirSync(directory, { recursive: true });
          cb(null, directory);
        },
        filename: (_req, file, cb) =>
          cb(null, UploadsService.filenameFor(file.mimetype)),
      }),
      /* A ceiling *above* FR-6.2's 5 MB so the clear message below — with
         the limit and the file's own size in it — is what the caller sees,
         while multer's hard stop still protects the process from a body that
         claims to be a photograph and arrives as a gigabyte. */
      limits: { fileSize: 6 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (UploadsService.types[file.mimetype] !== undefined) {
          cb(null, true);
          return;
        }
        cb(
          new BadRequestException(
            'A photograph must be a JPEG, a PNG or a WebP image.',
          ),
          false,
        );
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload a photograph (FR-6.2)',
    description:
      'Multipart form data with a single `file` field. JPEG, PNG or WebP only, at most 5 MB — anything else is 400 with the limit stated. The stored name is generated, so nothing from the request becomes a path. Returns the URL to store on a person (`photoUrl`) or a memory.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: PhotoDto })
  @ApiBadRequestResponse({
    description: 'Not a photograph field, the wrong type, or over 5 MB.',
  })
  async upload(@UploadedFile() file?: Express.Multer.File): Promise<PhotoDto> {
    if (file === undefined) {
      throw new BadRequestException(
        'Send the photograph as a form field named `file`.',
      );
    }
    await this.uploads.assertSize(file);

    return {
      url: UploadsService.urlFor(file.filename),
      filename: file.filename,
      sizeBytes: file.size,
    };
  }

  @Get(':filename')
  @ApiOperation({
    summary: 'Serve a stored photograph (FR-6.3)',
    description:
      'The URL an upload returns. Requires a session like every other route — a photograph belonging to a private memory is not fetchable by somebody who is not signed in — and the name must be one this API generated, or it is 404 without the filesystem being touched.',
  })
  @ApiParam({
    name: 'filename',
    example: '3f9c1a7be2d04f5c8a61b7d90e4c2f11.jpg',
  })
  @ApiOkResponse({ description: 'The image bytes.' })
  @ApiNotFoundResponse({ description: 'No such photograph.' })
  serve(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const path = this.uploads.pathFor(filename);
    res.set({
      /* The type comes from the extension the API chose, never from a
         header the client sent — a JPEG that answers as `text/html` is the
         stored-XSS shape this whole file exists to make impossible. */
      'Content-Type': UploadsService.contentTypeFor(filename),
      /* Private: a shared cache must not hold a family's photographs under
         a URL its own users reach with a cookie. */
      'Cache-Control': 'private, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(createReadStream(path));
  }
}
