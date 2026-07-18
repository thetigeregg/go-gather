import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChipListInputComponent } from './chip-list-input.component';

describe('ChipListInputComponent', () => {
  let fixture: ComponentFixture<ChipListInputComponent>;
  let component: ChipListInputComponent;
  let emitted: string[][];

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(ChipListInputComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(ChipListInputComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.valuesChange.subscribe((values) => emitted.push(values));
  });

  it('emits the values array with the trimmed draft appended', () => {
    component.values = ['existing'];
    component.draft = '  new value  ';

    component.addFromDraft();

    expect(emitted).toEqual([['existing', 'new value']]);
    expect(component.draft).toBe('');
  });

  it('does not emit for a blank or whitespace-only draft', () => {
    component.values = ['existing'];
    component.draft = '   ';

    component.addFromDraft();

    expect(emitted).toEqual([]);
  });

  it('removes the value at the given index', () => {
    component.values = ['a', 'b', 'c'];

    component.removeAt(1);

    expect(emitted).toEqual([['a', 'c']]);
  });
});
