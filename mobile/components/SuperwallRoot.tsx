import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { SUPERWALL_ENABLED } from '@/lib/superwall-config';

const SuperwallInner = SUPERWALL_ENABLED
  ? (require('./SuperwallInner').default as React.ComponentType<{ children: ReactNode }>)
  : null;

class SuperwallErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[Superwall] crashed, falling through:', error?.message);
  }

  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

export function SuperwallRoot({ children }: { children: ReactNode }) {
  if (!SUPERWALL_ENABLED || !SuperwallInner) {
    return <>{children}</>;
  }
  return (
    <SuperwallErrorBoundary fallback={children}>
      <SuperwallInner>{children}</SuperwallInner>
    </SuperwallErrorBoundary>
  );
}
