import { validateTargetRoles } from './validateTargetRoles';
import { BadRequestError } from '@common/ErrorTypes';

describe('validateTargetRoles', () => {
  it('accepts trimmed valid roles', () => {
    expect(validateTargetRoles(['  Engineer ', 'Designer'])).toEqual(['Engineer', 'Designer']);
  });

  it('rejects non-array', () => {
    expect(() => validateTargetRoles('x')).toThrow(BadRequestError);
  });

  it('rejects empty strings after trim', () => {
    expect(() => validateTargetRoles(['ok', '  '])).toThrow(BadRequestError);
  });

  it('rejects more than 10 roles', () => {
    const roles = Array.from({ length: 11 }, (_, i) => `role-${i}`);
    expect(() => validateTargetRoles(roles)).toThrow(BadRequestError);
  });

  it('rejects roles longer than 80 chars', () => {
    expect(() => validateTargetRoles(['a'.repeat(81)])).toThrow(BadRequestError);
  });
});
