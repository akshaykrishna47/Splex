import { Stack } from 'expo-router';
import { colors, fontFamily } from '@/lib/theme';

export default function TripLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontSize: 17, fontFamily: fontFamily.semibold },
        headerTintColor: colors.primaryText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        // Left-aligned so a long title grows away from the currency control on
        // the right rather than expanding out from the centre into it.
        headerTitleAlign: 'left',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Trip' }} />
      <Stack.Screen name="members" options={{ title: 'People' }} />
      <Stack.Screen name="balances" options={{ title: 'Balances' }} />
      <Stack.Screen name="expense/new" options={{ title: 'New expense', presentation: 'modal' }} />
      <Stack.Screen
        name="expense/[expenseId]"
        options={{ title: 'Edit expense', presentation: 'modal' }}
      />
    </Stack>
  );
}
