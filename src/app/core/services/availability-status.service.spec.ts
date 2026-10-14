import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AvailabilityStatus } from '@go-gather/shared';
import { AvailabilityStatusService } from './availability-status.service';

describe('AvailabilityStatusService', () => {
  let service: AvailabilityStatusService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AvailabilityStatusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loadStatus fetches from GET /api/availability-status', async () => {
    const status: AvailabilityStatus[] = [
      {
        dataset: 'shiny',
        fetchedAt: '2026-10-01T08:00:00.000Z',
        lastAttemptAt: '2026-10-02T08:00:00.000Z',
        lastError: 'Bulbapedia: 503',
        stale: false,
      },
    ];
    const loaded = new Promise((resolve) => {
      service.loadStatus().subscribe(resolve);
    });

    const req = httpMock.expectOne('http://localhost:3000/api/availability-status');
    expect(req.request.method).toBe('GET');
    req.flush(status);

    await expect(loaded).resolves.toEqual(status);
  });
});
