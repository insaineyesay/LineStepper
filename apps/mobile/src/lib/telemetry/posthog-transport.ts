import PostHog from 'posthog-react-native';

import { kindOf, toPostHogCall, type LogEvent, type LogTransport } from '@linestepper/shared';

import { isAnalyticsOptedOut } from './consent';

type PostHogEventProperties = NonNullable<Parameters<PostHog['capture']>[1]>;

/**
 * PostHog adapter for the phone apps (the web build uses
 * posthog-transport.web.ts). The logger hands it every event; the shared
 * catalog decides what each one becomes. This is the only file that imports
 * the PostHog SDK, so changing vendors means replacing this file.
 */
export function createPostHogTransport(apiKey: string, host: string): LogTransport {
  const client = new PostHog(apiKey, {
    host,
    // We send app start/background ourselves through the catalog.
    captureAppLifecycleEvents: false,
  });
  let identifiedUser: string | undefined;

  return {
    name: 'posthog',
    write(e: LogEvent) {
      if (e.userId && e.userId !== identifiedUser) {
        identifiedUser = e.userId;
        client.identify(e.userId);
      } else if (!e.userId && identifiedUser) {
        identifiedUser = undefined;
        client.reset();
      }

      if (kindOf(e) === 'analytics' && isAnalyticsOptedOut()) return;
      const call = toPostHogCall(e);
      if (call.type === 'exception') client.captureException(call.error, call.properties as PostHogEventProperties);
      else if (call.type === 'screen') void client.screen(call.name, call.properties as PostHogEventProperties);
      else if (call.type === 'capture') client.capture(call.name, call.properties as PostHogEventProperties);
    },
    flush: () => client.flush(),
  };
}
