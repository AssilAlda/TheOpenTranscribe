"use client";

import { useState } from "react";

import { useProviderStatus } from "@/hooks/useProviderStatus";

import { OpenAICredentialModal, type CredentialModalMode } from "./OpenAICredentialModal";
import styles from "./ProviderSettings.module.css";

/**
 * The "Providers" section's OpenAI API card is fully functional --
 * Configure/Replace open a dedicated native <dialog> (OpenAICredentialModal),
 * Remove is an inline explicit confirmation, and every displayed state comes
 * directly from GET /api/provider/openai's safe status DTO (never invented
 * client-side).
 *
 * "Connected accounts" is presentation-only: connected-account/OAuth
 * transcription authorization is not officially supportable with OpenAI today
 * -- this is the intentionally-inert `openai_codex` /CONNECTED_ACCOUNT
 * extension seam, not unfinished work.
 */

type ConnectedAccountStatus = "connected" | "not_connected" | "unavailable";

const CONNECTED_ACCOUNT_STATUS_LABEL: Record<ConnectedAccountStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  unavailable: "Not available yet",
};

function StatusBadge({ label, tone }: { label: string; tone: "neutral" | "info" | "success" | "danger" }) {
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

function OpenAIApiCard() {
  const { status, loading, error, refresh } = useProviderStatus();
  const [modalMode, setModalMode] = useState<CredentialModalMode | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const envVar = "OPENAI_API_KEY";

  let badgeLabel = "Loading…";
  let badgeTone: "neutral" | "info" | "success" | "danger" = "neutral";
  let bodyText: React.ReactNode = "Checking current configuration…";
  let primaryAction: React.ReactNode = null;

  if (error) {
    badgeLabel = "Status unavailable";
    badgeTone = "danger";
    bodyText = error;
  } else if (status) {
    if (status.source === "environment") {
      badgeLabel = "Environment configured";
      badgeTone = "info";
      bodyText = (
        <>
          Set via <code className={styles.code}>{envVar}</code> in the server environment. This value is
          externally managed and can&rsquo;t be changed from this page.
        </>
      );
      primaryAction = (
        <button type="button" className={styles.actionButton} disabled title="Environment-managed -- locked">
          Configured
        </button>
      );
    } else if (status.source === "managed" && status.configured) {
      badgeLabel = "Configured";
      badgeTone = "success";
      bodyText = "A managed API key is saved on this server.";
      primaryAction = confirmingRemove ? (
        <div className={styles.confirmRow}>
          <span className={styles.confirmText}>Remove the saved key?</span>
          <button
            type="button"
            className={styles.confirmButton}
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              setRemoveError(null);
              try {
                const res = await fetch("/api/provider/openai", { method: "DELETE" });
                if (!res.ok) {
                  setRemoveError("Couldn't remove the saved key. Please try again.");
                } else {
                  await refresh();
                }
              } catch {
                setRemoveError("Couldn't reach TheOpenTranscribe to remove the key.");
              } finally {
                setRemoving(false);
                setConfirmingRemove(false);
              }
            }}
          >
            {removing ? "Removing…" : "Confirm"}
          </button>
          <button
            type="button"
            className={styles.cancelSmallButton}
            disabled={removing}
            onClick={() => setConfirmingRemove(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.actionRow}>
          <button type="button" className={styles.actionButton} onClick={() => setModalMode("replace")}>
            Replace
          </button>
          <button
            type="button"
            className={styles.actionButtonSecondary}
            onClick={() => setConfirmingRemove(true)}
          >
            Remove
          </button>
        </div>
      );
    } else if (status.configError) {
      // Blockers B2/B4: driven by the safe `configError` sibling field, not
      // by a fourth `source` value -- this status is still `source:
      // "unconfigured"`, so this branch must be checked before the final
      // plain-unconfigured `else` below.
      badgeLabel = "Configuration error";
      badgeTone = "danger";
      bodyText = "The saved configuration couldn't be read. Configuring a new key will replace it.";
      primaryAction = (
        <button type="button" className={styles.actionButton} onClick={() => setModalMode("configure")}>
          Configure
        </button>
      );
    } else {
      badgeLabel = "Not configured";
      badgeTone = "neutral";
      bodyText = (
        <>
          Set <code className={styles.code}>{envVar}</code> in the server environment, or configure a
          managed key below.
        </>
      );
      primaryAction = (
        <button type="button" className={styles.actionButton} onClick={() => setModalMode("configure")}>
          Configure
        </button>
      );
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIdentity}>OpenAI API</span>
        <StatusBadge label={badgeLabel} tone={badgeTone} />
      </div>
      <p className={styles.cardMethod}>Credential method: API key</p>
      <p className={styles.cardBody}>{bodyText}</p>
      {removeError && <p className={styles.inlineError}>{removeError}</p>}
      <div className={styles.cardAction}>{loading && !status ? null : primaryAction}</div>

      <OpenAICredentialModal
        mode={modalMode}
        onClose={() => setModalMode(null)}
        onSettled={() => {
          void refresh();
        }}
      />
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
          <OpenAIApiCard />
        </div>
      </section>
    </div>
  );
}
