import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { SUPERWALL_ENABLED, SUPERWALL_IOS_API_KEY } from '@/lib/superwall-config';
import { useAuth } from '@/lib/auth-context';
import { syncSubscriptionWithBackend } from '@/lib/purchases-sync';
import { emitTrustedPaywallPurchase } from '@/lib/trusted-paywall-purchase';

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
  const { refreshUserState, optimisticGrantAccess } = useAuth();
  const transactionInFlight = useRef(false);
  const sawAppCloseDuringTransaction = useRef(false);

  useSuperwallEvents({
    onSuperwallEvent: (eventInfo: { event?: unknown; params?: Record<string, unknown> }) => {
      const ev = eventInfo.event as unknown as Record<string, unknown> | undefined;
      const params = (eventInfo.params ?? {}) as Record<string, unknown>;
      const name = typeof ev?.event === 'string' ? ev.event : '';
      const merged: Record<string, unknown> = { ...params, ...ev };
      if (__DEV__) {
        // Diagnostic for paywall reliability (e.g. annual button skipping the Apple sheet,
        // or Continue tap silently being rejected after sign-out reset).
        // Strip transaction blob to keep the log readable; keep product id and event name.
        const productId =
          (merged.productId as string | undefined) ??
          ((merged.transaction as Record<string, unknown> | undefined)?.productIdentifier as
            | string
            | undefined) ??
          ((merged.product as Record<string, unknown> | undefined)?.productIdentifier as
            | string
            | undefined);

        // For paywallPresentationRequest, the `status` and `reason` fields tell us
        // exactly WHY a request did or didn't show a paywall (e.g. userIsSubscribed,
        // noConfig, paywallAlreadyPresented, noRuleMatch). Surface them.
        const statusType =
          (merged.status as { status?: string; type?: string } | undefined)?.status ??
          (merged.status as { type?: string } | undefined)?.type ??
          undefined;
        const reasonType =
          (merged.reason as { reason?: string; type?: string } | undefined)?.reason ??
          (merged.reason as { type?: string } | undefined)?.type ??
          undefined;

        console.log('[Superwall][event]', name || '(unnamed)', {
          productId: productId ?? null,
          hasTransaction: Boolean(merged.transaction),
          hasRestoreType: Boolean(merged.restoreType),
          ...(statusType ? { status: statusType } : {}),
          ...(reasonType ? { reason: reasonType } : {}),
        });
      }
      if (name === 'transactionStart') {
        transactionInFlight.current = true;
        sawAppCloseDuringTransaction.current = false;
      }
      if (name === 'appClose' && transactionInFlight.current) {
        sawAppCloseDuringTransaction.current = true;
      }
      if (name === 'paywallClose') {
        transactionInFlight.current = false;
        sawAppCloseDuringTransaction.current = false;
      }

      if (name === 'transactionComplete' || name === 'transactionRestore') {
        // Annual purchases were observed firing `transactionComplete` WITHOUT
        // a following `onSubscriptionStatusChange ACTIVE` event, so without an
        // optimistic grant here the user is dumped back to the paywall after
        // the sheet closes. Granting on the purchase event itself makes both
        // products (monthly + annual) route forward consistently.
        //
        // Safety: only treat it as a real purchase if StoreKit actually showed
        // the Apple sheet. In logs, the real sheet sends the app inactive
        // (`appClose`) between transactionStart and transactionComplete. Sticky
        // sandbox subscriptions can emit transactionComplete without that; do
        // not grant locally for those, or both products skip payment.
        const trustedAppleSheetPurchase = sawAppCloseDuringTransaction.current;
        if (trustedAppleSheetPurchase) {
          optimisticGrantAccess();
          emitTrustedPaywallPurchase();
        } else if (__DEV__) {
          console.log('[Superwall][purchaseIgnored]', name, 'without Apple sheet');
        }
        const oid = extractOriginalTransactionId(merged);
        if (trustedAppleSheetPurchase && oid) {
          syncSubscriptionWithBackend(oid).finally(() => { refreshUserState().catch(() => {}); });
        } else if (trustedAppleSheetPurchase) {
          refreshUserState().catch(() => {});
        }
        transactionInFlight.current = false;
        sawAppCloseDuringTransaction.current = false;
      }
    },
    onSubscriptionStatusChange: (status: { status?: string }) => {
      if (__DEV__) {
        console.log('[Superwall][subscriptionStatus]', status?.status ?? '(no status)');
      }
      if (status.status === 'ACTIVE') {
        const trustedAppleSheetPurchase = transactionInFlight.current && sawAppCloseDuringTransaction.current;
        if (trustedAppleSheetPurchase) {
          optimisticGrantAccess();
          emitTrustedPaywallPurchase();
          refreshUserState().catch(() => {});
        } else if (__DEV__) {
          console.log('[Superwall][activeIgnored]', 'without Apple sheet');
        }
      }
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
