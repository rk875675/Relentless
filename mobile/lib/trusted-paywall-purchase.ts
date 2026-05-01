type TrustedPaywallPurchaseListener = () => void;

const listeners = new Set<TrustedPaywallPurchaseListener>();

export function emitTrustedPaywallPurchase() {
  listeners.forEach((listener) => {
    try {
      listener();
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
