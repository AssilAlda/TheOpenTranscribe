# Bundled font

Part of [TheOpenTranscribe](../../../../../../README.md).

The font embedded in exported transcript PDFs, so they look the same on every machine.

| | |
|---|---|
| **Font** | Noto Sans Regular (static, hinted) |
| **File** | `NotoSans-Regular.ttf` (621,572 bytes) |
| **Source** | [notofonts/latin-greek-cyrillic `NotoSans-v2.015`](https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015), file `NotoSans/hinted/ttf/NotoSans-Regular.ttf` from `NotoSans-v2.015.zip` |
| **License** | SIL Open Font License 1.1, full text in [`OFL.txt`](OFL.txt) |

### Coverage

| Supported | Not supported |
|---|---|
| Latin, Latin Extended (incl. `å ä ö`), Greek, Cyrillic | CJK (Chinese, Japanese, Korean), right-to-left scripts (Arabic, Hebrew) |

Transcripts with unsupported characters get a clear error instead of a PDF with missing-glyph boxes. The covered characters are checked against this file in `tests/pdf/generateTranscriptPdf.test.ts`.
