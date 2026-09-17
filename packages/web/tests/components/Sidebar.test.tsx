// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("Sidebar", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders exactly the three approved primary destinations", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<Sidebar />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Upload files",
      "Transcribed files",
      "Provider",
    ]);
  });

  it("marks Upload files active on /", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Upload files" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Transcribed files" })).not.toHaveAttribute("aria-current");
  });

  it("marks Transcribed files active on /files", () => {
    vi.mocked(usePathname).mockReturnValue("/files");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Transcribed files" })).toHaveAttribute("aria-current", "page");
  });

  it("marks Transcribed files active on a /jobs/[jobId] detail page too (conceptually part of the files area)", () => {
    vi.mocked(usePathname).mockReturnValue("/jobs/11111111-1111-4111-8111-111111111111");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Transcribed files" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Upload files" })).not.toHaveAttribute("aria-current");
  });

  it("marks Provider active on /provider", () => {
    vi.mocked(usePathname).mockReturnValue("/provider");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Provider" })).toHaveAttribute("aria-current", "page");
  });

  it("nav links are real, keyboard-reachable links (normal tab order, correct hrefs unaffected by the label rename)", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Upload files" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Transcribed files" })).toHaveAttribute("href", "/files");
    expect(screen.getByRole("link", { name: "Provider" })).toHaveAttribute("href", "/provider");
  });
});
