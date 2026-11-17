# QuickNode evidence fixtures

`pnpm create:stream -- --test-only` writes a real-evidence envelope containing
the response from QuickNode's Streams test-filter endpoint to
`quicknode-filter-test.json`. The script first finds a recent successful devnet
transaction for `PROGRAM_ID` (or uses `STREAMS_TEST_BLOCK`), then resolves the
matched signature through `QUICKNODE_RPC_URL`. It writes nothing unless that RPC
transaction succeeded in the same block and actually invoked Wick.

`pnpm create:stream` then reads the created or idempotently reused Stream back
from QuickNode, verifies its terminal active status, network, dataset, external
ID, destination and exact filter, and writes only sanitized metadata to
`quicknode-stream-active.json`. Destination headers and the webhook secret are
never persisted. Deployment readiness requires both evidence files plus the
matching `QUICKNODE_STREAM_ID`.

No synthetic QuickNode payload is checked into the shipped application. Both
fixtures are pending a deployed Wick program transaction, QuickNode API key,
QuickNode RPC endpoint and public authenticated backend.
