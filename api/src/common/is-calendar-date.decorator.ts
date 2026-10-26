import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date-only value that is a real calendar date: `1985-04-03` yes,
 * `2026-02-31` no.
 *
 * A pattern check alone would accept 31 February, and
 * `new Date('2026-02-31')` quietly becomes 2 March — so the round trip
 * through `Date.UTC` is the test: construct the date from the three numbers
 * and read the three numbers back. If they differ, the month overflowed and
 * the day does not exist.
 *
 * `1985-04-03` is also compared only as text everywhere else in this API
 * (death vs birth, sorting memories), which stays correct precisely because
 * this decorator guarantees the text is a genuine, zero-padded calendar date.
 */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value === '') return false;

          const match = SHAPE.exec(value);
          if (match === null) return false;

          const [, y, m, d] = match;
          const year = Number(y);
          const month = Number(m);
          const day = Number(d);

          const constructed = new Date(Date.UTC(year, month - 1, day));
          return (
            constructed.getUTCFullYear() === year &&
            constructed.getUTCMonth() === month - 1 &&
            constructed.getUTCDate() === day
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a real calendar date in the form YYYY-MM-DD.`;
        },
      },
    });
  };
}
