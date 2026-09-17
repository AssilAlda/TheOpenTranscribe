"use client";

import { useRef } from "react";

import { JobDetailModal } from "@/components/JobDetailModal";
import { navLabelForHref } from "@/components/navItems";
import { PageLayout } from "@/components/PageLayout";
import { TranscribedFilesList } from "@/components/TranscribedFilesList";
import { useJobDetailModal } from "@/hooks/useJobDetailModal";

import styles from "./page.module.css";

export default function TranscribedFilesPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { openJobId, open, close } = useJobDetailModal(headingRef);

  return (
    <>
      <PageLayout title={navLabelForHref("/files")} headingId="files-heading" ref={headingRef}>
        <p className={styles.subtitle}>Every transcription you&rsquo;ve started, newest first.</p>

        <TranscribedFilesList onOpenJob={open} headingId="files-heading" />
      </PageLayout>

      <JobDetailModal jobId={openJobId} onClose={close} />
    </>
  );
}
