import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastController } from '@ionic/angular/standalone';
import { Clipboard } from '@capacitor/clipboard';
import { SearchStringComponent } from './search-string.component';

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: { write: vi.fn().mockResolvedValue(undefined) },
}));

describe('SearchStringComponent', () => {
  let fixture: ComponentFixture<SearchStringComponent>;
  let component: SearchStringComponent;
  let presentSpy: ReturnType<typeof vi.fn>;
  let createSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    presentSpy = vi.fn().mockResolvedValue(undefined);
    createSpy = vi.fn().mockResolvedValue({ present: presentSpy });

    TestBed.configureTestingModule({
      providers: [{ provide: ToastController, useValue: { create: createSpy } }],
    });
    TestBed.overrideComponent(SearchStringComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SearchStringComponent);
    component = fixture.componentInstance;
    component.config = { name: 'Default (Non-Shiny)', value: '!shiny&+bulbasaur' };
  });

  it('toggleExpanded flips the expanded flag', () => {
    expect(component.expanded).toBe(false);

    component.toggleExpanded();
    expect(component.expanded).toBe(true);

    component.toggleExpanded();
    expect(component.expanded).toBe(false);
  });

  it('copy writes the config value to the clipboard and shows a toast', async () => {
    await component.copy();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked static method, not called unbound
    expect(Clipboard.write).toHaveBeenCalledWith({ string: '!shiny&+bulbasaur' });
    expect(createSpy).toHaveBeenCalledWith({
      message: 'Copied!',
      duration: 1000,
      position: 'middle',
    });
    expect(presentSpy).toHaveBeenCalled();
  });
});
