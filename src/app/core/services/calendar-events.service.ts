import { Injectable, inject } from '@angular/core';
import dayjs from 'dayjs';
import { Observable, from, map, shareReplay } from 'rxjs';
import { EventMetadata, PogoEvent, Season } from '@go-gather/shared';
import { StorageEngine } from '../data/storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { buildEventMetadata } from './calendar-event-metadata.util';
import {
  generateEventRaidHourSubEvents,
  generateEventSpotlightSubEvents,
} from './calendar-sub-events.util';
import { SyncService } from './sync.service';

export { getEventTypeInfo } from './calendar-event-type-info.util';

/**
 * `PokeDataService`'s analog for Pokemon GO calendar events — reads only
 * from `StorageEngine` (network fetch + freshness check live in
 * `SyncService.pullCalendarEvents()`/`pullSeason()`), matching how the
 * catalog fetch/read split already works in this app.
 *
 * The `StorageEngine` read + sub-event expansion (`expandedEvents$`) is
 * cached across calls to `loadCalendarEvents()` — it's pure and doesn't
 * depend on the current time, so re-running it on every view mount (e.g.
 * `CalendarViewComponent` mounting, then getting swapped for
 * `TimelineViewComponent` once the saved view preference resolves — see
 * `calendar.page.ts`) was pure waste. It's invalidated only when
 * `SyncService` actually pulls new calendar-events data from the server.
 * `EventMetadata` itself is still rebuilt fresh on every call (off a live
 * `dayjs()`), since `isPastEvent`/`isFutureEvent` are genuinely time-
 * sensitive and read directly by `timeline-categories.util.ts`/
 * `single-day-event.component.ts` — caching those would let them go stale.
 */
@Injectable({
  providedIn: 'root',
})
export class CalendarEventsService {
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private readonly syncService = inject(SyncService);
  private _events: readonly PogoEvent[] = [];
  private _eventMetadata: Readonly<Record<string, EventMetadata>> = {};
  private _season: Season | undefined;
  private expandedEvents$: Observable<readonly PogoEvent[]> | null = null;

  constructor() {
    this.syncService.listenForCalendarEventsSync().subscribe(() => {
      this.expandedEvents$ = null;
    });
  }

  private get engine(): StorageEngine {
    return this.storageEngineFactory.getEngine();
  }

  get events(): readonly PogoEvent[] {
    return this._events;
  }

  get eventMetadata(): Readonly<Record<string, EventMetadata>> {
    return this._eventMetadata;
  }

  get season(): Season | undefined {
    return this._season;
  }

  loadCalendarEvents(): Observable<readonly PogoEvent[]> {
    this.expandedEvents$ ??= from(this.engine.listCalendarEvents()).pipe(
      map((storedEvents) =>
        storedEvents.flatMap((event) => [
          event,
          ...generateEventRaidHourSubEvents(event),
          ...generateEventSpotlightSubEvents(event),
        ])
      ),
      shareReplay(1)
    );

    return this.expandedEvents$.pipe(
      map((expanded) => {
        const now = dayjs();
        const metadata: Record<string, EventMetadata> = {};
        for (const event of expanded) {
          metadata[event.eventID] = buildEventMetadata(event, now);
        }

        this._events = expanded;
        this._eventMetadata = metadata;
        return this._events;
      })
    );
  }

  loadSeason(): Observable<Season | undefined> {
    return from(this.engine.getSeason()).pipe(
      map((season) => {
        this._season = season;
        return this._season;
      }),
      shareReplay(1)
    );
  }
}
