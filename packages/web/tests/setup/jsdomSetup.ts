import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

// RTL's own automatic afterEach(cleanup) only registers when it detects a
// global `afterEach` (this project doesn't set vitest's `test.globals`), so
// without this every render()/renderHook() in a jsdom test file would stay
// mounted -- including its timers/effects -- and leak into later tests.
afterEach(() => {
  cleanup();
});

// jsdom (as of the version this project uses) implements the <dialog>
// element's `open` attribute/property but none of showModal()/show()/
// close() -- confirmed by direct probing, not assumed. This is a
// test-environment-only polyfill (real browsers all implement these
// natively) so tests can exercise JobDetailModal's open/close code paths.
// It intentionally does NOT attempt to simulate real focus-trap or
// inert-background behavior -- those are genuine platform guarantees that
// this jsdom-based suite cannot verify; they're covered by manual/real-
// browser testing instead.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
    if (returnValue !== undefined) this.returnValue = returnValue;
    const wasOpen = this.open;
    this.open = false;
    if (wasOpen) {
      this.dispatchEvent(new Event("close"));
    }
  };
}
