// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAICredentialModal } from "@/components/OpenAICredentialModal";

describe("OpenAICredentialModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("is closed (no open attribute) when mode is null", () => {
    render(<OpenAICredentialModal mode={null} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("opens with the Configure title and moves initial focus to the input", async () => {
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(document.querySelector("dialog")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Configure OpenAI API" })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("OpenAI API key")));
  });

  it("opens with the Replace title and copy explaining the existing key stays active unless accepted", () => {
    render(<OpenAICredentialModal mode="replace" onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Replace OpenAI API key" })).toBeInTheDocument();
    expect(screen.getByText(/existing managed key stays active/i)).toBeInTheDocument();
  });

  it("Replace always starts with a blank input -- the existing stored key is never fetched or populated", () => {
    render(<OpenAICredentialModal mode="replace" onClose={vi.fn()} onSettled={vi.fn()} />);
    const input = screen.getByLabelText("OpenAI API key") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("the input is rendered as a password field by default, with a Show/Hide toggle", async () => {
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    const input = screen.getByLabelText("OpenAI API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByRole("button", { name: /^show api key$/i }));
    expect(input.type).toBe("text");
  });

  it("Cancel closes the dialog and calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={onClose} onSettled={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closing the dialog also triggers onSettled, so the caller re-fetches status", async () => {
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={onSettled} />);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("Escape (simulated via the native close()) closes and calls onClose", () => {
    const onClose = vi.fn();
    render(<OpenAICredentialModal mode="configure" onClose={onClose} onSettled={vi.fn()} />);
    document.querySelector("dialog")!.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submitting a VALIDATED candidate shows a verified confirmation and never re-displays the submitted value elsewhere", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { configured: true, source: "managed", locked: false, validation: "validated" } }),
      }),
    );
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-my-real-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/saved and verified/i)).toBeInTheDocument());
    expect(document.body.textContent).not.toContain("sk-my-real-key");
  });

  it("submitting an UNVERIFIED candidate shows it as saved-but-unverified, not as a success claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { configured: true, source: "managed", locked: false, validation: "unverified" } }),
      }),
    );
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-ambiguous");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/could not be actively verified/i)).toBeInTheDocument());
  });

  it("a CLEARLY INVALID (422) response shows the invalid message and does not claim success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: { code: "invalid_credential", message: "OpenAI rejected this API key as invalid." } }),
      }),
    );
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-bad");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/rejected this api key/i));
  });

  // CORRECTION 2 §2B: a browser-to-server transport failure is a distinct
  // domain from Decision 4's server-side validation outcomes -- it must
  // never be presented as "saved, unverified".
  it("a browser-side fetch failure shows a safe transport message, never a fabricated saved/unverified claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-whatever");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t reach theopentranscribe/i));
    expect(screen.queryByText(/saved and verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^saved, but/i)).not.toBeInTheDocument();
  });

  it("prevents duplicate submission while a save is in flight", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    await user.type(screen.getByLabelText("OpenAI API key"), "sk-in-flight");

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveButton);
    expect(saveButton).toBeDisabled();
    await user.click(saveButton).catch(() => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({ data: { configured: true, source: "managed", locked: false, validation: "validated" } }),
    });
    await waitFor(() => expect(screen.getByText(/saved and verified/i)).toBeInTheDocument());
  });

  it("never writes the candidate secret to localStorage or sessionStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { configured: true, source: "managed", locked: false, validation: "validated" } }),
      }),
    );
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    await user.type(screen.getByLabelText("OpenAI API key"), "sk-never-persisted");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/saved and verified/i)).toBeInTheDocument());

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("closing after opening clears the candidate input state", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    await user.type(screen.getByLabelText("OpenAI API key"), "sk-partial-entry");

    rerender(<OpenAICredentialModal mode={null} onClose={vi.fn()} onSettled={vi.fn()} />);
    rerender(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);

    const input = screen.getByLabelText("OpenAI API key") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("locks body scrolling while open and restores it on close", async () => {
    document.body.style.overflow = "scroll";
    const user = userEvent.setup();
    render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores body scroll on unmount while still open", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(<OpenAICredentialModal mode="configure" onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });
});
