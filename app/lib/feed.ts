import type { IndexedEvent } from "@wick/shared";

const eventKey = (event: IndexedEvent): string => `${event.signature}:${event.eventIndex}`;

function preferredEvent(current: IndexedEvent, candidate: IndexedEvent): IndexedEvent {
  if (current.provenance === candidate.provenance) return candidate;
  return candidate.provenance === "quicknode_stream" ? candidate : current;
}

export function mergeIndexedEvents(
  ...collections: ReadonlyArray<readonly IndexedEvent[]>
): IndexedEvent[] {
  const unique = new Map<string, IndexedEvent>();
  for (const collection of collections) {
    for (const event of collection) {
      const key = eventKey(event);
      const current = unique.get(key);
      unique.set(key, current ? preferredEvent(current, event) : event);
    }
  }
  return [...unique.values()]
    .sort((left, right) => right.blockTime - left.blockTime
      || right.slot - left.slot
      || right.eventIndex - left.eventIndex
      || left.signature.localeCompare(right.signature))
    .slice(0, 50);
}

export function latestIndexerEventKey(events: readonly IndexedEvent[], names: ReadonlySet<string>): string {
  const event = events.find((candidate) => names.has(candidate.name));
  return event ? eventKey(event) : "";
}
