import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchStringsPage } from './search-strings.page';

describe('SearchStringsPage', () => {
  let component: SearchStringsPage;
  let fixture: ComponentFixture<SearchStringsPage>;

  beforeEach(() => {
    TestBed.overrideComponent(SearchStringsPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    fixture = TestBed.createComponent(SearchStringsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
