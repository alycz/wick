import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Anchor tests need a deployed program and validator. They are run only by
    // `anchor test` through the Node test runner, never by root Vitest.
    exclude: [...configDefaults.exclude, "tests/anchor/**"],
  },
});
