import { describe, expect, it } from 'vitest';

import { LogEvents, type LogEvent } from '../src/logging';
import { isCatalogEvent, kindOf, TELEMETRY_CATALOG, toPostHogCall } from '../src/telemetry';

const event = (over: Partial<LogEvent>): LogEvent => ({
  ts: '2026-11-09T18:00:00.000Z',
  level: 'info',
  event: 'ui.tap',
  source: 'mobile',
  ...over,
});

describe('catalog', () => {
  it('lists every event name the code uses', () => {
    for (const name of Object.values(LogEvents)) {
      expect(isCatalogEvent(name), `${name} is missing from TELEMETRY_CATALOG`).toBe(true);
    }
  });

  it('describes every event', () => {
    for (const [name, def] of Object.entries(TELEMETRY_CATALOG)) {
      expect(def.description.length, name).toBeGreaterThan(0);
    }
  });
});

describe('kindOf', () => {
  it('uses the catalog, with errors winning and unknown names treated as logs', () => {
    expect(kindOf(event({ event: 'ui.tap' }))).toBe('analytics');
    expect(kindOf(event({ event: 'api.request' }))).toBe('log');
    expect(kindOf(event({ event: 'ui.tap', level: 'error' }))).toBe('error');
    expect(kindOf(event({ event: 'something.new' }))).toBe('log');
  });
});

describe('toPostHogCall', () => {
  it('sends analytics as events, with screen views as screens', () => {
    expect(toPostHogCall(event({ event: 'ui.tap', data: { name: 'buy' }, appVersion: '0.1.0', sessionId: 's1' }))).toEqual({
      type: 'capture',
      name: 'ui.tap',
      properties: { name: 'buy', level: 'info', source: 'mobile', app_version: '0.1.0', session_id: 's1' },
    });
    expect(toPostHogCall(event({ event: 'screen.view', data: { screen: '/crews' } }))).toMatchObject({
      type: 'screen',
      name: '/crews',
    });
  });

  it('sends errors to error tracking with the original stack', () => {
    const call = toPostHogCall(
      event({ event: 'error.unhandled', level: 'error', error: { name: 'TypeError', message: 'x is undefined', stack: 'at y' } })
    );
    expect(call.type).toBe('exception');
    if (call.type === 'exception') {
      expect(call.error.name).toBe('TypeError');
      expect(call.error.message).toBe('x is undefined');
      expect(call.error.stack).toBe('at y');
      expect(call.properties.event).toBe('error.unhandled');
    }
  });

  it('keeps routine logs out of PostHog but sends warnings', () => {
    expect(toPostHogCall(event({ event: 'api.request' }))).toEqual({ type: 'skip' });
    expect(toPostHogCall(event({ event: 'checkout.failed', level: 'warn' })).type).toBe('capture');
  });
});
