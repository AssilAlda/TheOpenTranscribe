// @vitest-environment jsdom
import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageLayout } from "@/components/PageLayout";

describe("PageLayout", () => {
  it("renders the given title as the page's h1 and renders children below it", () => {
    render(
      <PageLayout title="Transcribe">
        <p>Upload surface goes here.</p>
      </PageLayout>,
    );

    expect(screen.getByRole("heading", { name: "Transcribe", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Upload surface goes here.")).toBeInTheDocument();
  });

  it("applies the given headingId to the h1, for pages that need it as an aria-labelledby target", () => {
    render(
      <PageLayout title="Transcribed Files" headingId="files-heading">
        <p>content</p>
      </PageLayout>,
    );

    const heading = screen.getByRole("heading", { name: "Transcribed Files", level: 1 });
    expect(heading).toHaveAttribute("id", "files-heading");
  });

  it("forwards a ref to the h1, so a page can use it as a deterministic focus-restoration fallback target", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <PageLayout title="Transcribed Files" ref={ref}>
        <p>content</p>
      </PageLayout>,
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("H1");
    expect(ref.current?.textContent).toBe("Transcribed Files");
  });
});
