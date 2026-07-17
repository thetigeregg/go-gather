import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExploreContainerComponent } from './explore-container.component';

describe('ExploreContainerComponent', () => {
  let component: ExploreContainerComponent;
  let fixture: ComponentFixture<ExploreContainerComponent>;

  beforeEach(() => {
    TestBed.overrideComponent(ExploreContainerComponent, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    fixture = TestBed.createComponent(ExploreContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
