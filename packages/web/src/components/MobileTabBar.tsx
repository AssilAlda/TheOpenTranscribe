"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, NAV_ITEMS } from "./navItems";
import styles from "./MobileTabBar.module.css";

// One step up from Sidebar's 22px default -- icon and label text (see
// .tab's font-size in MobileTabBar.module.css) both grow together here on
// mobile, where the whole nav is more thumb/glance-driven than Sidebar's.
const MOBILE_TAB_ICON_SIZE = 24;

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabBar} aria-label="Primary">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = isNavItemActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={MOBILE_TAB_ICON_SIZE} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
