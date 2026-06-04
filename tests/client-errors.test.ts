import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClientErrorHandlers } from '../src/bot/client';

describe('attachClientErrorHandlers (fleet-safety)', () => {
  it('without handlers, an error emit crashes (sanity check of the hazard)', () => {
    const ee = new EventEmitter();
    expect(() => ee.emit('error', new Error('boom'))).toThrow('boom');
  });

  it('a client error is logged with the tenant label, not thrown', () => {
    const ee = new EventEmitter();
    const logError = vi.fn();
    attachClientErrorHandlers(ee, 'tenant-g1', logError);
    expect(() => ee.emit('error', new Error('gateway reset'))).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain('tenant-g1');
    expect(logError.mock.calls[0][0]).toContain('gateway reset');
  });

  it('shard errors are logged too', () => {
    const ee = new EventEmitter();
    const logError = vi.fn();
    attachClientErrorHandlers(ee, 'tenant-g1', logError);
    ee.emit('shardError', new Error('ws closed'));
    expect(logError.mock.calls[0][0]).toContain('ws closed');
  });
});
