import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { bustCache } from './api-cache';
import { clearPendingGainDeltas } from './pending-deltas';
import { setApiToken } from './api';

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** Server-side QA flag (profiles.is_dev); never self-writable by clients. */
  isDevAccount: boolean;
  onboardingComplete: boolean;
  competitionDate: string | null;
  entitlementStatus: string | null;
  hasPremiumAccess: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** __DEV__ or profiles.is_dev: trial bypass + complete onboarding without StoreKit. */
  completeOnboardingDevBypass: () => Promise<void>;
  /** __DEV__ or is_dev: hide premium for paywall QA (is_dev uses local suppress flag). */
  revokePremiumForTesting: () => void;
  /** __DEV__: in-memory reset. is_dev: RPC clears program + onboarding in DB. */
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
  signIn: async () => null,
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
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [competitionDate, setCompetitionDate] = useState<string | null>(null);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [entitlementExpiresAt, setEntitlementExpiresAt] = useState<string | null>(null);
  const [devPremiumBypass, setDevPremiumBypass] = useState(false);
  /** When true, is_dev accounts behave like non-subscribers for route guard (paywall QA). */
  const [suppressDevPremium, setSuppressDevPremium] = useState(false);

  const fetchUserState = useCallback(async (userId: string) => {
    const [profileRes, entRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('onboarding_completed, competition_date, is_dev')
        .eq('id', userId)
        .single(),
      supabase
        .from('entitlements')
        .select('status, expires_at')
        .eq('user_id', userId)
        .single(),
    ]);

    const profile = profileRes.data;
    const ent = entRes.data;

    setIsDevAccount(profile?.is_dev === true);
    setOnboardingComplete(profile?.onboarding_completed ?? false);
    setCompetitionDate(profile?.competition_date ?? null);
    setEntitlementStatus(ent?.status ?? 'none');
    setEntitlementExpiresAt(ent?.expires_at ?? null);
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
          setOnboardingComplete(false);
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

  const statusValid = entitlementStatus === 'trial' || entitlementStatus === 'active';
  const expired = entitlementExpiresAt ? new Date(entitlementExpiresAt) < new Date() : false;
  /** QA: Jump to Paywall sets suppressDevPremium — must override DB entitlement for routing. */
  const hasPremiumAccess =
    isDevAccount && suppressDevPremium
      ? false
      : (statusValid && !expired) ||
        devPremiumBypass ||
        (isDevAccount && !suppressDevPremium);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  };

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  };

  const signOut = async () => {
    setIsDevAccount(false);
    setOnboardingComplete(false);
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
    setOnboardingComplete(true);
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
      try {
        await supabase.rpc('dev_reset_onboarding_progress');
      } catch {
        /* migration may not be applied yet */
      }
      setDevPremiumBypass(false);
      setSuppressDevPremium(false);
      if (session?.user?.id) await fetchUserState(session.user.id);
      return;
    }
    // __DEV__ only: in-memory — never write false to the DB for non–is_dev accounts.
    setOnboardingComplete(false);
    setDevPremiumBypass(false);
  }, [isDevAccount, session?.user?.id, fetchUserState]);

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
    const { error } = await supabase
      .from('profiles')
      .update({ competition_date: date })
      .eq('id', session.user.id);
    if (error) return error.message;
    setCompetitionDate(date);
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
