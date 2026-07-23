import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcludedSearchTerm } from '@go-gather/shared';
import { ExcludedSearchTermInputComponent } from './excluded-search-term-input.component';

describe('ExcludedSearchTermInputComponent', () => {
  let fixture: ComponentFixture<ExcludedSearchTermInputComponent>;
  let component: ExcludedSearchTermInputComponent;
  let emitted: ExcludedSearchTerm[][];

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(ExcludedSearchTermInputComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(ExcludedSearchTermInputComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.valuesChange.subscribe((values) => emitted.push(values));
  });

  it('adds a trimmed tag entry and resets the tag draft', () => {
    component.values = [{ kind: 'tag', value: 'Existing' }];
    component.draftKind = 'tag';
    component.draftTagValue = '  Trade  ';

    component.addFromDraft();

    expect(emitted).toEqual([
      [
        { kind: 'tag', value: 'Existing' },
        { kind: 'tag', value: 'Trade' },
      ],
    ]);
    expect(component.draftTagValue).toBe('');
  });

  it('does not emit for a blank or whitespace-only tag draft', () => {
    component.draftKind = 'tag';
    component.draftTagValue = '   ';

    component.addFromDraft();

    expect(emitted).toEqual([]);
  });

  it('adds a keyword entry from the selected keyword draft', () => {
    component.draftKind = 'keyword';
    component.draftKeywordValue = 'shadow';

    component.addFromDraft();

    expect(emitted).toEqual([[{ kind: 'keyword', value: 'shadow' }]]);
  });

  it('adds a size entry from the selected size draft', () => {
    component.draftKind = 'size';
    component.draftSizeValue = 'xxl';

    component.addFromDraft();

    expect(emitted).toEqual([[{ kind: 'size', value: 'xxl' }]]);
  });

  it('does not add an exact duplicate kind+value entry', () => {
    component.values = [{ kind: 'keyword', value: 'shadow' }];
    component.draftKind = 'keyword';
    component.draftKeywordValue = 'shadow';

    component.addFromDraft();

    expect(emitted).toEqual([]);
  });

  it('removes the entry at the given index', () => {
    component.values = [
      { kind: 'tag', value: 'a' },
      { kind: 'tag', value: 'b' },
      { kind: 'tag', value: 'c' },
    ];

    component.removeAt(1);

    expect(emitted).toEqual([
      [
        { kind: 'tag', value: 'a' },
        { kind: 'tag', value: 'c' },
      ],
    ]);
  });
});
