import { describe, expect, it } from "vitest";

import { isValidJobId } from "@/lib/jobId";

describe("isValidJobId (mirrors the job contract's job_id pattern exactly)", () => {
  it.each([
    "11111111-1111-4111-8111-111111111111", // v4-shaped
    "01890a5d-ac96-774b-bcce-b302099a8057", // v7-shaped (time-ordered)
  ])("accepts a conformant UUID: %s", (id) => {
    expect(isValidJobId(id)).toBe(true);
  });

  it.each([
    "not-a-uuid",
    "",
    "../../etc/passwd",
    "11111111-1111-1111-1111-111111111111", // invalid variant nibble (must be 8/9/a/b)
    "11111111111141118111111111111111", // no dashes
    "11111111-1111-4111-c111-111111111111", // invalid variant nibble (must be 8/9/a/b)
  ])("rejects a non-conformant value: %s", (id) => {
    expect(isValidJobId(id)).toBe(false);
  });
});
