import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { bustCache } from './api-cache';
import { clearPendingGainDeltas } from './pending-deltas';
import { setApiToken } from './api';

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;

/** Fresh DB snapshot from `fetchUserState` (used so post–sign-in navigation does not wait on React state). */
type FetchedUserSnapshot = {
  isDevAccount: boolean;
  profileOnboardingCompleted: boolean;
  competitionDate: string | null;
  entitlementStatus: string | null;
  entitlementExpiresAt: string | null;
};

type SignInResult =
  | { ok: false; error: string }
  | { ok: true; path: '/(tabs)' | '/(onboarding)/paywall' | '/(onboarding)/welcome' };

/** Mirrors onboardingComplete / hasPremiumAccess in this file for one-shot routing after sign-in. */
function postSignInPath(
  snap: FetchedUserSnapshot,
  flags: { devReplayOnboarding: boolean; suppressDevPremium: boolean; devPremiumBypass: boolean },
): '/(tabs)' | '/(onboarding)/paywall' | '/(onboarding)/welcome' {
  const onboardingComplete =
    snap.profileOnboardingCompleted && !(snap.isDevAccount && flags.devReplayOnboarding);
  const statusValid =
    snap.entitlementStatus === 'trial' || snap.entitlementStatus === 'active';
  const expired = snap.entitlementExpiresAt
    ? new Date(snap.entitlementExpiresAt) < new Date()
    : false;
  const hasPremiumAccess =
    snap.isDevAccount && flags.suppressDevPremium
      ? false
      : (statusValid && !expired) ||
        flags.devPremiumBypass ||
        (snap.isDevAccount && !flags.suppressDevPremium);

  if (onboardingComplete && hasPremiumAccess) return '/(tabs)';
  if (onboardingComplete && !hasPremiumAccess) return '/(onboarding)/paywall';
  return '/(onboarding)/welcome';
}

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** Server-side QA flag (profiles.is_dev); never self-writable by clients. */
  isDevAccount: boolean;
  onboardingComplete: boolean;
  competitionDate: string | null;
  entitlementStatus: string | null;
  hasPremiumAccess: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** __DEV__ or profiles.is_dev: trial bypass + complete onboarding without StoreKit. */
  completeOnboardingDevBypass: () => Promise<void>;
  /** __DEV__ or is_dev: hide premium for paywall QA (is_dev uses local suppress flag). */
  revokePremiumForTesting: () => void;
  /** __DEV__: in-memory reset. is_dev: RPC clears program/progress; replay uses local overlay (DB stays completed). */
  resetOnboarding: () => Promise<void>;
  refreshUserState: () => Promise<void>;
  updateCompetitionDate: (date: string | null) => Promise<string | null>;
  /**
   * Optimistically marks the user as having active entitlement in local state,
   * without waiting for the DB write to complete. Called by SuperwallPurchaseSync
   * when Superwall's own StoreKit observer confirms the subscription is ACTIVE.
   * The DB is still written in background via syncSubscriptionWithBackend.
   */
  optimisticGrantAccess: () => void;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  isDevAccount: false,
  onboardingComplete: false,
  competitionDate: null,
  entitlementStatus: null,
  hasPremiumAccess: false,
  signIn: async () => ({ ok: false, error: '' }),
  signUp: async () => null,
  signOut: async () => {},
  completeOnboarding: async () => {},
  completeOnboardingDevBypass: async () => {},
  revokePremiumForTesting: () => {},
  resetOnboarding: async () => {},
  refreshUserState: async () => {},
  updateCompetitionDate: async () => null,
  optimisticGrantAccess: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevAccount, setIsDevAccount] = useState(false);
  /** From profiles.onboarding_completed only (never written false client-side for is_dev replay). */
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState(false);
  /** is_dev only: after Reset to Onboarding, treat routing as incomplete while DB stays completed. */
  const [devReplayOnboarding, setDevReplayOnboarding] = useState(false);
  const [competitionDate, setCompetitionDate] = useState<string | null>(null);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [entitlementExpiresAt, setEntitlementExpiresAt] = useState<string | null>(null);
  const [devPremiumBypass, setDevPremiumBypass] = useState(false);
  /** When true, is_dev accounts behave like non-subscribers for route guard (paywall QA). */
  const [suppressDevPremium, setSuppressDevPremium] = useState(false);

  /** Latest routing overlays for post–sign-in path (React state may not have flushed yet). */
  const routingFlagsRef = useRef({
    devReplayOnboarding: false,
    suppressDevPremium: false,
    devPremiumBypass: false,
  });
  routingFlagsRef.current = {
    devReplayOnboarding,
    suppressDevPremium,
    devPremiumBypass,
  };

  const fetchUserState = useCallback(async (userId: string): Promise<FetchedUserSnapshot> => {
    const [profileRes, entRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('onboarding_completed, competition_date, is_dev')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('entitlements')
        .select('status, expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      throw new Error(profileRes.error.message);
    }
    if (entRes.error) {
      throw new Error(entRes.error.message);
    }

    const profile = profileRes.data;
    const ent = entRes.data;

    const isDev = profile?.is_dev === true;
    const profileCompleted = profile?.onboarding_completed ?? false;
    const compDate = profile?.competition_date ?? null;
    const entStatus = ent?.status ?? 'none';
    const entExpires = ent?.expires_at ?? null;

    setIsDevAccount(isDev);
    setProfileOnboardingCompleted(profileCompleted);
    setCompetitionDate(compDate);
    setEntitlementStatus(entStatus);
    setEntitlementExpiresAt(entExpires);

    return {
      isDevAccount: isDev,
      profileOnboardingCompleted: profileCompleted,
      competitionDate: compDate,
      entitlementStatus: entStatus,
      entitlementExpiresAt: entExpires,
    };
  }, []);

  const refreshUserState = useCallback(async () => {
    if (!session?.user?.id) return;
    await fetchUserState(session.user.id);
  }, [session?.user?.id, fetchUserState]);

  const lastForegroundRefresh = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && session?.user?.id) {
        const now = Date.now();
        if (now - lastForegroundRefresh.current >= FOREGROUND_REFRESH_DEBOUNCE_MS) {
          lastForegroundRefresh.current = now;
          fetchUserState(session.user.id).catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [session?.user?.id, fetchUserState]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setApiToken(s?.access_token ?? null);
      if (s?.user) {
        try {
          await fetchUserState(s.user.id);
        } catch {
          try { await fetchUserState(s.user.id); } catch { /* give up */ }
        }
      }
    }).catch(() => {
      // Auth/network failure — proceed unauthenticated rather than hang forever.
    }).finally(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (_event === 'INITIAL_SESSION') return;
        setSession(s);
        setApiToken(s?.access_token ?? null);
        if (s?.user) {
          try {
            await fetchUserState(s.user.id);
          } catch {
            try { await fetchUserState(s.user.id); } catch { /* give up */ }
          }
        } else {
          setIsDevAccount(false);
          setProfileOnboardingCompleted(false);
          setDevReplayOnboarding(false);
          setCompetitionDate(null);
          setEntitlementStatus(null);
          setEntitlementExpiresAt(null);
          setDevPremiumBypass(false);
          setSuppressDevPremium(false);
          clearPendingGainDeltas();
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchUserState]);

  const onboardingComplete = useMemo(
    () => profileOnboardingCompleted && !(isDevAccount && devReplayOnboarding),
    [profileOnboardingCompleted, isDevAccount, devReplayOnboarding],
  );

  const statusValid = entitlementStatus === 'trial' || entitlementStatus === 'active';
  const expired = entitlementExpiresAt ? new Date(entitlementExpiresAt) < new Date() : false;
  /** QA: Jump to Paywall sets suppressDevPremium — must override DB entitlement for routing. */
  const hasPremiumAccess =
    isDevAccount && suppressDevPremium
      ? false
      : (statusValid && !expired) ||
        devPremiumBypass ||
        (isDevAccount && !suppressDevPremium);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Could not sign in.' };

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false, error: 'Session did not start. Try again or restart the app.' };
    }

    // A fresh credential sign-in is an explicit "start clean" intent. Clear any
    // QA overlays that may still be set from a prior in-app reset (e.g., a dev
    // user tapped Reset to Onboarding, was routed to welcome, then signed back
    // in without signing out — the signed-out branch in onAuthStateChange would
    // not have fired). Update the ref synchronously so postSignInPath below
    // does not read stale flags before React commits the setState.
    setDevReplayOnboarding(false);
    setSuppressDevPremium(false);
    setDevPremiumBypass(false);
    routingFlagsRef.current = {
      devReplayOnboarding: false,
      suppressDevPremium: false,
      devPremiumBypass: false,
    };

    let snap: FetchedUserSnapshot | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 120 * attempt));
      }
      try {
        snap = await fetchUserState(data.user.id);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!snap) {
      const msg = lastErr instanceof Error ? lastErr.message : 'Could not load your profile.';
      return { ok: false, error: `${msg} Try again.` };
    }

    const path = postSignInPath(snap, routingFlagsRef.current);
    return { ok: true, path };
  };

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  };

  const signOut = async () => {
    setIsDevAccount(false);
    setProfileOnboardingCompleted(false);
    setDevReplayOnboarding(false);
    setDevPremiumBypass(false);
    setSuppressDevPremium(false);
    bustCache();
    clearPendingGainDeltas();
    await supabase.auth.signOut();
  };

  const completeOnboarding = useCallback(async () => {
    if (!session?.user) return;
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', session.user.id);
    setProfileOnboardingCompleted(true);
    setDevReplayOnboarding(false);
  }, [session]);

  const completeOnboardingDevBypass = useCallback(async () => {
    if (!__DEV__ && !isDevAccount) return;
    setSuppressDevPremium(false);
    setDevPremiumBypass(true);
    try { await supabase.rpc('dev_grant_trial'); } catch { /* RPC may not be deployed */ }
    await completeOnboarding();
  }, [completeOnboarding, isDevAccount]);

  const revokePremiumForTesting = useCallback(() => {
    if (!__DEV__ && !isDevAccount) return;
    setDevPremiumBypass(false);
    if (isDevAccount) {
      setSuppressDevPremium(true);
      return;
    }
    setEntitlementStatus('none');
    setEntitlementExpiresAt(null);
  }, [isDevAccount]);

  const resetOnboarding = useCallback(async () => {
    if (!__DEV__ && !isDevAccount) return;
    if (isDevAccount) {
      // Non-destructive: just enable the client-side replay overlay so the
      // onboarding flow shows again. DB rows (lessons, progress, streaks,
      // program day, onboarding_completed) are intentionally left intact.
      setDevReplayOnboarding(true);
      setDevPremiumBypass(false);
      setSuppressDevPremium(false);
      return;
    }
    // __DEV__ only: in-memory — never write false to the DB for non–is_dev accounts.
    setProfileOnboardingCompleted(false);
    setDevPremiumBypass(false);
  }, [isDevAccount]);

  const optimisticGrantAccess = useCallback(() => {
    setSuppressDevPremium(false);
    // Set a far-future expiry so the expired-check doesn't immediately revoke it.
    // The real expiry is written to DB by syncSubscriptionWithBackend in background,
    // and refreshUserState() replaces this value once the DB write completes.
    setEntitlementStatus('active');
    setEntitlementExpiresAt(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
  }, []);

  const updateCompetitionDate = useCallback(async (date: string | null): Promise<string | null> => {
    if (!session?.user) return 'Not authenticated';
    const { data, error } = await supabase
      .from('profiles')
      .update({ competition_date: date })
      .eq('id', session.user.id)
      .select('competition_date');
    if (error) return error.message;
    if (!data?.length) return 'Could not save competition date';
    setCompetitionDate(data[0]?.competition_date ?? date);
    return null;
  }, [session]);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      isDevAccount,
      onboardingComplete,
      competitionDate,
      entitlementStatus,
      hasPremiumAccess,
      signIn,
      signUp,
      signOut,
      completeOnboarding,
      completeOnboardingDevBypass,
      revokePremiumForTesting,
      resetOnboarding,
      refreshUserState,
      updateCompetitionDate,
      optimisticGrantAccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
