# QuickNode fixture

`pnpm create:stream -- --test-only` writes the real response from QuickNode's
Streams test-filter endpoint to `quicknode-filter-test.json`. The script first
finds a recent successful devnet transaction for `PROGRAM_ID` (or uses
`STREAMS_TEST_BLOCK`) and refuses to create a Stream unless that response
contains a matched Wick transaction.

No synthetic QuickNode payload is checked into the shipped application. The
fixture is pending a deployed Wick program transaction and QuickNode API key.
