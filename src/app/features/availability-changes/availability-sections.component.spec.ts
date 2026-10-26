import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvailabilitySectionsComponent } from './availability-sections.component';

describe('AvailabilitySectionsComponent', () => {
  let fixture: ComponentFixture<AvailabilitySectionsComponent>;
  let component: AvailabilitySectionsComponent;

  beforeEach(async () => {
    TestBed.overrideComponent(AvailabilitySectionsComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(AvailabilitySectionsComponent);
    component = fixture.componentInstance;
  });

  it('starts with no sections', () => {
    expect(component.sections).toEqual([]);
  });

  it('titles each section', () => {
    expect(component.sectionTitle('available')).toBe('Now available');
    expect(component.sectionTitle('announced')).toBe('Announced');
    expect(component.sectionTitle('unavailable')).toBe('No longer available');
  });

  it("labels groups with the side menu's pokedex names", () => {
    expect(component.pokedexLabel('regular')).toBe('Regular Pokedex');
    expect(component.pokedexLabel('dmax')).toBe('DMax Pokedex');
  });

  it('formats a release date as a local month and day', () => {
    expect(component.formatDate('2026-11-06')).toBe(
      new Date(2026, 10, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    );
  });
});
