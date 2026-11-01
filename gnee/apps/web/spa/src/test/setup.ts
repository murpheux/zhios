import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL only auto-unmounts when test globals are enabled; vitest.config.ts doesn't enable them.
afterEach(() => {
  cleanup();
});
