// WP2 replaces this placeholder with the generated Anchor IDL after `anchor build`.
export const WICK_IDL = {
  address: "EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi",
  metadata: { name: "wick", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
  accounts: [],
  events: [],
  errors: [],
  types: [],
} as const;

/** Build-time program identity. `anchor keys sync` must replace this before devnet deployment. */
export const WICK_PROGRAM_ID = WICK_IDL.address;
