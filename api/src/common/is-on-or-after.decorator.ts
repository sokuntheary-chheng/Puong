import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * `deathDate` must not be before `birthDate` — story 4's acceptance criterion:
 * *"a death date before the birth date is rejected with a clear message"*.
 *
 * A class-level validator would be the textbook answer, but this rule belongs
 * to exactly one field, and keeping it with that field means the DTO reads
 * top to bottom: the date, then the rule about the date.
 *
 * Both values are ISO calendar dates (`YYYY-MM-DD`), so the comparison is
 * lexicographic — `"1990-01-01" < "1990-01-02"` — with no date parsing and no
 * time zone to get wrong. If either side is missing there is nothing to
 * compare, and the rule passes: an unknown birth date cannot make a death date
 * unreasonable.
 */
export function IsOnOrAfter(
  earlierProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isOnOrAfter',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [earlierProperty],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [earlier] = args.constraints as [string];
          const other = (args.object as Record<string, unknown>)[earlier];

          if (typeof value !== 'string' || typeof other !== 'string') {
            return true;
          }
          if (value === '' || other === '') return true;

          return value >= other;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not be before ${String(args.constraints[0])}.`;
        },
      },
    });
  };
}
