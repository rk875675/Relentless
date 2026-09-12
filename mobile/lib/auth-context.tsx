import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { getEmailConfirmRedirectUrl, getOAuthRedirectUrl, parseOAuthCallbackUrl } from './auth-redirects';
import { openAuthSessionWithTimeout } from './oauth-open-auth-session';
import { bustCache } from './api-cache';
import { clearPendingGainDeltas } from './pending-deltas';
import { clearLessonCompletedForReferral } from './referral-popup-state';
import { setApiToken } from './api';
import { clearOnboardingProgress } from './onboarding-local-state';
import { flushPendingGrantJournal } from './pending-grant-journal';
import { restorePurchasesViaStoreKit } from './iap-restore';

/** Google / Apple OAuth pitfalls: see `mobile/docs/AUTH_SOCIAL_SIGNIN.md`. */

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;
/** Max time a trial/active row with a just-lapsed expires_at keeps access while one silent Apple re-verification runs. */
const STALE_ENTITLEMENT_GRACE_MS = 15_000;
/** An 'expired' row whose date passed within this window may be an unsynced renewal the server auto-flipped — still re-verify before paywalling. Older lapses paywall immediately. */
const RECENT_LAPSE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** If profile/entitlement queries stall (common on first OAuth after code exchange), still resolve the sign-in promise. Session is already persisted; background fetch + RouteGuard corrects routing. */
const POST_SIGNIN_PROFILE_BUDGET_MS = 12_000;
const MAX_PROFILE_DISPLAY_NAME_LEN = 80;

/** Use the Supabase client (not React `session`) so Skip works on the first tap in Expo Go / after fast refresh. */
async function getClientUserId(hint?: string | null): Promise<string | null> {
  if (hint) return hint;
  const { data: s } = await supabase.auth.getSession();
  if (s.session?.user?.id) return s.session.user.id;
  const { data: g } = await supabase.auth.getUser();
  return g.user?.id ?? null;
}

/** Fresh DB snapshot from `fetchUserState` (used so post–sign-in navigation does not wait on React state). */
type FetchedUserSnapshot = {
  isDevAccount: boolean;
  profileOnboardingCompleted: boolean;
  competitionDate: string | null;
  sport: string | null;
  isTrackAthlete: boolean;
  entitlementStatus: string | null;
  entitlementExpiresAt: string | null;
};

type SignInResult =
  | { ok: false; error: string }
  | { ok: true; path: '/(tabs)' | '/(onboarding)/paywall' | '/(onboarding)/welcome' }
  | { ok: true; path: null };

/** User closed OAuth sheet or provider returned access_denied — do not show an error toast. */
export type SocialSignInResult = SignInResult | { ok: false; cancelled: true };

type OAuthExchangeResult =
  | { ok: true; user: { id: string } }
  | { ok: false; error: string };

