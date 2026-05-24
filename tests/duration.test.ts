import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration } from '../src/shared/duration';

describe('parseDuration', () => {
  it('parses each unit to milliseconds', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('10m')).toBe(600_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('1d')).toBe(86_400_000);
    expect(parseDuration('1w')).toBe(604_800_000);
    expect(parseDuration('5 M')).toBe(300_000); // whitespace + case tolerant
  });
  it('rejects invalid or non-positive', () => {
    for (const bad of ['abc', '0m', '10', '-5m', '', 'mm', '1y']) expect(parseDuration(bad)).toBeNull();
  });
  it('caps at one year', () => {
    expect(parseDuration('400d')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('renders human units', () => {
    expect(formatDuration(30_000)).toContain('ثانية');
    expect(formatDuration(600_000)).toContain('دقيقة');
    expect(formatDuration(7_200_000)).toContain('ساعة');
    expect(formatDuration(2 * 86_400_000)).toContain('يوم');
  });
});
