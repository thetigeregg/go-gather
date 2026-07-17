import { InjectionToken } from '@angular/core';
import type { OutboxEntry } from './storage-engine';

export interface SyncOutboxWriteRequest {
  opId?: string;
  entityType: OutboxEntry['entityType'];
  operation: OutboxEntry['operation'];
  payload: unknown;
  clientTimestamp?: string;
}

/**
 * Ported from game-shelf's `SyncOutboxWriter` — lets `LocalUserDataRepository`
 * trigger a sync attempt right after enqueueing a write, without depending
 * directly on `SyncService`. Optional: if nothing provides this token,
 * writes are still queued in the outbox, they just aren't proactively
 * pushed until the next scheduled sync.
 */
export interface SyncOutboxWriter {
  enqueueOperation(request: SyncOutboxWriteRequest): Promise<void>;
  syncNow?(): Promise<void>;
  onOutboxEntryEnqueued?(entry: OutboxEntry): void;
}

export const SYNC_OUTBOX_WRITER = new InjectionToken<SyncOutboxWriter>('SYNC_OUTBOX_WRITER');
