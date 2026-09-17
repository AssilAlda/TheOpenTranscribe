import { navLabelForHref } from "@/components/navItems";
import { PageLayout } from "@/components/PageLayout";
import { ProviderSettings } from "@/components/ProviderSettings";

import styles from "./page.module.css";

export default function ProviderPage() {
  return (
    <PageLayout title={navLabelForHref("/provider")}>
      <div className={styles.container}>
        <p className={styles.subtitle}>Configure the transcription provider TheOpenTranscribe uses.</p>

        <ProviderSettings />
      </div>
    </PageLayout>
  );
}
