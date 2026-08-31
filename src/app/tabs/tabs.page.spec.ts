import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TabStateService } from '../core/services/tab-state.service';
import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;
  let tabStateService: TabStateService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    TestBed.overrideComponent(TabsPage, { set: { template: '<div></div>', styleUrls: [] } });
    await TestBed.compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    tabStateService = TestBed.inject(TabStateService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onTabChange persists a recognized tab', () => {
    const setLastActiveTab = vi.spyOn(tabStateService, 'setLastActiveTab');

    component.onTabChange({ tab: 'calendar' });

    expect(setLastActiveTab).toHaveBeenCalledWith('calendar');
  });

  it('onTabChange ignores an unrecognized tab id', () => {
    const setLastActiveTab = vi.spyOn(tabStateService, 'setLastActiveTab');

    component.onTabChange({ tab: 'something-else' });

    expect(setLastActiveTab).not.toHaveBeenCalled();
  });
});
