import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Meta924Kpis } from '../../controllers/meta-924-kpis';
import {
  formatDecimal,
  formatHours,
  formatInteger,
  joinWithAnd,
  plural,
} from '../../formatters/number.formatters';
import { UiTone, autonomyTone } from '../../mappers/ui-tone.mapper';

interface Stat {
  id: string;
  label: string;
  value: string;
  unit: string;
  caption: string;
  /** Só pinta o número quando ele é o alarme. */
  valueTone: UiTone;
  captionTone: UiTone;
  /** A legenda vira link para a seção com o detalhe do indicador. */
  opensDetail: boolean;
}

interface StatusPhrase {
  text: string;
  tone: UiTone;
}

/** Une o número à palavra seguinte: "2" nunca fica sozinho no fim da linha. */
const NBSP = String.fromCharCode(0xa0);

const todayFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Resumo da situação em linguagem natural, seguido de quatro indicadores da
 * Meta 9.2.4. Sem cards e sem ícones: a hierarquia vem da tipografia, e a cor
 * só aparece no que está fora do controle.
 */
@Component({
  selector: 'app-kpi-summary-cards',
  imports: [MatIcon],
  templateUrl: './kpi-summary-cards.component.html',
  styleUrl: './kpi-summary-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiSummaryCardsComponent {
  readonly kpis = input.required<Meta924Kpis>();

  readonly showFleet = output<void>();

  protected readonly today = capitalize(todayFormat.format(new Date()));

  protected readonly headline = computed(() => {
    const k = this.kpis();
    return `${plural(k.populacaoAbrigada, 'pessoa abrigada', 'pessoas abrigadas')} em ${plural(k.totalAbrigos, 'abrigo', 'abrigos')}.`;
  });

  protected readonly statusPhrases = computed<StatusPhrase[]>(() => {
    const byStatus = this.kpis().abrigosPorStatus;
    const phrases: StatusPhrase[] = [];

    if (byStatus['COLAPSO LOGÍSTICO'] > 0) {
      phrases.push({
        text: `${byStatus['COLAPSO LOGÍSTICO']}${NBSP}em colapso logístico`,
        tone: 'critical',
      });
    }
    if (byStatus.SOBRECARGA > 0) {
      phrases.push({ text: `${byStatus.SOBRECARGA}${NBSP}em sobrecarga`, tone: 'neutral' });
    }
    if (byStatus.ATENÇÃO > 0) {
      phrases.push({ text: `${byStatus.ATENÇÃO}${NBSP}em atenção`, tone: 'neutral' });
    }
    return phrases;
  });

  protected readonly stats = computed<Stat[]>(() => {
    const k = this.kpis();
    return [scarcestSupply(k), decisionTime(k), fleet(k), vulnerable(k)];
  });

  /** Vírgulas e "e" entre as frases, como numa frase escrita à mão. */
  protected separatorAfter(index: number, total: number): string {
    if (index === total - 1) return '.';
    return index === total - 2 ? ' e ' : ', ';
  }
}

function scarcestSupply(k: Meta924Kpis): Stat {
  const critical = k.autonomiaCritica;
  if (!critical) {
    return {
      id: 'autonomia',
      label: 'Menor autonomia',
      value: 'Plena',
      unit: '',
      caption: 'Nenhum abrigo ocupado',
      valueTone: 'neutral',
      captionTone: 'neutral',
      opensDetail: false,
    };
  }

  const tone = autonomyTone(critical.horas);
  const [value, unit] = formatHours(critical.horas).split(' ');
  return {
    id: 'autonomia',
    label: 'Menor autonomia',
    value,
    unit,
    caption: `${capitalize(critical.item)} em ${critical.abrigoNome}`,
    valueTone: tone === 'critical' ? 'critical' : 'neutral',
    captionTone: 'neutral',
    opensDetail: false,
  };
}

function decisionTime(k: Meta924Kpis): Stat {
  if (k.tempoDecisaoMedioMin === null) {
    return {
      id: 'decisao',
      label: 'Tempo de decisão',
      value: '0',
      unit: 'min',
      caption: 'Nenhuma ordem registrada',
      valueTone: 'neutral',
      captionTone: 'neutral',
      opensDetail: false,
    };
  }

  const over = k.tempoDecisaoMedioMin - k.metaTempoDecisaoMin;
  return {
    id: 'decisao',
    label: 'Tempo de decisão',
    value: formatDecimal(k.tempoDecisaoMedioMin),
    unit: 'min',
    caption:
      over > 0
        ? `${formatDecimal(over)} min acima da meta de ${k.metaTempoDecisaoMin} min`
        : `Dentro da meta de ${k.metaTempoDecisaoMin} min`,
    valueTone: 'neutral',
    captionTone: over > 0 ? 'warning' : 'neutral',
    opensDetail: false,
  };
}

function fleet(k: Meta924Kpis): Stat {
  const busy = [
    k.frotaEmMissao > 0 ? `${k.frotaEmMissao} em missão` : '',
    k.frotaManutencao > 0 ? `${k.frotaManutencao} em manutenção` : '',
  ].filter(Boolean);

  return {
    id: 'frota',
    label: 'Frota pronta',
    value: `${k.frotaDisponivel}`,
    unit: `de ${k.frotaTotal}`,
    caption: busy.length > 0 ? capitalize(joinWithAnd(busy)) : 'Toda a frota disponível',
    valueTone: k.frotaDisponivel === 0 ? 'critical' : 'neutral',
    captionTone: 'neutral',
    opensDetail: true,
  };
}

function vulnerable(k: Meta924Kpis): Stat {
  const share =
    k.populacaoAbrigada > 0
      ? Math.min(100, Math.round((k.vulneraveis / k.populacaoAbrigada) * 100))
      : 0;

  return {
    id: 'vulneraveis',
    label: 'Pessoas vulneráveis',
    value: formatInteger(k.vulneraveis),
    unit: '',
    caption: `${share}% dos abrigados, além de ${formatInteger(k.pets)} pets`,
    valueTone: 'neutral',
    captionTone: 'neutral',
    opensDetail: false,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
