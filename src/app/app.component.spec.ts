import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('should create the app', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    TestBed.overrideComponent(AppComponent, { set: { template: '<div></div>' } });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
