import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemoryVisibility } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MemoryDto } from '../../memories/dto/memories.dto';
import { PersonDto } from '../../people/dto/people.dto';

/**
 * Query parameters for the stretch feature: search, filter and pagination
 * (M0 → *Chosen stretch feature*).
 *
 * Every parameter is validated here rather than trusted: `page` of `0` or
 * `-3` and a `pageSize` of `100000` are exactly the values a hand-written
 * request sends, and both are answered by this class before a single row is
 * read.
 */
export class SearchQueryDto {
  @ApiProperty({
    example: 'theary',
    description:
      'Matched against names, nicknames, biographies, memory titles and memory bodies — accent- and case-insensitive.',
  })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    enum: ['people', 'memories'],
    description: 'Restrict to one kind of result; omit for both.',
  })
  @IsOptional()
  @IsIn(['people', 'memories'])
  kind?: 'people' | 'memories';

  @ApiPropertyOptional({
    enum: MemoryVisibility,
    description:
      'Narrow memories to one visibility. Without it, a viewer sees shared memories plus their own private ones.',
  })
  @IsOptional()
  @IsEnum(MemoryVisibility)
  visibility?: MemoryVisibility;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 6,
    default: 6,
    minimum: 1,
    maximum: 50,
    description: 'The mock’s page size is 6; the API caps it at 50.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

/** One hit: tagged by `kind`, with exactly one of the two payloads present. */
export class SearchResultDto {
  @ApiProperty({ enum: ['person', 'memory'], example: 'person' })
  kind: 'person' | 'memory';

  @ApiPropertyOptional({ type: PersonDto })
  person?: PersonDto;

  @ApiPropertyOptional({ type: MemoryDto })
  memory?: MemoryDto;
}

/** `Page<T>` from `web/src/services/mockApi.ts`, so the transport swaps cleanly. */
export class PageDto {
  @ApiProperty({ type: [SearchResultDto] })
  items: SearchResultDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 6 })
  pageSize: number;

  @ApiProperty({ example: 14 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
