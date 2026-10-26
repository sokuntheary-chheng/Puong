import { ApiProperty } from '@nestjs/swagger';

/**
 * The error body, as a schema.
 *
 * Every non-2xx response from this API has exactly these three fields
 * (wind.md, Appendix B), and `ApiExceptionFilter` is what produces them — so
 * declaring the shape here means Swagger documents the contract the filter
 * actually enforces, rather than one somebody hoped for.
 */
export class ErrorDto {
  @ApiProperty({
    example: 400,
    description: 'HTTP status, repeated in the body.',
  })
  statusCode: number;

  @ApiProperty({
    example: ['birthDate must not be before deathDate.'],
    description:
      'Always an array. Validation may contribute several messages at once.',
  })
  message: string[];

  @ApiProperty({ example: 'Bad Request', description: 'The status text.' })
  error: string;
}
