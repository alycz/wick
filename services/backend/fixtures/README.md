# QuickNode fixture

`pnpm create:stream -- --test-only` writes a real-evidence envelope containing
the response from QuickNode's Streams test-filter endpoint to
`quicknode-filter-test.json`. The script first finds a recent successful devnet
transaction for `PROGRAM_ID` (or uses `STREAMS_TEST_BLOCK`), then resolves the
matched signature through `QUICKNODE_RPC_URL`. It writes nothing unless that RPC
transaction succeeded in the same block and actually invoked Wick.

No synthetic QuickNode payload is checked into the shipped application. The
fixture is pending a deployed Wick program transaction, QuickNode API key and
QuickNode RPC endpoint.
