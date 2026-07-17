import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PresetQueriesPage } from './preset-queries.page';

describe('PresetQueriesPage', () => {
  let component: PresetQueriesPage;
  let fixture: ComponentFixture<PresetQueriesPage>;

  beforeEach(() => {
    TestBed.overrideComponent(PresetQueriesPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    fixture = TestBed.createComponent(PresetQueriesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
