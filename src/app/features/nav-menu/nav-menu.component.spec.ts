import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { addIcons } from 'ionicons';
import { cog, pricetags, searchCircle, time } from 'ionicons/icons';
import { NavMenuComponent } from './nav-menu.component';

vi.mock('ionicons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ionicons')>()),
  addIcons: vi.fn(),
}));

describe('NavMenuComponent', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.overrideComponent(NavMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();
  });

  it("registers its items' icons", () => {
    TestBed.createComponent(NavMenuComponent);

    expect(addIcons).toHaveBeenCalledWith({ cog, pricetags, searchCircle, time });
  });
});
