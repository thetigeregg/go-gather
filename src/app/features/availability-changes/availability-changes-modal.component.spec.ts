import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ModalController } from '@ionic/angular/standalone';
import { AvailabilityChangesModalComponent } from './availability-changes-modal.component';
import { AvailabilitySectionsComponent } from './availability-sections.component';

describe('AvailabilityChangesModalComponent', () => {
  let fixture: ComponentFixture<AvailabilityChangesModalComponent>;
  let component: AvailabilityChangesModalComponent;
  let dismiss: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dismiss = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: { dismiss } }],
    });
    TestBed.overrideComponent(AvailabilityChangesModalComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(AvailabilitySectionsComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(AvailabilityChangesModalComponent);
    component = fixture.componentInstance;
  });

  it('starts with no sections', () => {
    expect(component.sections).toEqual([]);
  });

  it('dismisses the modal', () => {
    component.dismiss();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
