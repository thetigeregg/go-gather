import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GatherPage } from './gather.page';

describe('GatherPage', () => {
  let component: GatherPage;
  let fixture: ComponentFixture<GatherPage>;

  beforeEach(() => {
    TestBed.overrideComponent(GatherPage, { set: { template: '<div></div>', styleUrls: [] } });
    fixture = TestBed.createComponent(GatherPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
