import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { SUPERWALL_ENABLED, SUPERWALL_IOS_API_KEY } from '@/lib/superwall-config';
import { useAuth } from '@/lib/auth-context';
import { syncSubscriptionWithBackend } from '@/lib/purchases-sync';

let SuperwallProvider: any = ({ children }: { children: ReactNode }) => <>{children}</>;
let useSuperwallEvents: any = () => {};
let useUser: any = () => ({ identify: async () => {}, signOut: async () => {} });
let useSuperwall: any = () => ({ isConfigured: false });

if (SUPERWALL_ENABLED) {
  try {
    console.log('[Superwall] Loading expo-superwall module...');
    const sw = require('expo-superwall');
    SuperwallProvider = sw.SuperwallProvider;
    useSuperwallEvents = sw.useSuperwallEvents;
    useUser = sw.useUser;
    useSuperwall = sw.useSuperwall;
    console.log('[Superwall] Module loaded OK');
  } catch (e: any) {
    console.warn('[Superwall] Failed to load module:', e?.message);
  }
}

function extractOriginalTransactionId(params: Record<string, unknown>): string | undefined {
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const tx = params.transaction as Record<string, unknown> | undefined;
  if (tx) {
    const id = str(tx.originalTransactionIdentifier ?? tx.originalTransactionId ?? tx.original_transaction_id);
    if (id) return id;
  }
  const rt = params.restoreType as Record<string, unknown> | undefined;
  if (rt) {
    const stx = rt.storeTransaction as Record<string, unknown> | undefined;
    if (stx) {
      const id = str(stx.originalTransactionIdentifier ?? stx.originalTransactionId ?? stx.original_transaction_id);
      if (id) return id;
    }
  }
  return undefined;
}

function SuperwallIdentitySync() {
  const { session } = useAuth();
  const { identify, signOut: superwallSignOut } = useUser();
  const { isConfigured } = useSuperwall((s: any) => ({ isConfigured: s.isConfigured }));

  useEffect(() => {
    if (!isConfigured) return;
    if (session?.user?.id) {
      identify(session.user.id, { restorePaywallAssignments: true }).catch(() => {});
    } else {
      superwallSignOut().catch(() => {});
    }
  }, [session?.user?.id, identify, superwallSignOut, isConfigured]);
  return null;
}

function SuperwallPurchaseSync() {
  const { refreshUserState } = useAuth();
  useSuperwallEvents({
    onSuperwallEvent: (eventInfo: { event?: unknown; params?: Record<string, unknown> }) => {
      const ev = eventInfo.event as unknown as Record<string, unknown> | undefined;
      const params = (eventInfo.params ?? {}) as Record<string, unknown>;
      const name = typeof ev?.event === 'string' ? ev.event : '';
      const merged: Record<string, unknown> = { ...params, ...ev };
      if (name === 'transactionComplete' || name === 'transactionRestore') {
        const oid = extractOriginalTransactionId(merged);
        if (oid) {
          syncSubscriptionWithBackend(oid).finally(() => { refreshUserState().catch(() => {}); });
        } else {
          refreshUserState().catch(() => {});
        }
      }
    },
    onSubscriptionStatusChange: (status: { status?: string }) => {
      if (status.status === 'ACTIVE') { refreshUserState().catch(() => {}); }
    },
  });
  return null;
}

export default function SuperwallInner({ children }: { children: ReactNode }) {
  console.log('[Superwall] SuperwallInner rendering...');
  return (
    <SuperwallProvider
      apiKeys={{ ios: SUPERWALL_IOS_API_KEY }}
      onConfigurationError={(err: Error) => { console.warn('[Superwall] configuration error', err?.message); }}
    >
      <SuperwallIdentitySync />
      <SuperwallPurchaseSync />
      {children}
    </SuperwallProvider>
  );
}
