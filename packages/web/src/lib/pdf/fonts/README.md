# Vendored font asset

- **Family:** Noto Sans, Regular weight (static, hinted).
- **File:** `NotoSans-Regular.ttf` (621,572 bytes).
- **Upstream source:** official Noto Fonts GitHub release, `notofonts/latin-greek-cyrillic`, tag `NotoSans-v2.015` — https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015 (asset `NotoSans-v2.015.zip`, file `NotoSans/hinted/ttf/NotoSans-Regular.ttf` within it). Not sourced from a third-party mirror.
- **License:** SIL Open Font License, Version 1.1. Full text vendored alongside the font in `OFL.txt` (from the same release archive).
- **Why vendored:** `packages/web`'s server-side PDF export (`src/lib/pdf/generateTranscriptPdf.ts`) embeds this font into generated PDFs so transcript export is reproducible across machines, independent of whatever fonts happen to be installed on the host running the self-hosted app.
- **Verified glyph coverage:** Latin, Latin Extended (including Swedish `å ä ö Å Ä Ö`), Greek, and Cyrillic — see `tests/pdf/generateTranscriptPdf.test.ts` for the exact characters checked directly against this file via `fontkit`.
- **Known limitation:** this asset does not cover CJK (Chinese/Japanese/Korean) or right-to-left scripts (Arabic/Hebrew). PDF export for transcripts containing unsupported characters fails safely with a clear error rather than silently producing missing-glyph boxes (see `generateTranscriptPdf.ts`). Broader script support is a possible future decision, not implemented here.
