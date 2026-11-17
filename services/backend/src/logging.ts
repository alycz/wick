import pino, { type DestinationStream, type Logger } from "pino";

export function createBackendLogger(destination?: DestinationStream): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.url",
        "req.originalUrl",
        "req.raw.url",
        "request.url",
        "req.headers.authorization",
        "req.headers['x-wick-stream-secret']",
        "*.token",
        "*.secret",
        "*.webhookSecret",
        "*.keypair",
        "*.privateKey",
      ],
      censor: "[REDACTED]",
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
