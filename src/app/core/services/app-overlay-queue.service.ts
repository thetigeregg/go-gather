import { Injectable } from '@angular/core';

interface QueuedOverlay {
  key: string;
  run: () => Promise<void>;
}

/**
 * Shows app-level popups (the OTA "Update Ready" alert, the availability
 * changes sheet) one at a time, so two triggers firing together — both
 * commonly happen right after launch or resume — never stack overlays.
 */
@Injectable({ providedIn: 'root' })
export class AppOverlayQueueService {
  private readonly waiting: QueuedOverlay[] = [];
  private draining = false;

  /**
   * Queues `run`, which presents an overlay and resolves once it's dismissed
   * (or straight away if it decides there's nothing to show). A key already
   * waiting isn't queued twice; one that's currently showing is, so a
   * trigger that fires while it's open gets its own turn afterwards.
   */
  enqueue(key: string, run: () => Promise<void>): void {
    if (this.waiting.some((overlay) => overlay.key === key)) {
      return;
    }
    this.waiting.push({ key, run });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      for (let next = this.waiting.shift(); next; next = this.waiting.shift()) {
        try {
          await next.run();
        } catch (error: unknown) {
          console.error('overlay_queue.run_failed', {
            key: next.key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
