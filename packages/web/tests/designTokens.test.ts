import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Static source inspection, not a screenshot -- the canonical accent value
// and the dark-foreground pairing are both plain custom-property
// declarations in one file, so a string check is enough evidence without
// brittle pixel/visual testing.
const globalsCss = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
const sidebarCss = readFileSync(
  fileURLToPath(new URL("../src/components/Sidebar.module.css", import.meta.url)),
  "utf8",
);
const mobileTabBarCss = readFileSync(
  fileURLToPath(new URL("../src/components/MobileTabBar.module.css", import.meta.url)),
  "utf8",
);
const appShellCss = readFileSync(
  fileURLToPath(new URL("../src/components/AppShell.module.css", import.meta.url)),
  "utf8",
);

// WCAG 2.1 relative-luminance / contrast-ratio helpers, used to verify the
// accent family's actual contrast pairs rather than just pinning hex
// literals -- catches a future retune that keeps the "right" tokens present
// but quietly breaks a contrast pair.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

function hueDegrees(hex: string): number {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const DARK_TEXT = "#1a1815";
const WHITE = "#ffffff";
const CREAM_BG = "#f6f4ef";
const DANGER = "#b23a1f";

/**
 * Resolves a `--token` to its hex value, following one level of
 * `var(--other-token)` indirection if the declaration is an alias rather
 * than a literal (e.g. --color-brand-mark: var(--color-accent-vivid)).
 */
function resolveTokenHex(css: string, token: string): string | undefined {
  const declMatch = css.match(new RegExp(`${token}:\\s*([^;]+);`, "i"));
  const value = declMatch?.[1]?.trim();
  if (!value) return undefined;
  const literalMatch = value.match(/^#[0-9a-f]{6}$/i);
  if (literalMatch) return literalMatch[0];
  const aliasMatch = value.match(/^var\((--[\w-]+)\)$/i);
  if (aliasMatch) {
    const aliasHexMatch = css.match(new RegExp(`${aliasMatch[1]}:\\s*(#[0-9a-f]{6});`, "i"));
    return aliasHexMatch?.[1];
  }
  return undefined;
}

describe("design tokens (app/globals.css)", () => {
  it("resolves the canonical interactive accent to the owner-fixed experimental pink #FA78AE, not any prior palette", () => {
    expect(globalsCss).toMatch(/--color-accent:\s*#fa78ae;/i);
    expect(globalsCss).not.toMatch(/--color-accent:\s*#f37616;/i);
    expect(globalsCss).not.toMatch(/--color-accent:\s*#e58a2e;/i);
    expect(globalsCss).not.toMatch(/--color-accent:\s*#74b356;/i);
    expect(globalsCss).not.toMatch(/--color-accent:\s*#c1f11c;/i);
  });

  it("pairs the accent with a dark foreground (the existing --color-text token), not a literal white", () => {
    // A real, checked contrast decision, not a stylistic default: the
    // fixed pink base's own contrast against white is only 2.51:1 (fails
    // AA outright), so dark text is the only foreground that passes --
    // and the base itself was never darkened to try to make white work.
    expect(globalsCss).toMatch(/--color-accent-contrast:\s*var\(--color-text\);/);
    expect(globalsCss).not.toMatch(/--color-accent-contrast:\s*#fff/i);
  });

  it("keeps a strong/legible deep-pink accent variant for text, borders, and icons placed directly on light surfaces", () => {
    // Not the same value as the fill token -- a fill-strength color fails
    // contrast as a foreground color on this app's light backgrounds.
    expect(globalsCss).toMatch(/--color-accent-strong:\s*#9a134b;/i);
  });

  it("keeps the strong accent variant vivid (deep rose), not desaturated into muddy mauve", () => {
    const match = globalsCss.match(/--color-accent-strong:\s*(#[0-9a-f]{6});/i);
    const hex = match?.[1];
    expect(hex).toBeDefined();
    const [r0, g0, b0] = hexToRgb(hex as string);
    const r = r0 / 255;
    const g = g0 / 255;
    const b = b0 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
    expect(saturation).toBeGreaterThanOrEqual(0.6);
  });

  it("keeps every accent fill step (default/hover/active) at AA contrast (>= 4.5:1) against its dark contrast foreground", () => {
    for (const token of ["--color-accent", "--color-accent-hover", "--color-accent-active"]) {
      const match = globalsCss.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, "i"));
      const hex = match?.[1];
      expect(hex, `expected ${token} to be defined as a hex literal`).toBeDefined();
      expect(contrastRatio(hex as string, DARK_TEXT)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps --color-accent-strong at AA contrast against both white and the warm cream page background", () => {
    const match = globalsCss.match(/--color-accent-strong:\s*(#[0-9a-f]{6});/i);
    const hex = match?.[1];
    expect(hex).toBeDefined();
    expect(contrastRatio(hex as string, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hex as string, CREAM_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus ring tied to the strong (legible-on-light) accent variant, not the fill accent", () => {
    expect(globalsCss).toMatch(/--color-focus-ring:\s*var\(--color-accent-strong\);/);
  });

  it("keeps --color-accent-vivid at AA contrast against every surface it actually renders as text on ('choose a file' on white/sunken, active-nav text on --color-accent-soft, MobileTabBar's active tab on the unified --color-bg nav-chrome surface, the brand mark on --color-brand-mark-soft)", () => {
    const match = globalsCss.match(/--color-accent-vivid:\s*(#[0-9a-f]{6});/i);
    const hex = match?.[1];
    expect(hex, "expected --color-accent-vivid to be defined as a hex literal").toBeDefined();

    const surfaces: Record<string, string | undefined> = {
      white: WHITE,
      "surface-sunken": globalsCss.match(/--color-surface-sunken:\s*(#[0-9a-f]{6});/i)?.[1],
      "accent-soft": globalsCss.match(/--color-accent-soft:\s*(#[0-9a-f]{6});/i)?.[1],
      bg: globalsCss.match(/--color-bg:\s*(#[0-9a-f]{6});/i)?.[1],
      "brand-mark-soft": globalsCss.match(/--color-brand-mark-soft:\s*(#[0-9a-f]{6});/i)?.[1],
    };
    for (const [name, bg] of Object.entries(surfaces)) {
      expect(bg, `expected a hex value for ${name}`).toBeDefined();
      expect(
        contrastRatio(hex as string, bg as string),
        `--color-accent-vivid vs ${name}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps semantic status colors independent of the accent family", () => {
    expect(globalsCss).toMatch(/--color-status-completed-fg:\s*#1f7a3d;/i);
    expect(globalsCss).toMatch(/--color-status-failed-fg:\s*#b23a1f;/i);
    expect(globalsCss).toMatch(/--color-status-processing-fg:\s*#2452a6;/i);
    expect(globalsCss).toMatch(/--color-status-queued-fg:\s*#5c5544;/i);
  });

  it("keeps 'completed' semantically green, independent of the (now pink) brand accent", () => {
    expect(globalsCss).toMatch(/--color-status-completed-fg:\s*#1f7a3d;/i);
    const accentMatch = globalsCss.match(/--color-accent-strong:\s*(#[0-9a-f]{6});/i);
    const hex = accentMatch?.[1];
    expect(hex).toBeDefined();
    expect((hex as string).toLowerCase()).not.toBe("#1f7a3d");
  });

  it("keeps the brand accent's hue clearly distinct from --color-danger / the failed status", () => {
    const accentMatch = globalsCss.match(/--color-accent:\s*(#[0-9a-f]{6});/i);
    const hex = accentMatch?.[1];
    expect(hex).toBeDefined();
    expect(globalsCss).toMatch(/--color-danger:\s*#b23a1f;/i);
    const hueDelta = Math.abs(hueDegrees(hex as string) - hueDegrees(DANGER));
    expect(hueDelta).toBeGreaterThanOrEqual(12);
  });

  it("aliases the brand mark to --color-accent-vivid on purpose (owner instruction: the logo should match the same vivid pink as the active nav / 'choose a file'), while the soft tile stays its own dedicated value", () => {
    expect(globalsCss).toMatch(/--color-brand-mark:\s*var\(--color-accent-vivid\);/i);
    expect(globalsCss).toMatch(/--color-brand-mark-soft:\s*#fcedf4;/i);
    expect(globalsCss).not.toMatch(/--color-brand-mark:\s*#0b6b5c;/i);
    expect(globalsCss).not.toMatch(/--color-brand-mark-soft:\s*#e2f1ec;/i);
    expect(globalsCss).not.toMatch(/--color-brand-mark:\s*#7e3a07;/i);
    expect(globalsCss).not.toMatch(/--color-brand-mark-soft:\s*#fcf1e8;/i);
    // The soft tile is still a dedicated literal, not an accent-soft alias.
    expect(globalsCss).not.toMatch(/--color-brand-mark-soft:\s*var\(/i);
  });

  it("keeps the brand mark legible on every surface it actually renders on (Sidebar and the mobile top bar, both the unified --color-bg nav-chrome surface) and on its own soft tile", () => {
    const mark = resolveTokenHex(globalsCss, "--color-brand-mark");
    const softMatch = globalsCss.match(/--color-brand-mark-soft:\s*(#[0-9a-f]{6});/i);
    const soft = softMatch?.[1];
    expect(mark).toBeDefined();
    expect(soft).toBeDefined();

    const bgMatch = globalsCss.match(/--color-bg:\s*(#[0-9a-f]{6});/i);
    const bg = bgMatch?.[1];
    expect(bg).toBeDefined();

    expect(contrastRatio(mark as string, soft as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mark as string, bg as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mark as string, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the brand mark's hue clearly distinct from --color-danger, so the logo never reads as an error color", () => {
    const mark = resolveTokenHex(globalsCss, "--color-brand-mark");
    expect(mark).toBeDefined();
    const hueDelta = Math.abs(hueDegrees(mark as string) - hueDegrees(DANGER));
    expect(hueDelta).toBeGreaterThanOrEqual(12);
  });

  it("keeps the wordmark text on the existing dark-neutral token, not colored to match the brand mark/accent", () => {
    const brandCss = readFileSync(
      fileURLToPath(new URL("../src/components/Brand.module.css", import.meta.url)),
      "utf8",
    );
    expect(brandCss).toMatch(/\.name\s*{[^}]*color:\s*var\(--color-text\);/);
  });

  it("retires --color-sidebar-bg entirely (design decision to unify all nav-chrome surfaces with the main canvas) -- no dangling definition left behind", () => {
    expect(globalsCss).not.toMatch(/--color-sidebar-bg:\s*#[0-9a-f]{6};/i);
  });

  it("makes the Sidebar, mobile top brand bar, and MobileTabBar all reference the same --color-bg token as the main canvas -- one unified beige surface, not a separate cream/ivory value or a hardcoded white literal", () => {
    expect(sidebarCss).toMatch(/\.sidebar\s*{[^}]*background:\s*var\(--color-bg\);/);
    expect(sidebarCss).not.toMatch(/\.sidebar\s*{[^}]*background:\s*var\(--color-surface\);/);
    expect(sidebarCss).not.toMatch(/\.sidebar\s*{[^}]*background:\s*#fff/i);

    expect(mobileTabBarCss).toMatch(/\.tabBar\s*{[^}]*background:\s*var\(--color-bg\);/);
    expect(mobileTabBarCss).not.toMatch(/\.tabBar\s*{[^}]*background:\s*var\(--color-surface\);/);
    expect(mobileTabBarCss).not.toMatch(/\.tabBar\s*{[^}]*background:\s*#fff/i);

    expect(appShellCss).toMatch(/\.mobileTopBar\s*{[^}]*background:\s*var\(--color-bg\);/);
    expect(appShellCss).not.toMatch(/\.mobileTopBar\s*{[^}]*background:\s*var\(--color-surface\);/);
    expect(appShellCss).not.toMatch(/\.mobileTopBar\s*{[^}]*background:\s*#fff/i);
  });

  it("keeps readable text against the unified nav-chrome/canvas surface (dark text and the secondary neutral both clear AA)", () => {
    const match = globalsCss.match(/--color-bg:\s*(#[0-9a-f]{6});/i);
    const hex = match?.[1];
    expect(hex).toBeDefined();
    expect(contrastRatio(hex as string, DARK_TEXT)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hex as string, "#5f594c")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps active-nav vivid text/icon/border clearly distinct from --color-accent-strong (the old dark treatment must not have crept back in)", () => {
    expect(sidebarCss).not.toMatch(/\.navLinkActive\s*{[^}]*color:\s*var\(--color-accent-strong\)/);
    expect(sidebarCss).not.toMatch(/\.navLinkActive\s*{[^}]*box-shadow:[^}]*--color-accent-strong/);
    expect(mobileTabBarCss).not.toMatch(/\.tabActive\s*{[^}]*color:\s*var\(--color-accent-strong\)/);

    expect(sidebarCss).toMatch(/\.navLinkActive\s*{[^}]*color:\s*var\(--color-accent-vivid\);/);
    expect(sidebarCss).toMatch(/\.navLinkActive\s*{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--color-accent-vivid\);/);
    expect(mobileTabBarCss).toMatch(/\.tabActive\s*{[^}]*color:\s*var\(--color-accent-vivid\);/);
  });
});
