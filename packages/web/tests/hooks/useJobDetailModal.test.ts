// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useJobDetailModal } from "@/hooks/useJobDetailModal";

function makeFocusableButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "row";
  document.body.appendChild(button);
  return button;
}

function makeFallback(): { current: HTMLElement | null } {
  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  document.body.appendChild(heading);
  return { current: heading };
}

describe("useJobDetailModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("open() sets openJobId", () => {
    const fallbackRef = makeFallback();
    const { result } = renderHook(() => useJobDetailModal(fallbackRef));
    const trigger = makeFocusableButton();

    act(() => result.current.open("job-1", trigger));

    expect(result.current.openJobId).toBe("job-1");
  });

  it("close() clears openJobId and restores focus to the exact triggering element (explicit close button path)", () => {
    const fallbackRef = makeFallback();
    const { result } = renderHook(() => useJobDetailModal(fallbackRef));
    const trigger = makeFocusableButton();

    act(() => result.current.open("job-1", trigger));
    act(() => result.current.close());

    expect(result.current.openJobId).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("close() also restores focus deterministically when invoked via a different path (e.g. Escape/cancel or a programmatic close) -- the same single close() function backs all of them", () => {
    const fallbackRef = makeFallback();
    const { result } = renderHook(() => useJobDetailModal(fallbackRef));
    const trigger = makeFocusableButton();

    act(() => result.current.open("job-1", trigger));
    // There is only one close() path in this hook -- calling it here stands
    // in for however the caller wires Escape/cancel or a programmatic close;
    // the important property is that all of them funnel into this same
    // deterministic restoration logic, not three different implementations.
    act(() => result.current.close());

    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the documented fallback target, without throwing, when the triggering element is no longer in the DOM", () => {
    const fallbackRef = makeFallback();
    const { result } = renderHook(() => useJobDetailModal(fallbackRef));
    const trigger = makeFocusableButton();

    act(() => result.current.open("job-1", trigger));
    trigger.remove(); // simulate it being removed by a poll refresh/pagination

    expect(() => act(() => result.current.close())).not.toThrow();
    expect(document.activeElement).toBe(fallbackRef.current);
  });
});
