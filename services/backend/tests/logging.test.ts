import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createBackendLogger } from "../src/logging.js";

describe("backend logging", () => {
  it("never writes webhook query or header secrets to the log destination", () => {
    const destination = new PassThrough();
    let output = "";
    destination.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    const logger = createBackendLogger(destination);

    logger.info({
      req: {
        url: "/streams/webhook?secret=query-super-secret",
        originalUrl: "/streams/webhook?secret=query-super-secret",
        headers: {
          authorization: "Bearer authorization-super-secret",
          "x-wick-stream-secret": "header-super-secret",
        },
      },
    }, "received webhook");
    logger.flush();

    expect(output).not.toContain("query-super-secret");
    expect(output).not.toContain("authorization-super-secret");
    expect(output).not.toContain("header-super-secret");
    expect(output).toContain("[REDACTED]");
  });
});
