/**
 * The 3 primary nav destinations' icons, shared between Sidebar and
 * MobileTabBar so geometry/stroke style stays consistent and isn't
 * duplicated. Thin wrappers around the shared chrome glyphs in ./icons
 * (kept as their own named components/module so navItems.ts's
 * `Icon: ComponentType<{ size?: number }>` entries stay simple).
 */

import { ConnectionIcon, DocumentIcon, UploadIcon } from "./icons";

// 20 -> 22px: the bespoke brand-bar/waveform detail in these icons was
// getting lost at 20px (owner feedback after the bespoke-icon pass). This
// is Sidebar's size and every wrapper's default; MobileTabBar renders one
// step larger by passing its own explicit `size` (see MobileTabBar.tsx).
const NAV_ICON_SIZE = 22;

interface NavIconProps {
  size?: number;
}

export function TranscribeIcon({ size = NAV_ICON_SIZE }: NavIconProps) {
  return <UploadIcon size={size} />;
}

export function TranscribedFilesIcon({ size = NAV_ICON_SIZE }: NavIconProps) {
  return <DocumentIcon size={size} />;
}

export function ProviderIcon({ size = NAV_ICON_SIZE }: NavIconProps) {
  return <ConnectionIcon size={size} />;
}
