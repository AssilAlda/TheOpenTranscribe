"use client";

import { Brand } from "./Brand";
import { MobileTabBar } from "./MobileTabBar";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.mainArea}>
        <div className={styles.mobileTopBar}>
          <Brand size="compact" />
        </div>

        <main className={styles.canvas}>{children}</main>
      </div>

      <MobileTabBar />
    </div>
  );
}
