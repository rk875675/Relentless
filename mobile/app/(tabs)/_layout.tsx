import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  outlineName,
  filledName,
  focused,
  color,
  size,
}: {
  outlineName: IconName;
  filledName: IconName;
  focused: boolean;
  color: string;
  size: number;
}) {
  return (
    <Ionicons
      name={focused ? filledName : outlineName}
      size={size - 2}
      color={color}
    />
  );
}

function HapticTabButton(props: any) {
  return (
    <TouchableOpacity
      {...props}
      activeOpacity={0.7}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onPress?.(e);
      }}
    />
  );
}

const TAB_ROW_HEIGHT = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_ROW_HEIGHT + insets.bottom;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarButton: HapticTabButton,
        tabBarActiveTintColor: colors.accentLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
          paddingTop: 4,
          borderRadius: 0,
          backgroundColor: colors.tabBarBg,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          elevation: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon outlineName="book-outline" filledName="book" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon outlineName="home-outline" filledName="home" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon outlineName="person-outline" filledName="person" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
