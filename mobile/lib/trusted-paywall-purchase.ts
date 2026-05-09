export type TrustedPaywallPurchase = {
  originalTransactionId?: string;
  /** Apple-signed JWS from StoreKit — lets the server verify without calling Apple's REST API. */
  signedTransactionInfo?: string;
};

type TrustedPaywallPurchaseListener = (purchase: TrustedPaywallPurchase) => void;

const listeners = new Set<TrustedPaywallPurchaseListener>();
let lastTrustedPaywallPurchase: TrustedPaywallPurchase | null = null;

export function emitTrustedPaywallPurchase(purchase: TrustedPaywallPurchase = {}) {
  lastTrustedPaywallPurchase = purchase;
  listeners.forEach((listener) => {
    try {
      listener(purchase);
    } catch {
      // Purchase navigation must not crash because of a listener.
    }
  });
}

export function subscribeTrustedPaywallPurchase(listener: TrustedPaywallPurchaseListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLastTrustedPaywallPurchase(): TrustedPaywallPurchase | null {
  return lastTrustedPaywallPurchase;
}
