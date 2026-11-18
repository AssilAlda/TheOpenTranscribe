/**
 * Bespoke TheOpenTranscribe icon family for the application chrome
 * (primary navigation, the upload dropzone, and close controls) -- NOT the
 * semantic job-status icons in JobStatusDetail.tsx, which stay separate on
 * purpose and keep their own status-tone-driven colors.
 *
 * This is an experiment in original, product-specific iconography before
 * evaluating an external library (Lucide/Font Awesome): no icon
 * dependency is added here, in keeping with the project's broader
 * no-unnecessary-dependency stance.
 *
 * ## Design grammar (the family's shared rules)
 *
 * - 24x24 viewBox; usable content sits inside an optically centered
 *   ~17x16 box (roughly x/y 3.5-20.5), so every icon has the same visual
 *   weight/margin regardless of its own silhouette.
 * - Two-layer construction, applied consistently:
 *     1. PRIMARY SILHOUETTE -- the shape carrying the icon's actual
 *        meaning (an arrow, a page, two linked nodes) is always drawn as
 *        a `stroke="currentColor"` outline at full opacity, round
 *        linecaps/linejoins, sized via `opticalStrokeWidth` (unchanged
 *        from the previous pass: a smaller render gets a proportionally
 *        thicker stroke-width value so the *on-screen* stroke stays a
 *        near-constant ~1.5px at any of this app's icon sizes).
 *     2. BRAND RHYTHM -- every icon in the family carries exactly one
 *        small cluster of short vertical bars in the brand mark's own
 *        asymmetric proportion (short / tall / medium, never a uniform
 *        bar chart), always drawn FILLED (never stroked) with rounded
 *        pill ends, always at reduced opacity (0.5) so it reads as a
 *        quiet signature detail rather than competing with the primary
 *        silhouette. This is the family's "belongs to TheOpenTranscribe"
 *        cue -- see per-icon notes below for how it's adapted to each
 *        icon's own composition (bottom-aligned "rising" bars for Upload,
 *        a center-aligned waveform tick for the audio cue in Transcribed
 *        Files, a small processing-signal accent in Provider) rather than
 *        one shape copy-pasted three times.
 * - Corner logic: bar/tick accents always use a true pill radius
 *   (rx = half their own width); larger container shapes (the page, the
 *   linked nodes) use a small fixed soft-rounding radius instead -- never
 *   a pill on a container.
 * - `currentColor` throughout (full-opacity strokes and the 0.5-opacity
 *   fill accents both derive from it), so nav active/inactive state, the
 *   modal's own text color, etc. drive icon color entirely through the
 *   existing token system -- no icon ever hardcodes its own color.
 * - All geometry here is original to this project -- no traced or copied
 *   library paths.
 */

const VIEWBOX_SIZE = 24;
const TARGET_STROKE_PX = 1.5;

function opticalStrokeWidth(renderSize: number): number {
  return Number(((TARGET_STROKE_PX * VIEWBOX_SIZE) / renderSize).toFixed(2));
}

export interface ChromeIconProps {
  /** Rendered width/height in px; the 24x24 viewBox scales to it. Stroke width is derived from this, not fixed. */
  size?: number;
}

/**
 * Upload files: an arrow rising directly out of the brand's own bar
 * rhythm, rather than a stock arrow-over-tray. The three bars stand in
 * for the tray/base *and* read as a small rising signal -- the arrow's
 * shaft starts exactly where the tallest (middle) bar ends, so the two
 * layers feel like one continuous gesture, not two unrelated glyphs
 * stacked together. Used identically by the "Upload files" nav item and
 * the dropzone's own (larger) icon.
 */
export function UploadIcon({ size = 20 }: ChromeIconProps) {
  const strokeWidth = opticalStrokeWidth(size);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5.5" y="15" width="3" height="5" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="10.5" y="11" width="3" height="9" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="15.5" y="13" width="3" height="7" rx="1.5" fill="currentColor" fillOpacity="0.5" />
      <path
        d="M12 11V4M8.5 7.5L12 4L15.5 7.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Transcribed files: a page carries a small waveform tick (three bars in
 * the brand's own short/tall/medium rhythm, center-aligned around a
 * shared midline like an actual audio waveform, not bottom-aligned like
 * Upload's "rising" bars) sitting directly above two transcript lines of
 * different lengths -- source audio in, transcript text out, read
 * top-to-bottom in one glyph, not just "a generic file."
 */
export function DocumentIcon({ size = 20 }: ChromeIconProps) {
  const strokeWidth = opticalStrokeWidth(size);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <rect x="9" y="11.5" width="1.4" height="2" rx="0.7" fill="currentColor" fillOpacity="0.5" />
      <rect x="11.3" y="10" width="1.4" height="3.5" rx="0.7" fill="currentColor" fillOpacity="0.5" />
      <rect x="13.6" y="10.9" width="1.4" height="2.6" rx="0.7" fill="currentColor" fillOpacity="0.5" />
      <path d="M8.5 16h7M8.5 18h4.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/**
 * Provider: two linked nodes (this app, and the connected
 * provider/model), joined by a plain bridge -- deliberately not a lock,
 * gear, plug, or generic cloud/network glyph. The provider-side node
 * carries a small brand-bar accent, standing in for "this is where the
 * transcription signal is actually processed," which is what gives the
 * two otherwise-identical boxes their asymmetric, meaningful read.
 */
export function ConnectionIcon({ size = 20 }: ChromeIconProps) {
  const strokeWidth = opticalStrokeWidth(size);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="8" width="7" height="8" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <rect x="13.5" y="8" width="7" height="8" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M10.5 12h3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <rect x="14.7" y="10.9" width="1.2" height="2.2" rx="0.6" fill="currentColor" fillOpacity="0.5" />
      <rect x="16.3" y="10" width="1.2" height="4" rx="0.6" fill="currentColor" fillOpacity="0.5" />
      <rect x="17.9" y="10.5" width="1.2" height="3" rx="0.6" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}

/** Shared close/dismiss "X" -- used by both the upload panel's "remove selected file" button and the job-detail modal's close button. Left un-branded on purpose: a close control doesn't need product character, only stroke harmony with the rest of the family. */
export function CloseIcon({ size = 16 }: ChromeIconProps) {
  const strokeWidth = opticalStrokeWidth(size);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
