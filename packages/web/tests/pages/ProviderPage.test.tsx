// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProviderPage from "../../app/provider/page";

describe("ProviderPage (/provider)", () => {
  it("renders the shared page header, supporting copy, and both Provider sections (Connected accounts, Providers)", () => {
    render(<ProviderPage />);
    expect(screen.getByRole("heading", { name: "Provider", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Configure the transcription provider TheOpenTranscribe uses.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI API")).toBeInTheDocument();
  });
});
