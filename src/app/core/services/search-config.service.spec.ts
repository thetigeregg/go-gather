import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchConfigService } from './search-config.service';

describe('SearchConfigService', () => {
  let service: SearchConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SearchConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('defaults costumeGenderEnabled to true and exclusions to empty before loading', () => {
    expect(service.costumeGenderEnabled).toBe(true);
    expect(service.implicitlyExcludedSearchTerms).toEqual([]);
  });

  it('loadConfig fetches from GET /api/search-config and hydrates the getters', async () => {
    const loadPromise = new Promise((resolve) => {
      service.loadConfig().subscribe(resolve);
    });

    const req = httpMock.expectOne('http://localhost:3000/api/search-config');
    expect(req.request.method).toBe('GET');
    req.flush({
      implicitlyExcludedSearchTerms: [{ kind: 'keyword', value: 'shadow', enabled: true }],
      costumeGenderEnabled: false,
    });

    await loadPromise;

    expect(service.costumeGenderEnabled).toBe(false);
    expect(service.implicitlyExcludedSearchTerms).toEqual([
      { kind: 'keyword', value: 'shadow', enabled: true },
    ]);
  });
});
