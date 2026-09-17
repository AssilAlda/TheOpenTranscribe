// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobStatusPill } from "@/components/JobStatusPill";

describe("JobStatusPill", () => {
  it.each([
    ["QUEUED", "Queued"],
    ["PROCESSING", "Processing"],
    ["COMPLETED", "Completed"],
    ["FAILED", "Failed"],
  ] as const)("renders the label for %s", (status, label) => {
    render(<JobStatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
