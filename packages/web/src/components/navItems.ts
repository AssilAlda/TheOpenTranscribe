import type { ComponentType } from "react";

import { ProviderIcon, TranscribedFilesIcon, TranscribeIcon } from "./navIcons";

export interface NavItem {
  href: string;
  label: string;
  /** Optional `size` override, in px -- lets MobileTabBar render these one step larger than Sidebar's default without a separate icon set. */
  Icon: ComponentType<{ size?: number }>;
}

/** The exactly-three primary destinations. Discuss in an issue before adding items. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Upload files", Icon: TranscribeIcon },
  { href: "/files", label: "Transcribed files", Icon: TranscribedFilesIcon },
  { href: "/provider", label: "Provider", Icon: ProviderIcon },
];

/** A job detail page (/jobs/[jobId]) is conceptually part of Transcribed Files. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/files") return pathname === "/files" || pathname.startsWith("/jobs/");
  return pathname === href;
}

/**
 * The single source of truth for a page's shared header title (PageLayout's
 * `title` prop): the exact label of its own NAV_ITEMS entry, so the header
 * and the active sidebar/mobile-nav label can never drift out of sync by
 * duplicating the string in each page file. Each of the three primary
 * pages calls this with its own literal href instead of hardcoding a title.
 */
export function navLabelForHref(href: string): string {
  const item = NAV_ITEMS.find((navItem) => navItem.href === href);
  if (!item) {
    throw new Error(`navLabelForHref: no NAV_ITEMS entry for "${href}"`);
  }
  return item.label;
}
