import { useEffect } from 'react';

import { useSession } from '@/lib/auth-context';
import { useFlag } from '@/lib/flags';
import { registerForPushAsync, useNotificationTapRouting } from '@/lib/push';

/**
 * Renders nothing. Opens the event when a reminder is tapped, and re-saves
 * this device's push token on sign-in (tokens can change, and a phone can
 * change hands). It never asks for permission: the event screen does that
 * when someone bookmarks an event, which is when reminders make sense.
 */
export function PushSetup() {
  const { session } = useSession();
  const remindersFlag = useFlag('events.reminders');
  const pushFlag = useFlag('notify.push');
  const remindersOn = remindersFlag && pushFlag;
  const userId = session?.user.id;

  useNotificationTapRouting();

  useEffect(() => {
    if (userId && remindersOn) void registerForPushAsync({ prompt: false });
  }, [userId, remindersOn]);

  return null;
}
