// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderSettings } from "@/components/ProviderSettings";

function statusFetch(data: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) });
}

describe("ProviderSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the Connected accounts section with a ChatGPT card", () => {
    vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
    render(<ProviderSettings />);

    expect(screen.getByRole("heading", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
  });

  it("the connected-account Connect action remains disabled and unavailable -- connected-account transcription is not officially supportable", () => {
    vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
    render(<ProviderSettings />);

    expect(screen.getByRole("button", { name: /^connect$/i })).toBeDisabled();
    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument();
  });

  it("renders the Providers section with an OpenAI API card", () => {
    vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
    render(<ProviderSettings />);

    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI API")).toBeInTheDocument();
  });

  describe("unconfigured state", () => {
    it("shows Not configured and an enabled Configure action", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/not configured/i)).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /^configure$/i })).toBeEnabled();
    });

    it("clicking Configure opens the credential modal", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
      const user = userEvent.setup();
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^configure$/i })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: /^configure$/i }));

      expect(screen.getByRole("heading", { name: "Configure OpenAI API" })).toBeInTheDocument();
    });
  });

  describe("environment-configured (locked) state", () => {
    it("shows the env var, marks the action as locked/disabled, and offers no Replace/Remove", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: true, source: "environment", locked: true }));
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/environment configured/i)).toBeInTheDocument());
      expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^replace$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
    });

    it("never issues a mutation request for the locked env-owned card, and the modal is never opened for it", async () => {
      const fetchMock = statusFetch({ configured: true, source: "environment", locked: true });
      vi.stubGlobal("fetch", fetchMock);
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/environment configured/i)).toBeInTheDocument());
      expect(document.querySelector("dialog")).not.toHaveAttribute("open");
      // Only the initial GET status call -- no POST/DELETE ever fired.
      expect(fetchMock.mock.calls.every((call) => (call[1] as RequestInit | undefined)?.method === undefined)).toBe(
        true,
      );
    });
  });

  describe("managed-configured state", () => {
    it("shows Configured with Replace and Remove actions", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: true, source: "managed", locked: false }));
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/^configured$/i)).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /^replace$/i })).toBeEnabled();
      expect(screen.getByRole("button", { name: /^remove$/i })).toBeEnabled();
    });

    it("clicking Replace opens the modal with a blank input, never the existing (unknown to the client) key", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: true, source: "managed", locked: false }));
      const user = userEvent.setup();
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^replace$/i })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: /^replace$/i }));

      expect(screen.getByRole("heading", { name: "Replace OpenAI API key" })).toBeInTheDocument();
      expect((screen.getByLabelText("OpenAI API key") as HTMLInputElement).value).toBe("");
    });

    it("Remove requires an explicit confirmation step -- a single click does not remove anything", async () => {
      const fetchMock = statusFetch({ configured: true, source: "managed", locked: false });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^remove$/i })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: /^remove$/i }));

      expect(screen.getByText(/remove the saved key\?/i)).toBeInTheDocument();
      expect(fetchMock.mock.calls).toHaveLength(1); // only the initial GET
    });

    it("confirming Remove issues a DELETE and refreshes to the unconfigured state", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { configured: true, source: "managed", locked: false } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { configured: false, source: "unconfigured", locked: false } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { configured: false, source: "unconfigured", locked: false } }) });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^remove$/i })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: /^remove$/i }));
      await user.click(screen.getByRole("button", { name: /^confirm$/i }));

      await waitFor(() => expect(screen.getByText(/not configured/i)).toBeInTheDocument());
      const deleteCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "DELETE");
      expect(deleteCall).toBeDefined();
    });
  });

  describe("configuration-error state (blockers B2/B4)", () => {
    it("renders the configuration-error branch, driven by the safe configError sibling field", async () => {
      vi.stubGlobal(
        "fetch",
        statusFetch({ configured: false, source: "unconfigured", locked: false, configError: true }),
      );
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/configuration error/i)).toBeInTheDocument());
      expect(screen.getByText(/couldn.?t be read/i)).toBeInTheDocument();
    });

    it("does not offer Replace or Remove as though a valid managed credential had been loaded", async () => {
      vi.stubGlobal(
        "fetch",
        statusFetch({ configured: false, source: "unconfigured", locked: false, configError: true }),
      );
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/configuration error/i)).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /^replace$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^configure$/i })).toBeEnabled();
    });

    it("plain unconfigured (no configError) still renders the ordinary Not configured state", async () => {
      vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
      render(<ProviderSettings />);

      await waitFor(() => expect(screen.getByText(/not configured/i)).toBeInTheDocument());
      expect(screen.queryByText(/configuration error/i)).not.toBeInTheDocument();
    });
  });

  it("never persists anything to localStorage or sessionStorage across normal interaction", async () => {
    vi.stubGlobal("fetch", statusFetch({ configured: false, source: "unconfigured", locked: false }));
    render(<ProviderSettings />);

    await waitFor(() => expect(screen.getByRole("button", { name: /^configure$/i })).toBeEnabled());

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
