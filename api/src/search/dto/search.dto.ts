import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemoryVisibility, RelationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MemoryDto } from '../../memories/dto/memories.dto';
import { PersonDto } from '../../people/dto/people.dto';

/**
 * Query parameters for the stretch feature: search, filter and pagination
 * (M0 → *Chosen stretch feature*).
 *
 * Every parameter is validated here rather than trusted: `page` of `0` or
 * `-3` and a `pageSize` of `100000` are exactly the values a hand-written
 * request sends, and both are answered by this class before a single row is
 * read (FR-7.4).
 *
 * **The three filters of FR-7.2** (`relation`, `living`, `generation`) are
 * what turn this from "search" into "search, filter and pagination". They
 * narrow *people*; a memory has no generation and no relatives, so a request
 * that carries a filter is answered with people only — which is also the only
 * reading under which "filter by generation" can mean anything.
 */
export class SearchQueryDto {
  @ApiProperty({
    example: 'theary',
    description:
      'Matched against names, nicknames, biographies, memory titles and memory bodies — accent- and case-insensitive. May be empty when a filter is given: filtering is then a browse, not a search.',
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

  @ApiPropertyOptional({
    enum: RelationType,
    example: 'SPOUSE',
    description:
      'FR-7.2 — keep only people who stand in a relation of this type, at either end of it: `SPOUSE` keeps married couples, `PARENT` keeps everybody in a parent–child link. Implies people-only results.',
  })
  @IsOptional()
  @IsEnum(RelationType)
  relation?: RelationType;

  @ApiPropertyOptional({
    example: false,
    description:
      'FR-7.2 — `true` keeps the living, `false` the deceased. Query strings arrive as text, so it is accepted as `true`/`false` and rejected as anything else. Implies people-only results.',
  })
  @IsOptional()
  @Transform(({ value }): boolean | string => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    /* Anything else is passed through unchanged so `@IsBoolean` can reject
       it with the DTO's message — a value the query cannot be trusted with
       is turned into `true` or `false` nowhere in this file. */
    return typeof value === 'string' ? value : String(value);
  })
  @IsBoolean()
  living?: boolean;

  @ApiPropertyOptional({
    example: 2,
    minimum: 0,
    description:
      'FR-7.2 — keep only the people the generation rule (FR-5.6) places in this generation. Implies people-only results.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  generation?: number;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 50,
    description: 'FR-7.3 — 10 per page by default, capped at 50.',
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

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 14 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
