import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  style: './app.scss'
})
export class App {
  protected readonly title = signal('s2id-erp-contingencia');
}
