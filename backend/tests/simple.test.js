import { describe, test, expect } from '@jest/globals';

describe('Simple Test', () => {
  test('should run basic Jest test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });
});