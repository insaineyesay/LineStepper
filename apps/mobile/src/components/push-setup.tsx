import { useEffect } from 'react';

import { useSession } from '@/lib/auth-context';
import { useFlag } from '@/lib/flags';
import { registerForPushAsync, useNotificationTapRouting } from '@/lib/push';

/**
 * Renders nothing. Opens the event when a notification is tapped, and re-saves
 * this device's push token on sign-in (tokens can change, and a phone can
 * change hands). It never asks for permission: the event screen does that
 * when someone bookmarks an event, and the member page when they follow
 * someone, which is when these notifications make sense.
 */
export function PushSetup() {
  const { session } = useSession();
  const remindersFlag = useFlag('events.reminders');
  const changeAlertsFlag = useFlag('events.change_alerts');
  const followerAlertsFlag = useFlag('events.follower_alerts');
  const pushFlag = useFlag('notify.push');
  const pushOn = pushFlag && (remindersFlag || changeAlertsFlag || followerAlertsFlag);
  const userId = session?.user.id;

  useNotificationTapRouting();

  useEffect(() => {
    if (userId && pushOn) void registerForPushAsync({ prompt: false });
  }, [userId, pushOn]);

  return null;
}