/** Mirrors onboardingComplete / hasPremiumAccess in this file for one-shot routing after sign-in. */
function postSignInPath(
  snap: FetchedUserSnapshot,
  flags: { devReplayOnboarding: boolean; suppressDevPremium: boolean; devPremiumBypass: boolean },
): '/(tabs)' | '/(onboarding)/paywall' | '/(onboarding)/welcome' {
  // is_dev accounts bypass onboarding (and the subscription, below) entirely —
  // they route straight into the app without completing onboarding. The only
  // exception is the QA "replay onboarding" overlay (devReplayOnboarding).
  const onboardingComplete =
    (snap.profileOnboardingCompleted || snap.isDevAccount) &&
    !(snap.isDevAccount && flags.devReplayOnboarding);
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
  /** True once profiles/entitlements loaded at least once for this session (see state). */
  profileLoaded: boolean;
  competitionDate: string | null;
  sport: string | null;
  /** User-chosen label on Profile; empty in DB ⇒ client falls back to email local-part. */
  displayName: string | null;
  isTrackAthlete: boolean;
  entitlementStatus: string | null;
  hasPremiumAccess: boolean;
  /** True while an optimistic entitlement grant is active and the DB hasn't confirmed the subscription yet. */
  isOptimisticGrant: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signInWithGoogle: () => Promise<SocialSignInResult>;
  signInWithApple: () => Promise<SocialSignInResult>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeOnboarding: (options?: { requireUser?: boolean; userId?: string | null }) => Promise<void>;
  /** __DEV__ or profiles.is_dev: trial bypass + complete onboarding without StoreKit. */
  completeOnboardingDevBypass: () => Promise<void>;
  /** __DEV__ or is_dev: hide premium for paywall QA (is_dev uses local suppress flag). */
  revokePremiumForTesting: () => void;
  /** __DEV__: in-memory reset. is_dev: RPC clears program/progress; replay uses local overlay (DB stays completed). */
  resetOnboarding: () => Promise<void>;
  refreshUserState: () => Promise<void>;
  updateCompetitionDate: (date: string | null) => Promise<string | null>;
  updateSport: (sport: string | null) => Promise<string | null>;
  updateDisplayName: (name: string | null) => Promise<string | null>;
  updateIsTrackAthlete: (value: boolean) => Promise<string | null>;
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
  profileLoaded: false,
  competitionDate: null,
  sport: null,
  displayName: null,
  isTrackAthlete: false,
  entitlementStatus: null,
  hasPremiumAccess: false,
  isOptimisticGrant: false,
  signIn: async () => ({ ok: false, error: '' }),
  signInWithGoogle: async () => ({ ok: false, error: 'Not in provider.' }),
  signInWithApple: async () => ({ ok: false, error: 'Not in provider.' }),
  signUp: async () => null,
  signOut: async () => {},
  completeOnboarding: async () => {},
  completeOnboardingDevBypass: async () => {},
  revokePremiumForTesting: () => {},
  resetOnboarding: async () => {},
  refreshUserState: async () => {},
  updateCompetitionDate: async () => null,
  updateSport: async () => null,
  updateDisplayName: async () => null,
  updateIsTrackAthlete: async () => null,
  optimisticGrantAccess: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevAccount, setIsDevAccount] = useState(false);
  /** From profiles.onboarding_completed only (never written false client-side for is_dev replay). */
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState(false);
  /**
   * True once profiles/entitlements have been fetched successfully at least once
   * for the current session. RouteGuard uses this so a signed-in user whose
   * profile fetch is still pending or transiently failing is NOT bounced back to
   * the onboarding welcome ("get started") screen.
   */
  const [profileLoaded, setProfileLoaded] = useState(false);
  /** is_dev only: after Reset to Onboarding, treat routing as incomplete while DB stays completed. */
  const [devReplayOnboarding, setDevReplayOnboarding] = useState(false);
  const [competitionDate, setCompetitionDate] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isTrackAthlete, setIsTrackAthlete] = useState(false);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [entitlementExpiresAt, setEntitlementExpiresAt] = useState<string | null>(null);
  const [isOptimisticGrant, setIsOptimisticGrant] = useState(false);
  const [devPremiumBypass, setDevPremiumBypass] = useState(false);
  /** When true, is_dev accounts behave like non-subscribers for route guard (paywall QA). */
  const [suppressDevPremium, setSuppressDevPremium] = useState(false);
  const oauthCodeExchangeRef = useRef(new Map<string, Promise<OAuthExchangeResult>>());

  /** When true, an optimistic entitlement grant is in effect (purchase completed
   *  but backend sync hasn't confirmed yet). Prevents fetchUserState from
   *  downgrading the local entitlement until the DB catches up. */
  const optimisticGrantActiveRef = useRef(false);

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
    const profileSelectAttempts = [
      'onboarding_completed, competition_date, is_dev, sport, is_track_athlete, display_name',
      'onboarding_completed, competition_date, is_dev, sport, is_track_athlete',
      'onboarding_completed, competition_date, is_dev, sport',
      'onboarding_completed, competition_date, is_dev, is_track_athlete',
      'onboarding_completed, competition_date, is_dev',
    ] as const;

    const [entRes, initialProfileRes] = await Promise.all([
      supabase
        .from('entitlements')
        .select('status, expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select(profileSelectAttempts[0])
        .eq('id', userId)
        .maybeSingle(),
    ]);

    let profileRes = initialProfileRes;

    for (let i = 1; i < profileSelectAttempts.length && profileRes.error; i++) {
      const msg = `${profileRes.error.message ?? ''} ${profileRes.error.details ?? ''}`.toLowerCase();
      const missingCol =
        profileRes.error.code === '42703' ||
        (msg.includes('does not exist') && msg.includes('column'));
      if (!missingCol) break;
      profileRes = await supabase
        .from('profiles')
        .select(profileSelectAttempts[i])
        .eq('id', userId)
        .maybeSingle();
    }

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
    const sportVal = (profile as { sport?: string | null } | null)?.sport ?? null;
    const displayNameVal =
      (profile as { display_name?: string | null } | null)?.display_name?.trim() || null;
    const trackVal = (profile as { is_track_athlete?: boolean | null } | null)?.is_track_athlete === true;
    const entStatus = ent?.status ?? 'none';
    const entExpires = ent?.expires_at ?? null;

    setIsDevAccount(isDev);
    setProfileOnboardingCompleted(profileCompleted);
    setCompetitionDate(compDate);
    setSport(sportVal);
    setDisplayName(displayNameVal);
    setIsTrackAthlete(trackVal);

    const dbEntitlementActive = entStatus === 'trial' || entStatus === 'active';
    if (optimisticGrantActiveRef.current && !dbEntitlementActive) {
      // Keep the optimistic values — DB hasn't caught up with the StoreKit purchase yet.
    } else {
      if (dbEntitlementActive) optimisticGrantActiveRef.current = false;
      setEntitlementStatus(entStatus);
      setEntitlementExpiresAt(entExpires);
      setIsOptimisticGrant(false);
    }

    // Return effective values so postSignInPath sees the optimistic grant if active.
    const effectiveEntStatus =
      optimisticGrantActiveRef.current && !dbEntitlementActive ? 'active' : entStatus;
    const effectiveEntExpires =
      optimisticGrantActiveRef.current && !dbEntitlementActive
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : entExpires;

    setProfileLoaded(true);

    return {
      isDevAccount: isDev,
      profileOnboardingCompleted: profileCompleted,
      competitionDate: compDate,
      sport: sportVal,
      isTrackAthlete: trackVal,
      entitlementStatus: effectiveEntStatus,
      entitlementExpiresAt: effectiveEntExpires,
    };
  }, []);

  const refreshUserState = useCallback(async () => {
    const userId = await getClientUserId(session?.user?.id ?? null);
    if (!userId) return;
    await fetchUserState(userId);
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
        // Recover a Grant onboarding journal answer left in AsyncStorage from a
        // previous launch where all retry attempts failed (e.g. app killed mid-retry).
        void flushPendingGrantJournal();
      }
    }).catch(() => {
      // Auth/network failure — proceed unauthenticated rather than hang forever.
    }).finally(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        if (_event === 'INITIAL_SESSION') return;
        setSession(s);
        setApiToken(s?.access_token ?? null);
        if (s?.user) {
          // Defer async work: awaiting inside this callback can stall or deadlock
          // exchangeCodeForSession during Google OAuth (see supabase-js#1429).
          const userId = s.user.id;
          setTimeout(() => {
            void (async () => {
              try {
                await fetchUserState(userId);
              } catch {
                try { await fetchUserState(userId); } catch { /* give up */ }
              }
            })();
          }, 0);
        } else {
          setIsDevAccount(false);
          setProfileOnboardingCompleted(false);
          setProfileLoaded(false);
          setDevReplayOnboarding(false);
          setCompetitionDate(null);
          setSport(null);
          setDisplayName(null);
          setIsTrackAthlete(false);
          setEntitlementStatus(null);
          setEntitlementExpiresAt(null);
          setDevPremiumBypass(false);
          setSuppressDevPremium(false);
          clearPendingGainDeltas();
          clearLessonCompletedForReferral();
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchUserState]);

  // is_dev accounts are treated as onboarded so they skip onboarding entirely
  // (subscription is likewise bypassed via hasPremiumAccess below). The QA
  // "replay onboarding" overlay still forces them back through the flow.
  const onboardingComplete = useMemo(
    () => (profileOnboardingCompleted || isDevAccount) && !(isDevAccount && devReplayOnboarding),
    [profileOnboardingCompleted, isDevAccount, devReplayOnboarding],
  );

  const statusValid = entitlementStatus === 'trial' || entitlementStatus === 'active';
  const expired = entitlementExpiresAt ? new Date(entitlementExpiresAt) < new Date() : false;

  // ---------------------------------------------------------------------------
  // Stale-row grace: a trial/active row whose expires_at just passed is far more
  // likely an Apple renewal we haven't synced yet than a real lapse (Apple bills
  // at the expiry moment). Instead of bouncing the user to the paywall and
  // healing after, hold access for ONE bounded silent re-verification with
  // Apple. Apple's verdict decides: renewed → fresh expires_at arrives and the
  // user never notices; genuinely lapsed → grace ends and the paywall shows.
  //
  // The grace window must be computed synchronously during render (not in an
  // effect): RouteGuard's redirect effect runs BEFORE any effect here could
  // react, so an effect-based hold would be one frame too late.
  // Never applies to 'expired'/'none' rows, dev QA overrides, or non-iOS.
  // ---------------------------------------------------------------------------
  const [, forceGraceReeval] = useState(0);
  const staleGraceRef = useRef<{ key: string; until: number } | null>(null);
  const staleReverifyKeyRef = useRef<string | null>(null);
  // Two qualifying shapes:
  // 1. trial/active row with a lapsed date (webhook hasn't synced the renewal yet).
  // 2. row already auto-flipped to 'expired' by the server — on foreground, API
  //    calls race the entitlements read, so requireEntitlement often flips the
  //    row before the client ever sees the stale trial/active state. Only
  //    recently-lapsed dates qualify; long-lapsed users paywall immediately.
  const recentlyLapsed =
    expired &&
    !!entitlementExpiresAt &&
    Date.now() - new Date(entitlementExpiresAt).getTime() < RECENT_LAPSE_WINDOW_MS;
  const staleRow =
    Platform.OS === 'ios' &&
    !!session &&
    !isOptimisticGrant &&
    ((statusValid && expired) || (entitlementStatus === 'expired' && recentlyLapsed));
  const graceKey = entitlementExpiresAt ?? '';
  if (staleRow && staleGraceRef.current?.key !== graceKey) {
    // Idempotent render-time init so the first render that sees the lapsed date
    // already holds access.
    staleGraceRef.current = { key: graceKey, until: Date.now() + STALE_ENTITLEMENT_GRACE_MS };
  }
  const staleGraceActive =
    staleRow && staleGraceRef.current?.key === graceKey && Date.now() < staleGraceRef.current.until;

  useEffect(() => {
    if (!staleGraceActive) return;
    // Hard deadline: force a re-render when the window lapses so access can
    // never outlive the grace period if verification hangs (e.g. offline).
    const remaining = Math.max(0, (staleGraceRef.current?.until ?? 0) - Date.now());
    const deadline = setTimeout(() => forceGraceReeval((n) => n + 1), remaining + 50);

    if (staleReverifyKeyRef.current !== graceKey) {
      staleReverifyKeyRef.current = graceKey;
      if (__DEV__) console.log('[stale-grace] holding access, re-verifying with Apple', { graceKey });
      void (async () => {
        let renewed = false;
        try {
          const result = await restorePurchasesViaStoreKit();
          if (__DEV__) console.log('[stale-grace] re-verify result', result);
          if (result.ok) {
            // Pulls the fresh future expires_at; grace ends naturally with no flash.
            await refreshUserState();
            renewed = true;
          }
        } catch (e) {
          if (__DEV__) console.log('[stale-grace] re-verify threw', e);
          // Fall through: end the grace below.
        }
        if (!renewed && staleGraceRef.current?.key === graceKey) {
          staleGraceRef.current = { key: graceKey, until: 0 };
          forceGraceReeval((n) => n + 1); // Apple says not active — show the paywall now.
        }
      })();
    }
    return () => clearTimeout(deadline);
  }, [staleGraceActive, graceKey, refreshUserState]);

  /** QA: Jump to Paywall sets suppressDevPremium — must override DB entitlement for routing. */
  const hasPremiumAccess =
    isDevAccount && suppressDevPremium
      ? false
      : (statusValid && !expired) ||
        staleGraceActive ||
        devPremiumBypass ||
        (isDevAccount && !suppressDevPremium);

  const finishSignInFlow = useCallback(
    async (userId: string): Promise<SignInResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return { ok: false, error: 'Session did not start. Try again or restart the app.' };
      }
      setSession(sessionData.session);
      setApiToken(sessionData.session.access_token);
      setDevReplayOnboarding(false);
      setSuppressDevPremium(false);
      setDevPremiumBypass(false);
      routingFlagsRef.current = {
        devReplayOnboarding: false,
        suppressDevPremium: false,
        devPremiumBypass: false,
      };
      const fetchWithRetries = async () => {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 120 * attempt));
          }
          try {
            return await fetchUserState(userId);
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr instanceof Error
          ? lastErr
          : new Error('Could not load your profile. Try again.');
      };

      const runBackgroundProfileFetch = () => {
        void (async () => {
          for (let a = 0; a < 4; a++) {
            try {
              await fetchUserState(userId);
              return;
            } catch {
              if (a < 3) await new Promise((r) => setTimeout(r, 250 * (a + 1)));
            }
          }
        })();
      };

      let snap: FetchedUserSnapshot;
      try {
        snap = await Promise.race([
          fetchWithRetries(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('POST_SIGNIN_PROFILE_TIMEOUT')), POST_SIGNIN_PROFILE_BUDGET_MS);
          }),
        ]);
      } catch {
        runBackgroundProfileFetch();
        return { ok: true, path: null };
      }
      const path = postSignInPath(snap, routingFlagsRef.current);
      return { ok: true, path };
    },
    [fetchUserState],
  );

  const exchangeOAuthCodeForSignIn = useCallback((code: string): Promise<OAuthExchangeResult> => {
    const existing = oauthCodeExchangeRef.current.get(code);
    if (existing) return existing;

    const exchange = (async () => {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          return { ok: true as const, user: sessionData.session.user };
        }
        return { ok: false as const, error: exchangeError.message };
      }
      if (!data?.user) return { ok: false as const, error: 'Could not sign in with Google.' };
      return { ok: true as const, user: data.user };
    })().finally(() => {
      oauthCodeExchangeRef.current.delete(code);
    });

    oauthCodeExchangeRef.current.set(code, exchange);
    return exchange;
  }, []);

  useEffect(() => {
    const completeOAuthFromUrl = async (url: string | null) => {
      if (!url || !url.includes('auth-callback')) return;
      const { code, error: oauthError } = parseOAuthCallbackUrl(url);
      if (!code || oauthError) return;
      const out = await exchangeOAuthCodeForSignIn(code);
      if (out.ok) {
        await finishSignInFlow(out.user.id);
      }
    };

    // Cold start only: `signInWithGoogle` already completes the exchange via
    // `openAuthSessionWithTimeout`. A global `Linking.addEventListener('url')`
    // here duplicated that work and could run `finishSignInFlow` twice in
    // parallel for the same code (stall / flaky navigation).
    void Linking.getInitialURL().then(completeOAuthFromUrl);
  }, [exchangeOAuthCodeForSignIn, finishSignInFlow]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Could not sign in.' };
    return finishSignInFlow(data.user.id);
  };

  const signInWithGoogle = useCallback(
    async (): Promise<SocialSignInResult> => {
      if (Platform.OS === 'web') {
        return { ok: false, error: 'Google sign-in is not available here.' };
      }
      const redirectTo = getOAuthRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!data.url) {
        return { ok: false, error: 'Could not start Google sign-in.' };
      }
      if (__DEV__) {
        // Expo Go uses exp://…/--/auth-callback, not relentless://. Add the printed
        // URL to Supabase Auth → Redirect URLs or OAuth falls back to Site URL.
        console.log('[auth] Google OAuth redirectTo (must match Supabase allow list):', redirectTo);
      }
      WebBrowser.maybeCompleteAuthSession();
      const result = await openAuthSessionWithTimeout(data.url, redirectTo);
      if (__DEV__) console.log('[auth] openAuthSession result:', result.type, 'url' in result && result.url ? 'has url' : 'no url');
      if (result.type !== 'success' || !('url' in result) || !result.url) {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          // Dev builds can dismiss the browser even when auth completed
          // (the redirect was handled internally before the promise resolved).
          // Wait briefly for onAuthStateChange to establish the session.
          await new Promise((r) => setTimeout(r, 1500));
          const { data: fallbackSession } = await supabase.auth.getSession();
          if (__DEV__) console.log('[auth] dismiss fallback session:', !!fallbackSession.session?.user);
          if (fallbackSession.session?.user) {
            return finishSignInFlow(fallbackSession.session.user.id);
          }
          return { ok: false, cancelled: true };
        }
        return { ok: false, error: 'Sign-in was not completed.' };
      }
      const { code, error: oauthError } = parseOAuthCallbackUrl(result.url);
      if (oauthError) {
        if (oauthError === 'access_denied' || oauthError === 'user_cancelled') {
          return { ok: false, cancelled: true };
        }
        return { ok: false, error: oauthError };
      }
      if (!code) {
        return { ok: false, error: 'No sign-in code returned. Add the OAuth redirect URL in Supabase.' };
      }
      let out: OAuthExchangeResult;
      try {
        out = await Promise.race([
          exchangeOAuthCodeForSignIn(code),
          new Promise<{ ok: false; error: string }>((_, reject) =>
            setTimeout(
              () => reject(new Error('Sign-in took too long. Check your network and try again.')),
              45_000,
            ),
          ),
        ]);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Sign-in with Google failed.' };
      }
      if (!out.ok) return { ok: false, error: out.error };
      // Must await the same post-sign-in profile path as email/Apple. A fallback snapshot always
      // looks "incomplete" and would incorrectly route existing users to welcome.
      return await finishSignInFlow(out.user.id);
    },
    [exchangeOAuthCodeForSignIn, finishSignInFlow],
  );

  const signInWithApple = useCallback(async (): Promise<SocialSignInResult> => {
    if (Platform.OS !== 'ios') {
      return { ok: false, error: 'Sign in with Apple is only available on iOS.' };
    }
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return { ok: false, error: 'Sign in with Apple is not available on this device.' };
    }
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const rawNonce = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        return { ok: false, error: 'Apple did not return an identity token.' };
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!data.user) {
        return { ok: false, error: 'Could not sign in with Apple.' };
      }
      return finishSignInFlow(data.user.id);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'ERR_CANCELED') {
        return { ok: false, cancelled: true };
      }
      const message = e instanceof Error ? e.message : 'Sign in with Apple failed.';
      return { ok: false, error: message };
    }
  }, [finishSignInFlow]);

  const signUp = async (email: string, password: string): Promise<string | null> => {
    // emailRedirectTo routes the confirmation link back into the app (via the
    // auth-redirect HTTPS bridge + the (auth)/confirm screen). When email
    // confirmation is disabled (auto-confirm), Supabase ignores it and returns
    // a session immediately; when enabled, the link opens the app instead of
    // the website. The value must be on Supabase Auth → Redirect URLs.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getEmailConfirmRedirectUrl() },
    });
    if (error) return error.message;
    // With auto-confirm, the session is available immediately. Set it so
    // post-signup code (e.g. purchase sync) doesn't have to wait for
    // onAuthStateChange to fire.
    if (data.session) {
      setSession(data.session);
      setApiToken(data.session.access_token);
    }
    return null;
  };

  const signOut = async () => {
    await clearOnboardingProgress();
    optimisticGrantActiveRef.current = false;
    setIsOptimisticGrant(false);
    setIsDevAccount(false);
    setProfileOnboardingCompleted(false);
    setProfileLoaded(false);
    setDevReplayOnboarding(false);
    setDevPremiumBypass(false);
    setSuppressDevPremium(false);
    setSport(null);
    setIsTrackAthlete(false);
    bustCache();
    clearPendingGainDeltas();
    clearLessonCompletedForReferral();
    // Local-scope sign out clears persisted session synchronously and fires
    // onAuthStateChange immediately. The default scope ('global') waits on a
    // network round-trip to revoke the refresh token, which is the lag the
    // user feels in Profile → Sign Out. Server-side token expiry is fine for
    // our security model (everything is gated by Supabase RLS on user_id).
    await supabase.auth.signOut({ scope: 'local' });
  };

  const completeOnboarding = useCallback(async (options?: { requireUser?: boolean; userId?: string | null }) => {
    const requireUser = options?.requireUser === true;
    const userId = await getClientUserId(options?.userId);
    if (!userId) {
      if (requireUser) {
        throw new Error('Not signed in.');
      }
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) {
      throw new Error(
        'No profile row for this user yet. Reload the app, or finish the signup flow that creates your profile.',
      );
    }
    setProfileOnboardingCompleted(true);
    setDevReplayOnboarding(false);
  }, []);

  const completeOnboardingDevBypass = useCallback(async () => {
    if (!__DEV__ && !isDevAccount) return;
    setSuppressDevPremium(false);
    setDevPremiumBypass(true);
    try {
      try { await supabase.rpc('dev_grant_trial'); } catch { /* RPC may not be deployed */ }
      await completeOnboarding({ requireUser: true });
    } catch (e) {
      setDevPremiumBypass(false);
      const msg = e instanceof Error ? e.message : 'Could not finish onboarding.';
      Alert.alert(
        'Could not continue',
        __DEV__ || isDevAccount
          ? `${msg}\n\nCheck Supabase profile update (onboarding_completed) and network.`
          : msg,
      );
      throw e;
    }
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
    optimisticGrantActiveRef.current = true;
    setSuppressDevPremium(false);
    setIsOptimisticGrant(true);
    setEntitlementStatus('active');
    setEntitlementExpiresAt(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
  }, []);

  const updateCompetitionDate = useCallback(async (date: string | null): Promise<string | null> => {
    // Use getSession() — React `session` is often still null right after signUp().
    const { data: { session: active } } = await supabase.auth.getSession();
    const userId = active?.user?.id;
    if (!userId) return 'Not authenticated';
    const { data, error } = await supabase
      .from('profiles')
      .update({ competition_date: date })
      .eq('id', userId)
      .select('competition_date');
    if (error) return error.message;
    if (!data?.length) return 'Could not save competition date';
    setCompetitionDate(data[0]?.competition_date ?? date);
    return null;
  }, []);

  const updateSport = useCallback(async (sportValue: string | null): Promise<string | null> => {
    const { data: { session: active } } = await supabase.auth.getSession();
    const userId = active?.user?.id;
    if (!userId) return 'Not authenticated';
    const trimmed = sportValue?.trim() ? sportValue.trim().slice(0, 80) : null;
    const { data, error } = await supabase
      .from('profiles')
      .update({ sport: trimmed })
      .eq('id', userId)
      .select('sport');
    if (error) return error.message;
    if (!data?.length) return 'Could not save sport';
    setSport(data[0]?.sport ?? trimmed);
    return null;
  }, []);

  const updateDisplayName = useCallback(async (raw: string | null): Promise<string | null> => {
    const { data: { session: active } } = await supabase.auth.getSession();
    const userId = active?.user?.id;
    if (!userId) return 'Not authenticated';
    const trimmed = raw?.trim() ? raw.trim().slice(0, MAX_PROFILE_DISPLAY_NAME_LEN) : null;
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', userId)
      .select('display_name');
    if (error) return error.message;
    if (!data?.length) return 'Could not save name';
    const saved = (data[0] as { display_name?: string | null })?.display_name?.trim() || null;
    setDisplayName(saved);
    return null;
  }, []);

  const updateIsTrackAthlete = useCallback(async (value: boolean): Promise<string | null> => {
    const { data: { session: active } } = await supabase.auth.getSession();
    const userId = active?.user?.id;
    if (!userId) return 'Not authenticated';
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_track_athlete: value })
      .eq('id', userId)
      .select('is_track_athlete');
    if (error) return error.message;
    if (!data?.length) return 'Could not save preference';
    setIsTrackAthlete(data[0]?.is_track_athlete === true);
    return null;
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      isDevAccount,
      onboardingComplete,
      profileLoaded,
      competitionDate,
      sport,
      displayName,
      isTrackAthlete,
      entitlementStatus,
      hasPremiumAccess,
      isOptimisticGrant,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signUp,
      signOut,
      completeOnboarding,
      completeOnboardingDevBypass,
      revokePremiumForTesting,
      resetOnboarding,
      refreshUserState,
      updateCompetitionDate,
      updateSport,
      updateDisplayName,
      updateIsTrackAthlete,
      optimisticGrantAccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
