const PROGRAM_ID = "__PROGRAM_ID__";

function main(stream) {
  const block = stream.data && stream.data[0];
  if (!block || !block.transactions) return null;
  const matched = [];
  for (const tx of block.transactions) {
    if (tx.meta && tx.meta.err) continue;
    const ixs = (tx.transaction && tx.transaction.message && tx.transaction.message.instructions) || [];
    const inner = ((tx.meta && tx.meta.innerInstructions) || []).flatMap((group) => group.instructions || []);
    if (![...ixs, ...inner].some((ix) => ix.programId === PROGRAM_ID)) continue;
    matched.push({
      signature: tx.transaction.signatures[0],
      slot: block.parentSlot + 1,
      blockTime: block.blockTime,
      logs: (tx.meta && tx.meta.logMessages) || [],
    });
  }
  return matched.length ? { matchedTransactions: matched } : null;
}
