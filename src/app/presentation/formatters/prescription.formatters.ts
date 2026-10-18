import { isEmptyLoad } from '../../domain/entities/dispatch-order.entity';
import { Shelter } from '../../domain/entities/shelter.entity';
import { LogisticsPrescription } from '../../domain/use-cases/prescriptive-logistics-ai.use-case';
import { SUPPLY_LABELS, scarcestSupply } from '../mappers/ui-tone.mapper';
import { formatHours, formatInteger, joinWithAnd, plural } from './number.formatters';

/** "Água acaba em 11,1 h." */
export function describeShortage(shelter: Shelter): string {
  const { key, hours } = scarcestSupply(shelter);
  const verb = key === 'alimentos' ? 'acabam' : 'acaba';
  return `${SUPPLY_LABELS[key]} ${verb} em ${formatHours(hours)}.`;
}

/** "13.200 L de água, 2.178 refeições e 26 kits médicos." */
export function describeCargo(prescription: LogisticsPrescription): string {
  const { aguaLitros, refeicoes, kitsMedicos } = prescription.itens;
  return joinWithAnd(
    [
      aguaLitros > 0 ? `${formatInteger(aguaLitros)} L de água` : '',
      refeicoes > 0 ? plural(refeicoes, 'refeição', 'refeições') : '',
      kitsMedicos > 0 ? plural(kitsMedicos, 'kit médico', 'kits médicos') : '',
    ].filter(Boolean),
  );
}

/** A recomendação inteira numa frase, pronta para ler em voz alta numa sala de situação. */
export function describeRecommendation(prescription: LogisticsPrescription): string {
  const hasTransit = !isEmptyLoad(prescription.emTransito);

  if (!prescription.necessitaEnvio) {
    const source = hasTransit ? 'O estoque e a carga a caminho cobrem' : 'Os suprimentos cobrem';
    return `${source} as próximas ${prescription.horizonteHoras} h. Nenhum envio necessário.`;
  }

  const lead = hasTransit
    ? 'Além da carga a caminho, a IA recomenda enviar'
    : 'A IA recomenda enviar';
  const cargo = describeCargo(prescription);
  if (!prescription.veiculo) {
    return `${lead} ${cargo}, mas nenhum veículo disponível alcança o abrigo.`;
  }
  return `${lead} ${cargo} pelo ${prescription.veiculo.prefixo}, em ${plural(prescription.viagensNecessarias, 'viagem', 'viagens')}.`;
}
