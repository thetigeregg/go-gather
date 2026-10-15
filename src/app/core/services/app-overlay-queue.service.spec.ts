import { AppOverlayQueueService } from './app-overlay-queue.service';

/** A queued overlay whose dismissal the test controls. */
function controlledOverlay(log: string[], name: string) {
  let dismiss!: () => void;
  const run = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        log.push(`show ${name}`);
        dismiss = () => {
          log.push(`dismiss ${name}`);
          resolve();
        };
      })
  );
  return {
    run,
    dismiss: () => {
      dismiss();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AppOverlayQueueService', () => {
  let queue: AppOverlayQueueService;

  beforeEach(() => {
    queue = new AppOverlayQueueService();
  });

  it('shows the next overlay only after the current one is dismissed', async () => {
    const log: string[] = [];
    const first = controlledOverlay(log, 'first');
    const second = controlledOverlay(log, 'second');

    queue.enqueue('first', first.run);
    queue.enqueue('second', second.run);
    await flush();
    expect(log).toEqual(['show first']);

    first.dismiss();
    await flush();
    expect(log).toEqual(['show first', 'dismiss first', 'show second']);
  });

  it("doesn't queue a key that's already waiting", async () => {
    const log: string[] = [];
    const first = controlledOverlay(log, 'first');
    const second = controlledOverlay(log, 'second');
    const duplicate = vi.fn(() => Promise.resolve());

    queue.enqueue('first', first.run);
    queue.enqueue('second', second.run);
    queue.enqueue('second', duplicate);
    await flush();
    first.dismiss();
    await flush();

    expect(second.run).toHaveBeenCalledTimes(1);
    expect(duplicate).not.toHaveBeenCalled();
  });

  it('runs a key again when it was queued while showing', async () => {
    const log: string[] = [];
    const showing = controlledOverlay(log, 'showing');
    const again = vi.fn(() => Promise.resolve());

    queue.enqueue('changes', showing.run);
    await flush();
    queue.enqueue('changes', again);
    showing.dismiss();
    await flush();

    expect(again).toHaveBeenCalledTimes(1);
  });

  it('moves on when an overlay shows nothing or fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const nothing = vi.fn(() => Promise.resolve());
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    const last = vi.fn(() => Promise.resolve());

    queue.enqueue('nothing', nothing);
    queue.enqueue('failing', failing);
    queue.enqueue('last', last);
    await flush();

    expect(last).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('overlay_queue.run_failed', {
      key: 'failing',
      error: 'boom',
    });
    consoleError.mockRestore();
  });
});
