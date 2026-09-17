"use client";

import { useState } from "react";

import { navLabelForHref } from "@/components/navItems";
import { PageLayout } from "@/components/PageLayout";
import { TranscriptionDetailsRail } from "@/components/TranscriptionDetailsRail";
import { UploadPanel } from "@/components/UploadPanel";
import { WhatHappensNext } from "@/components/WhatHappensNext";

import styles from "./page.module.css";

export default function TranscribePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [justCreated, setJustCreated] = useState(false);

  return (
    <PageLayout title={navLabelForHref("/")}>
      <div className={styles.layout}>
        <div className={styles.grid}>
          <header className={styles.header}>
            <h2 className={styles.title}>Transcribe audio and video</h2>
            <p className={styles.subtitle}>
              Upload your media and follow the transcription from queue to finished document.
            </p>
          </header>

          <div className={styles.container}>
            <UploadPanel
              onUploaded={() => setJustCreated(true)}
              onFileSelect={(file) => {
                setSelectedFile(file);
                if (!file) setJustCreated(false);
              }}
              onLanguageChange={setLanguage}
            />
          </div>

          <div className={styles.railColumn}>
            <TranscriptionDetailsRail file={selectedFile} language={language} justCreated={justCreated} />
            <WhatHappensNext />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
