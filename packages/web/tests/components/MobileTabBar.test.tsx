// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileTabBar } from "@/components/MobileTabBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("MobileTabBar", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders exactly the three approved primary destinations, as real links with correct hrefs", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<MobileTabBar />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Upload files",
      "Transcribed files",
      "Provider",
    ]);
    expect(screen.getByRole("link", { name: "Upload files" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Transcribed files" })).toHaveAttribute("href", "/files");
    expect(screen.getByRole("link", { name: "Provider" })).toHaveAttribute("href", "/provider");
  });

  it("marks the correct tab active via aria-current, including for a job detail URL", () => {
    vi.mocked(usePathname).mockReturnValue("/jobs/11111111-1111-4111-8111-111111111111");
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Transcribed files" })).toHaveAttribute("aria-current", "page");
  });

  it("does not require an overlay/drawer to open -- always present, no open/close state", () => {
    vi.mocked(usePathname).mockReturnValue("/provider");
    const { container } = render(<MobileTabBar />);
    expect(container.querySelector("dialog")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
