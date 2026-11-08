import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    // The tab bar sits above the content (not floating over it) so inner
    // screens' headers and back buttons are never hidden behind it.
    <Tabs style={styles.tabs}>
      <TabList asChild>
        <CustomTabList>
          {/* resetOnFocus: clicking a tab always opens its first screen (Events list, Crews list, Profile). */}
          <TabTrigger name="(browse)" href="/" resetOnFocus asChild>
            <TabButton>Events</TabButton>
          </TabTrigger>
          <TabTrigger name="(crews)" href="/crews" resetOnFocus asChild>
            <TabButton>Crews</TabButton>
          </TabTrigger>
          <TabTrigger name="(profile)" href="/profile" resetOnFocus asChild>
            <TabButton>Profile</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  // expo-router 58 types the slot's `ref` as a component type, while React
  // Native 0.88's Pressable expects an element ref. It's the same ref at
  // runtime (Expo's own SDK 58 template has this mismatch). Remove the cast
  // once expo-router's TabTriggerSlotProps is fixed upstream.
  const pressableProps = props as PressableProps;
  return (
    <Pressable {...pressableProps} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          LineStepper
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  tabListContainer: {
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
