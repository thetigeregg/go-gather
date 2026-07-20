import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiSearchStringComponent } from './multi-search-string.component';
import { SearchStringComponent } from '../search-string/search-string.component';

describe('MultiSearchStringComponent', () => {
  let fixture: ComponentFixture<MultiSearchStringComponent>;
  let component: MultiSearchStringComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(MultiSearchStringComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(SearchStringComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(MultiSearchStringComponent);
    component = fixture.componentInstance;
  });

  it('accepts the configs input', () => {
    component.configs = [
      { name: 'Male (Non-Shiny)', value: 'male-string' },
      { name: 'Female (Non-Shiny)', value: 'female-string' },
    ];

    expect(() => {
      fixture.detectChanges();
    }).not.toThrow();
    expect(component.configs).toHaveLength(2);
  });
});
