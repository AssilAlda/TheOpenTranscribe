"use client";

import styles from "./ProviderSettings.module.css";

/**
 * Phase 6: presentation only, for both sections. No fetch/POST of any kind
 * is wired to this component, no credential is ever accepted or stored.
 *
 * Two authentication *methods* are represented -- connected account/
 * subscription vs. direct API key -- because TheOpenTranscribe's provider
 * layer is not inherently API-key-only: a provider may eventually support
 * either method (or local execution) where it actually makes sense for
 * that provider's transcription workflow. Phase 6 only shows what's
 * actually true today: neither method is functional yet. Secure credential
 * persistence and connected-account authentication are a separate,
 * not-yet-approved Phase 7 decision (see docs/ARCHITECTURE.md).
 */

type ConnectedAccountStatus = "connected" | "not_connected" | "unavailable";
type ApiKeyProviderStatus = "configured" | "missing_key" | "environment_configured" | "unavailable";

const CONNECTED_ACCOUNT_STATUS_LABEL: Record<ConnectedAccountStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  unavailable: "Not available yet",
};

const API_KEY_STATUS_LABEL: Record<ApiKeyProviderStatus, string> = {
  configured: "Configured",
  missing_key: "Missing key",
  environment_configured: "Environment configuration required",
  unavailable: "Not available yet",
};

function StatusBadge({ label, tone }: { label: string; tone: "neutral" | "info" }) {
  return <span className={`${styles.statusBadge} ${styles[tone] ?? ""}`}>{label}</span>;
}

function ConnectedAccountCard({
  name,
  methodContext,
  status,
}: {
  name: string;
  methodContext: string;
  status: ConnectedAccountStatus;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIdentity}>{name}</span>
        <StatusBadge label={CONNECTED_ACCOUNT_STATUS_LABEL[status]} tone="neutral" />
      </div>
      <p className={styles.cardMethod}>{methodContext}</p>
      <p className={styles.cardBody}>
        Connected-account sign-in isn&rsquo;t available yet in this version.
      </p>
      <div className={styles.cardAction}>
        <button type="button" className={styles.actionButton} disabled>
          Connect
        </button>
      </div>
    </div>
  );
}

function ApiKeyProviderCard({
  name,
  envVar,
  status,
}: {
  name: string;
  envVar: string;
  status: ApiKeyProviderStatus;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIdentity}>{name}</span>
        <StatusBadge label={API_KEY_STATUS_LABEL[status]} tone="info" />
      </div>
      <p className={styles.cardMethod}>Credential method: API key</p>
      <p className={styles.cardBody}>
        Set <code className={styles.code}>{envVar}</code> in the server environment running
        TheOpenTranscribe. In-app credential storage isn&rsquo;t enabled yet in this version.
      </p>
      <div className={styles.cardAction}>
        <button type="button" className={styles.actionButton} disabled>
          Configure
        </button>
      </div>
    </div>
  );
}

export function ProviderSettings() {
  return (
    <div className={styles.page}>
      <section className={styles.section} aria-labelledby="connected-accounts-heading">
        <div className={styles.sectionHeader}>
          <h2 id="connected-accounts-heading" className={styles.sectionTitle}>
            Connected accounts
          </h2>
          <p className={styles.sectionSubtitle}>
            Sign in with an eligible provider subscription or account, when a provider supports it.
          </p>
        </div>

        <div className={styles.cardGrid}>
          <ConnectedAccountCard name="ChatGPT" methodContext="OpenAI account sign-in" status="unavailable" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="providers-heading">
        <div className={styles.sectionHeader}>
          <h2 id="providers-heading" className={styles.sectionTitle}>
            Providers
          </h2>
          <p className={styles.sectionSubtitle}>
            Configure a provider directly with your own API key.
          </p>
        </div>

        <div className={styles.cardGrid}>
          <ApiKeyProviderCard name="OpenAI API" envVar="OPENAI_API_KEY" status="environment_configured" />
        </div>
      </section>
    </div>
  );
}
