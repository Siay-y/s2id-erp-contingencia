import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ModalService } from '../../../core/ui/modal/modal.service';
import { EMPTY_SUPPLY_LOAD, SupplyLoad } from '../../../domain/entities/dispatch-order.entity';
import {
  ExplainabilityFactor,
  Shelter,
  occupancyRate,
} from '../../../domain/entities/shelter.entity';
import {
  AUTONOMY_TARGET_HOURS,
  LogisticsPrescription,
} from '../../../domain/use-cases/prescriptive-logistics-ai.use-case';
import { formatHours, formatInteger } from '../../formatters/number.formatters';
import { describeRecommendation, describeShortage } from '../../formatters/prescription.formatters';
import {
  ROAD_ACCESS_LABELS,
  SHELTER_STATUS_LABELS,
  SHELTER_STATUS_TONES,
  SUPPLY_LABELS,
  SupplyKey,
  UiTone,
  autonomyTone,
} from '../../mappers/ui-tone.mapper';

interface Metric {
  id: string;
  label: string;
  value: string;
  percent: number;
  tone: UiTone;
  caption: string;
}

const FACTORS: readonly { key: ExplainabilityFactor; label: string; caption: string }[] = [
  {
    key: 'burnRateSuprimentos',
    label: 'Consumo de suprimentos',
    caption: 'Quão longe da meta de 72 h está o item mais escasso',
  },
  { key: 'taxaOcupacao', label: 'Ocupação', caption: 'Pessoas em relação às vagas' },
  {
    key: 'indiceVulnerabilidade',
    label: 'Vulnerabilidade',
    caption: 'Idosos, crianças, PcD e pets na ocupação',
  },
  {
    key: 'isolamentoViario',
    label: 'Isolamento viário',
    caption: 'Quantos modais ainda alcançam o abrigo',
  },
];

const SUPPLY_ORDER: readonly SupplyKey[] = ['agua', 'alimentos', 'medicamentos'];

const FOCUSABLE = 'button:not([disabled]), [href], summary, [tabindex]:not([tabindex="-1"])';

const updatedFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Gaveta com tudo o que existe sobre um abrigo. A tela principal mostra só o
 * que pede ação; o detalhe fica aqui, a um clique. Na lateral no desktop, como
 * folha inferior no celular.
 */
@Component({
  selector: 'app-shelter-sheet',
  imports: [MatButton, MatIconButton, MatIcon],
  templateUrl: './shelter-sheet.component.html',
  styleUrl: './shelter-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ShelterSheetComponent {
  private readonly document = inject(DOCUMENT);
  private readonly modal = inject(ModalService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild.required('closeButton', {
    read: ElementRef<HTMLElement>,
  });

  readonly shelter = input.required<Shelter>();
  readonly prescription = input<LogisticsPrescription | null>(null);
  readonly inTransit = input<SupplyLoad | null>(null);
  readonly busy = input(false);
  readonly checkInPeople = input.required<number>();
  readonly consumptionHours = input.required<number>();

  readonly close = output<void>();
  readonly checkIn = output<void>();
  readonly consumeStock = output<void>();
  readonly executePrescription = output<void>();

  protected readonly tone = computed(() => SHELTER_STATUS_TONES[this.shelter().status]);
  protected readonly statusLabel = computed(() => SHELTER_STATUS_LABELS[this.shelter().status]);
  protected readonly targetHours = AUTONOMY_TARGET_HOURS;

  protected readonly place = computed(() => {
    const s = this.shelter();
    return `${s.municipio}/${s.uf} · ${s.baciaHidrografica} · ${ROAD_ACCESS_LABELS[s.acessoViario]}`;
  });

  protected readonly updatedAt = computed(() =>
    updatedFormat.format(new Date(this.shelter().atualizadoEm)),
  );

  protected readonly shortage = computed(() => describeShortage(this.shelter()));

  protected readonly recommendation = computed(() => {
    const p = this.prescription();
    return p ? describeRecommendation(p) : null;
  });

  protected readonly supplies = computed<Metric[]>(() => {
    const { autonomiaHoras, estoque } = this.shelter();
    const transit = this.inTransit() ?? EMPTY_SUPPLY_LOAD;
    const enRoute = (amount: number, unit: string): string =>
      amount > 0 ? ` · ${formatInteger(amount)}${unit} a caminho` : '';
    const stock: Record<SupplyKey, string> = {
      agua: `${formatInteger(estoque.aguaLitros)} L em estoque${enRoute(transit.aguaLitros, ' L')}`,
      alimentos: `${formatInteger(estoque.refeicoesUnidades)} refeições em estoque${enRoute(transit.refeicoes, '')}`,
      medicamentos: `${formatInteger(estoque.kitsMedicos)} kits médicos em estoque${enRoute(transit.kitsMedicos, '')}`,
    };

    return SUPPLY_ORDER.map((key) => ({
      id: key,
      label: SUPPLY_LABELS[key],
      value: formatHours(autonomiaHoras[key]),
      percent: Math.min(100, Math.round((autonomiaHoras[key] / AUTONOMY_TARGET_HOURS) * 100)),
      tone: autonomyTone(autonomiaHoras[key]),
      caption: stock[key],
    }));
  });

  protected readonly occupancy = computed<Metric>(() => {
    const s = this.shelter();
    const rate = occupancyRate(s);
    const free = s.capacidadeTotal - s.ocupacaoAtual;
    return {
      id: 'ocupacao',
      label: 'Ocupação',
      value: `${formatInteger(s.ocupacaoAtual)} de ${formatInteger(s.capacidadeTotal)}`,
      percent: Math.min(100, Math.round(rate * 100)),
      tone: rate > 1 ? 'critical' : rate >= 0.9 ? 'warning' : 'neutral',
      caption:
        free >= 0
          ? `${formatInteger(free)} ${free === 1 ? 'vaga livre' : 'vagas livres'}`
          : `${formatInteger(-free)} pessoas acima da capacidade`,
    };
  });

  protected readonly census = computed(() => {
    const { idosos, criancas, pcd, pets } = this.shelter().gruposVulneraveis;
    return [
      { label: 'Idosos', value: idosos },
      { label: 'Crianças', value: criancas },
      { label: 'PcD', value: pcd },
      { label: 'Pets', value: pets },
    ];
  });

  protected readonly factors = computed<Metric[]>(() => {
    const weights = this.shelter().aiExplainability;
    return FACTORS.map(({ key, label, caption }) => ({
      id: key,
      label,
      value: `${weights[key]}%`,
      percent: weights[key],
      tone: 'neutral' as const,
      caption,
    }));
  });

  constructor() {
    const previousFocus = this.document.activeElement as HTMLElement | null;
    this.document.body.classList.add('sheet-open');

    afterNextRender(() => this.closeButton().nativeElement.focus());

    inject(DestroyRef).onDestroy(() => {
      this.document.body.classList.remove('sheet-open');
      if (previousFocus?.isConnected) previousFocus.focus();
    });
  }

  /** A modal tem precedência: o ESC que fecha uma modal não fecha a gaveta junto. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.modal.isOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close.emit();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panel().nativeElement;
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = this.document.activeElement;

    if (event.shiftKey && (current === first || !panel.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !panel.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }
}
