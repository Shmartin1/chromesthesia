import { MAX_TONAL_EVENTS, type VisualEvent } from '@chromesthesia/core';

export interface TrackedSound {
  event: VisualEvent;
  generation: number;
}

/** Match neighboring spectral detections without inventing sounds or holding missing events. */
export class SoundTracker {
  readonly slots: Array<TrackedSound | undefined> = Array.from({ length: MAX_TONAL_EVENTS });
  private generation = 0;

  update(events: readonly VisualEvent[]) {
    const pairs: Array<{ slot: number; event: number; cost: number }> = [];
    this.slots.forEach((previous, slot) => {
      if (!previous) return;
      events.forEach((event, index) => {
        const pitch = Math.abs(Math.log2(event.frequency / previous.event.frequency));
        const pan = Math.abs(event.pan - previous.event.pan);
        if (pitch > 0.85 || pan > 0.55) return;
        pairs.push({
          slot,
          event: index,
          cost:
            pitch +
            pan * 0.8 +
            (event.family === previous.event.family ? 0 : 0.25) -
            (event.id === previous.event.id ? 0.15 : 0),
        });
      });
    });
    pairs.sort((a, b) => a.cost - b.cost || a.slot - b.slot || a.event - b.event);
    const assignedSlots = new Set<number>(),
      assignedEvents = new Set<number>();
    for (const pair of pairs) {
      if (assignedSlots.has(pair.slot) || assignedEvents.has(pair.event)) continue;
      this.slots[pair.slot]!.event = events[pair.event]!;
      assignedSlots.add(pair.slot);
      assignedEvents.add(pair.event);
    }
    this.slots.forEach((_, index) => {
      if (!assignedSlots.has(index)) this.slots[index] = undefined;
    });
    events.forEach((event, index) => {
      if (assignedEvents.has(index)) return;
      const slot = this.slots.findIndex((entry) => !entry);
      if (slot >= 0) this.slots[slot] = { event, generation: ++this.generation };
    });
    return this.slots;
  }
}
