import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AvailabilityStatus } from '@go-gather/shared';
import { environment } from '../../../environments/environment';

/**
 * Loads the health of each Bulbapedia dataset the server reads release data
 * from (see `GET /api/availability-status` in server/src/api.ts), for the
 * Settings page. A direct `HttpClient` call rather than going through
 * `StorageEngine`, like `SearchConfigService`: it's live server state worth
 * re-reading on every visit, not data to cache or sync.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityStatusService {
  private readonly http = inject(HttpClient);

  loadStatus(): Observable<AvailabilityStatus[]> {
    return this.http.get<AvailabilityStatus[]>(`${environment.apiUrl}/api/availability-status`);
  }
}
