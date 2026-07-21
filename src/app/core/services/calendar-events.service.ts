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

export { getEventTypeInfo } from './calendar-event-type-info.util';

/**
 * `PokeDataService`'s analog for Pokemon GO calendar events — reads only
 * from `StorageEngine` (network fetch + freshness check live in
 * `SyncService.pullCalendarEvents()`/`pullSeason()`), matching how the
 * catalog fetch/read split already works in this app.
 */
@Injectable({
  providedIn: 'root',
})
export class CalendarEventsService {
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private _events: readonly PogoEvent[] = [];
  private _eventMetadata: Readonly<Record<string, EventMetadata>> = {};
  private _season: Season | undefined;

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
    return from(this.engine.listCalendarEvents()).pipe(
      map((storedEvents) => {
        const expanded = storedEvents.flatMap((event) => [
          event,
          ...generateEventRaidHourSubEvents(event),
          ...generateEventSpotlightSubEvents(event),
        ]);

        const now = dayjs();
        const metadata: Record<string, EventMetadata> = {};
        for (const event of expanded) {
          metadata[event.eventID] = buildEventMetadata(event, now);
        }

        this._events = expanded;
        this._eventMetadata = metadata;
        return this._events;
      }),
      shareReplay(1)
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
