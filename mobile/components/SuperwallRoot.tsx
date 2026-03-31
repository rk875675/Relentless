import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { SUPERWALL_IOS_API_KEY, SUPERWALL_ENABLED } from '@/lib/superwall-config';
import { useAuth } from '@/lib/auth-context';
import { syncSubscriptionWithBackend } from '@/lib/purchases-sync';

function extractOriginalTransactionId(params: Record<string, unknown>): string | undefined {
  const tx = params.transaction as Record<string, unknown> | undefined;
  if (!tx) return undefined;
  const id =
    tx.originalTransactionIdentifier ?? tx.originalTransactionId ?? tx.original_transaction_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function SuperwallIdentitySync() {
  const { session } = useAuth();
  const { useUser } = require('expo-superwall');
  const { identify, signOut: superwallSignOut } = useUser();

  useEffect(() => {
    if (session?.user?.id) {
      identify(session.user.id, { restorePaywallAssignments: true }).catch(() => {});
    } else {
      superwallSignOut().catch(() => {});
    }
  }, [session?.user?.id, identify, superwallSignOut]);

  return null;
}

function SuperwallPurchaseSync() {
  const { refreshUserState } = useAuth();
  const { useSuperwallEvents } = require('expo-superwall');

  useSuperwallEvents({
    onSuperwallEvent: (eventInfo: any) => {
      const ev = eventInfo.event as unknown as Record<string, unknown> | undefined;
      const params = (eventInfo.params ?? {}) as Record<string, unknown>;
      const name = typeof ev?.event === 'string' ? ev.event : '';
      const merged: Record<string, unknown> = { ...params, ...ev };

      if (name === 'transactionComplete' || name === 'transactionRestore') {
        const oid = extractOriginalTransactionId(merged);
        if (oid) {
          syncSubscriptionWithBackend(oid).finally(() => {
            refreshUserState().catch(() => {});
          });
        }
      }
    },
    onSubscriptionStatusChange: (status: any) => {
      if (status.status === 'ACTIVE') {
        refreshUserState().catch(() => {});
      }
    },
  });

  return null;
}

function SuperwallInner({ children }: { children: ReactNode }) {
  const { SuperwallProvider } = require('expo-superwall');

  return (
    <SuperwallProvider
      apiKeys={{ ios: SUPERWALL_IOS_API_KEY, android: SUPERWALL_IOS_API_KEY }}
      onConfigurationError={(err: Error) => {
        console.warn('[Superwall] configuration error', err?.message);
      }}
    >
      <SuperwallIdentitySync />
      <SuperwallPurchaseSync />
      {children}
    </SuperwallProvider>
  );
}

export function SuperwallRoot({ children }: { children: ReactNode }) {
  if (!SUPERWALL_ENABLED) {
    return <>{children}</>;
  }
  return <SuperwallInner>{children}</SuperwallInner>;
}
