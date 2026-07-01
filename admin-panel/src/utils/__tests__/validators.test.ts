import {
  isValidEmail,
  isValidPhone,
  isValidCNIC,
  isRequired,
  minLength,
  maxLength,
  isPositiveNumber,
  isNonNegativeNumber,
} from '../validators';

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b-c@sub.domain.pk')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('spaces in@x.com')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts Pakistani formats (0, +92, spaced)', () => {
    expect(isValidPhone('03001234567')).toBe(true);
    expect(isValidPhone('+92 300 1234567')).toBe(true);
  });
  it('rejects wrong length / non-numeric', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('abcdefghij')).toBe(false);
  });
});

describe('isValidCNIC', () => {
  it('accepts the 12345-1234567-1 format', () => {
    expect(isValidCNIC('35202-1234567-1')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidCNIC('3520212345671')).toBe(false);
    expect(isValidCNIC('35202-123-1')).toBe(false);
  });
});

describe('isRequired', () => {
  it('is false for null/undefined/blank', () => {
    expect(isRequired(null)).toBe(false);
    expect(isRequired(undefined)).toBe(false);
    expect(isRequired('   ')).toBe(false);
    expect(isRequired(NaN)).toBe(false);
  });
  it('is true for real values', () => {
    expect(isRequired('x')).toBe(true);
    expect(isRequired(0)).toBe(true);
    expect(isRequired(5)).toBe(true);
  });
});

describe('length helpers', () => {
  it('minLength / maxLength enforce bounds', () => {
    expect(minLength('abc', 3)).toBe(true);
    expect(minLength('ab', 3)).toBe(false);
    expect(maxLength('abc', 3)).toBe(true);
    expect(maxLength('abcd', 3)).toBe(false);
  });
});

describe('number helpers', () => {
  it('isPositiveNumber requires > 0', () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(NaN)).toBe(false);
  });
  it('isNonNegativeNumber allows 0', () => {
    expect(isNonNegativeNumber(0)).toBe(true);
    expect(isNonNegativeNumber(2)).toBe(true);
    expect(isNonNegativeNumber(-2)).toBe(false);
    expect(isNonNegativeNumber(NaN)).toBe(false);
  });
});
