import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ModalComponent } from './core/ui/modal/modal.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ModalComponent],
  template: '<router-outlet /><app-modal />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
