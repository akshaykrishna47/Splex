import { useEffect } from 'react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavBar } from '@/components/NavBar';
import { installWebFonts } from '@/lib/web-fonts';
import { installThemeVars } from '@/lib/stores/theme';
import { ToastProvider } from '@/components/ui/Toast';
import { useSessionStore } from '@/lib/stores/session';
import { colors, fontFamily } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Adds the Google Fonts <link> tags and the --font-heading / --font-body
// variables. Module scope so it runs before first paint; no-op off the web.
installWebFonts();
// Emits both palettes as CSS custom properties. Must run before first paint.
installThemeVars();

export default function RootLayout() {
  const bootstrap = useSessionStore((s) => s.bootstrap);

  // Each weight is a separate font file — React Native does not synthesise bold.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Headings.
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    // The greeting name only.
    Lobster_400Regular,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void bootstrap().then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <SafeAreaProvider>
        {/* Light glyphs: the app surface is near-black, so "dark" would render
            the clock and battery invisibly against it. */}
        <StatusBar style="light" />
        {/* Hold the splash until Inter is ready, so nothing renders in the
            fallback face and then reflows once the real font arrives. */}
        {fontsLoaded ? <AuthGate /> : <BootSplash />}
      </SafeAreaProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function BootSplash() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primaryText} />
    </View>
  );
}

/**
 * Redirects between the app and the sign-in screen as the session changes.
 * `/join/[code]` is deliberately reachable while logged out so the invite is
 * captured before authentication and replayed after it.
 */
function AuthGate() {
  const session = useSessionStore((s) => s.session);
  const ready = useSessionStore((s) => s.ready);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const first = segments[0];
    // `reset-password` is public even though arriving there normally means
    // holding a recovery session: without one it has to be able to say the
    // link expired, rather than bouncing to sign-in with no explanation.
    const isPublicRoute =
      first === 'sign-in' ||
      first === 'join' ||
      first === 'forgot-password' ||
      first === 'reset-password';

    if (!session && !isPublicRoute) {
      router.replace('/sign-in');
    } else if (session && first === 'sign-in') {
      router.replace('/');
    }
  }, [ready, session, segments, router]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primaryText} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      {/* App chrome. Renders nothing when signed out. */}
      <NavBar />

      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontSize: 17, fontFamily: fontFamily.semibold },
          headerTintColor: colors.primaryText,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* Top-level routes get no stack header — NavBar is their chrome, and
            two stacked bars would just eat vertical space. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="trips" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        {/* Recovery screens carry their own branding, like sign-in does. */}
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join trip' }} />
        {/* Trip screens keep their own headers: they need a back button. */}
        <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
