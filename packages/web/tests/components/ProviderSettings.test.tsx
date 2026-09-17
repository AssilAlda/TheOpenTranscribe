// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderSettings } from "@/components/ProviderSettings";

describe("ProviderSettings (Phase 6: Connected accounts + Providers card architecture, presentation only)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the Connected accounts section with a ChatGPT card", () => {
    render(<ProviderSettings />);

    expect(screen.getByRole("heading", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
  });

  it("the connected-account Connect action is disabled and represented as unavailable, with no fake connected state", () => {
    render(<ProviderSettings />);

    expect(screen.getByRole("button", { name: /^connect$/i })).toBeDisabled();
    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument();
  });

  it("renders the Providers section with an OpenAI API card", () => {
    render(<ProviderSettings />);

    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI API")).toBeInTheDocument();
  });

  it("communicates OPENAI_API_KEY as the current working mechanism, without a fake configured state", () => {
    render(<ProviderSettings />);

    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    expect(screen.getByText(/environment configuration required/i)).toBeInTheDocument();
    expect(screen.queryByText(/^configured$/i)).not.toBeInTheDocument();
  });

  it("does not render an editable API-key input anywhere on the Provider landing page", () => {
    const { container } = render(<ProviderSettings />);
    expect(container.querySelector("input")).toBeNull();
  });

  it("the API-key provider's Configure action is disabled", () => {
    render(<ProviderSettings />);
    expect(screen.getByRole("button", { name: /^configure$/i })).toBeDisabled();
  });

  it("never issues a fetch/POST under any interaction with this component, and no secret is ever persisted anywhere", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ProviderSettings />);

    await user.click(screen.getByRole("button", { name: /^connect$/i })).catch(() => {
      /* expected: userEvent refuses to click a disabled button */
    });
    await user.click(screen.getByRole("button", { name: /^configure$/i })).catch(() => {
      /* expected: userEvent refuses to click a disabled button */
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
