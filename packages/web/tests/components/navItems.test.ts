import { describe, expect, it } from "vitest";

import { NAV_ITEMS, navLabelForHref } from "@/components/navItems";

describe("navLabelForHref", () => {
  it("returns each primary page's exact NAV_ITEMS label -- the single source of truth the page headers read from", () => {
    expect(navLabelForHref("/")).toBe("Upload files");
    expect(navLabelForHref("/files")).toBe("Transcribed files");
    expect(navLabelForHref("/provider")).toBe("Provider");
  });

  it("stays in sync with NAV_ITEMS automatically -- it reads the array rather than duplicating labels", () => {
    for (const item of NAV_ITEMS) {
      expect(navLabelForHref(item.href)).toBe(item.label);
    }
  });

  it("throws for an href with no NAV_ITEMS entry, instead of silently returning an empty/undefined title", () => {
    expect(() => navLabelForHref("/nonexistent")).toThrow(/no NAV_ITEMS entry/);
  });
});
