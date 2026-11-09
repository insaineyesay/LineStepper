import { posthog } from 'posthog-js';

import { kindOf, toPostHogCall, type LogEvent, type LogTransport } from '@linestepper/shared';

import { isAnalyticsOptedOut } from './consent';

/**
 * PostHog adapter for the web build (the phone apps use
 * posthog-transport.ts). Same mapping, browser SDK. PostHog's own automatic
 * tracking is off: everything goes through the shared catalog.
 */
export function createPostHogTransport(apiKey: string, host: string): LogTransport {
  posthog.init(apiKey, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    disable_session_recording: true,
  });
  let identifiedUser: string | undefined;

  return {
    name: 'posthog',
    write(e: LogEvent) {
      if (e.userId && e.userId !== identifiedUser) {
        identifiedUser = e.userId;
        posthog.identify(e.userId);
      } else if (!e.userId && identifiedUser) {
        identifiedUser = undefined;
        posthog.reset();
      }

      if (kindOf(e) === 'analytics' && isAnalyticsOptedOut()) return;
      const call = toPostHogCall(e);
      if (call.type === 'exception') posthog.captureException(call.error, call.properties);
      else if (call.type === 'screen') posthog.capture('$pageview', { ...call.properties, $current_url: call.name });
      else if (call.type === 'capture') posthog.capture(call.name, call.properties);
    },
  };
}
