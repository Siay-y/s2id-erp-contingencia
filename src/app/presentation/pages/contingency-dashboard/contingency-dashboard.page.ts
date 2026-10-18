import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ErpHeaderComponent } from '../../components/erp-header/erp-header.component';
import { FleetPanelComponent } from '../../components/fleet-panel/fleet-panel.component';
import { KpiSummaryCardsComponent } from '../../components/kpi-summary-cards/kpi-summary-cards.component';
import { PriorityDispatchCardComponent } from '../../components/priority-dispatch-card/priority-dispatch-card.component';
import { ShelterManagementPanelComponent } from '../../components/shelter-management-panel/shelter-management-panel.component';
import { ShelterSheetComponent } from '../../components/shelter-sheet/shelter-sheet.component';
import {
  ContingencyErpFacade,
  QUICK_CHECK_IN,
  QUICK_CONSUMPTION_HOURS,
} from '../../controllers/contingency-erp.facade';

/**
 * Única peça da tela que conhece o facade: liga signals a inputs e outputs a
 * métodos. O único estado próprio é se a gaveta de detalhe está aberta.
 */
@Component({
  selector: 'app-contingency-dashboard-page',
  imports: [
    ErpHeaderComponent,
    FleetPanelComponent,
    KpiSummaryCardsComponent,
    PriorityDispatchCardComponent,
    ShelterManagementPanelComponent,
    ShelterSheetComponent,
  ],
  templateUrl: './contingency-dashboard.page.html',
  styleUrl: './contingency-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContingencyDashboardPage {
  protected readonly facade = inject(ContingencyErpFacade);
  protected readonly sheetOpen = signal(false);
  private readonly fleetPanel = viewChild.required('fleetPanel', { read: ElementRef<HTMLElement> });
  protected readonly checkInPeople = QUICK_CHECK_IN.pessoas;
  protected readonly consumptionHours = QUICK_CONSUMPTION_HOURS;

  protected scrollToFleet(): void {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fleetPanel().nativeElement.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  protected openShelter(id: string): void {
    this.facade.selectShelter(id);
    this.sheetOpen.set(true);
  }

  protected closeShelter(): void {
    this.sheetOpen.set(false);
  }

  protected dispatch(shelterId?: string): void {
    void this.facade.executeAiPrescription(shelterId);
  }

  protected checkIn(shelterId: string): void {
    this.facade.registerCheckIn(shelterId, QUICK_CHECK_IN.pessoas, QUICK_CHECK_IN.vulneraveis);
  }

  protected consumeStock(shelterId: string): void {
    this.facade.consumeStock(shelterId, QUICK_CONSUMPTION_HOURS);
  }
}
