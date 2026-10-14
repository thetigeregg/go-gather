import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AlertController } from '@ionic/angular/standalone';
import { ChipListInputComponent } from './chip-list-input.component';

describe('ChipListInputComponent', () => {
  let fixture: ComponentFixture<ChipListInputComponent>;
  let component: ChipListInputComponent;
  let emitted: string[][];
  let alertCreateSpy: ReturnType<typeof vi.fn>;
  let alertPresentSpy: ReturnType<typeof vi.fn>;
  let lastAlertOptions: {
    message: string;
    buttons: { text: string; role?: string; handler?: () => void }[];
  } | null;

  beforeEach(async () => {
    alertPresentSpy = vi.fn().mockResolvedValue(undefined);
    lastAlertOptions = null;
    alertCreateSpy = vi.fn().mockImplementation((options: NonNullable<typeof lastAlertOptions>) => {
      lastAlertOptions = options;
      return Promise.resolve({ present: alertPresentSpy });
    });

    TestBed.configureTestingModule({
      providers: [{ provide: AlertController, useValue: { create: alertCreateSpy } }],
    });
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

  it('displays values as-is by default', () => {
    expect(component.labelFn('raw value')).toBe('raw value');
  });

  describe('confirmRemove', () => {
    it('presents a confirmation alert showing the formatted label, without emitting yet', async () => {
      component.values = ['a', '25', 'c'];
      component.labelFn = (value) => `#${value}`;

      await component.confirmRemove(1);

      expect(alertCreateSpy).toHaveBeenCalledOnce();
      expect(lastAlertOptions?.message).toBe('Remove "#25"?');
      expect(alertPresentSpy).toHaveBeenCalledOnce();
      expect(emitted).toEqual([]);
    });

    it('removes the entry when the destructive button is confirmed', async () => {
      component.values = ['a', 'b', 'c'];

      await component.confirmRemove(1);
      const removeButton = lastAlertOptions?.buttons.find(
        (button) => button.role === 'destructive'
      );
      removeButton?.handler?.();

      expect(emitted).toEqual([['a', 'c']]);
    });

    function confirmRemoval(): void {
      lastAlertOptions?.buttons.find((button) => button.role === 'destructive')?.handler?.();
    }

    it('removes the originally selected entry even if the list shifts before confirming', async () => {
      component.values = ['25', '150', '493'];

      await component.confirmRemove(1);
      // e.g. the alert blurred the input and a lower dex number was added
      component.values = ['7', '25', '150', '493'];
      confirmRemoval();

      expect(emitted).toEqual([['7', '25', '493']]);
    });

    it('removes the same duplicate occurrence that was selected', async () => {
      component.values = ['x', 'a', 'x'];

      await component.confirmRemove(2);
      component.values = ['b', 'x', 'a', 'x'];
      confirmRemoval();

      expect(emitted).toEqual([['b', 'x', 'a']]);
    });

    it('does nothing if the selected entry is gone by the time it is confirmed', async () => {
      component.values = ['a', 'b'];

      await component.confirmRemove(1);
      component.values = ['a'];
      confirmRemoval();

      expect(emitted).toEqual([]);
    });

    it('offers a cancel button with no handler', async () => {
      component.values = ['a'];

      await component.confirmRemove(0);
      const cancelButton = lastAlertOptions?.buttons.find((button) => button.role === 'cancel');

      expect(cancelButton?.handler).toBeUndefined();
      expect(emitted).toEqual([]);
    });
  });
});
