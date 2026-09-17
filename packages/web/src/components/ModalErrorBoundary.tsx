"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Defensive guard around the modal body: if JobStatusDetail (or anything it
 * renders) throws during render, this surfaces a visible, honest error
 * inside the modal instead of leaving a silently blank body -- error
 * boundaries are the only way to catch a render-time exception in a
 * specific subtree without a hook-based equivalent. Resets automatically
 * when a different job is opened (see `key` usage at the call site).
 */
export class ModalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: "1.5rem", color: "var(--color-danger)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong showing this job.</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
            Try closing and reopening it.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
