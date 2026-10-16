# Regras de negócio

Como o motor prescritivo calcula autonomia, risco, explicabilidade e prescrição, e o que acontece em cada operação do repositório.

[Voltar ao README](../README.md)

---

## Consumo por habitante

Todas as taxas vivem em `DAILY_CONSUMPTION`, no use case, e são convertidas
para consumo por hora.

| Item | Taxa diária |
| --- | --- |
| Água | 15 L por pessoa (mínimo do Projeto Esfera) e 1,5 L por pet |
| Refeições | 3 por pessoa |
| Kits médicos | 0,02 por pessoa, mais 0,08 por idoso, 0,04 por criança e 0,06 por PcD |

Pets não ocupam vaga e não comem refeições humanas, mas bebem água. Idosos,
crianças e PcD já estão contados na ocupação; a taxa extra de kits médicos é
somada à taxa base.

---

## Autonomia

```
autonomia (h) = estoque / consumo por hora
```

Uma casa decimal. Sem consumo (abrigo vazio), a autonomia fica no teto de
720 h, para a tela nunca mostrar "Infinity".

---

## Risco de colapso

Cada fator é normalizado entre 0 (sem pressão) e 1 (pressão máxima):

| Fator | Peso | Cálculo |
| --- | --- | --- |
| `taxaOcupacao` | 30% | ocupação / capacidade, limitado a 1 |
| `burnRateSuprimentos` | 35% | 1 menos (menor autonomia / 72 h), limitado entre 0 e 1 |
| `indiceVulnerabilidade` | 20% | (idosos + crianças + PcD + pets × 0,25) / ocupação, saturando em 60% |
| `isolamentoViario` | 15% | Livre 0, Restrito 0,5, Isolado 1 |

```
risco = arredondar(Σ peso × fator × 100)
```

Dois pisos impedem que a média dilua uma situação grave:

| Situação | Piso |
| --- | --- |
| Ocupação acima da capacidade | 60 |
| Menor autonomia em 12 h ou menos, com gente no abrigo | 80 |

### Status

| Risco | Status |
| --- | --- |
| 80 a 100 | Colapso Logístico |
| 60 a 79 | Sobrecarga |
| 35 a 59 | Atenção |
| 0 a 34 | Estável |

---

## Explicabilidade

`aiExplainability` responde "por que este risco?". Cada fator recebe a sua
fatia da contribuição total:

```
fatia = (peso × fator) / Σ (peso × fator) × 100
```

As fatias são convertidas em inteiros pelo método do maior resto, então a soma
é **sempre exatamente 100**, sem o "99%" ou "101%" que um arredondamento simples
produziria. Com risco zero, a explicação mostra os pesos base (30, 35, 20, 15),
para a tela nunca exibir quatro zeros.

Quando um piso foi aplicado, a explicabilidade continua mostrando a proporção
entre os fatores; o piso aparece na justificativa da prescrição.

---

## Prescrição logística

A meta é fechar **72 h de autonomia** em todos os itens.

```
déficit = max(0, consumo por hora × 72 - estoque)
```

| Item | Arredondamento |
| --- | --- |
| Água | Para cima, em múltiplos de 20 L (galão fechado) |
| Refeições | Para cima, por unidade |
| Kits médicos | Para cima, por unidade |

O peso da carga usa 1 kg por litro de água, 0,5 kg por refeição e 2,5 kg por kit
médico.

### Escolha do veículo

1. Só entram veículos `DISPONÍVEL` cujo modal alcança o abrigo. Abrigo isolado
   aceita apenas fluvial e aéreo.
2. Vence quem leva a carga em **menos viagens**.
3. Empatando, quem já está no **município do abrigo**.
4. Empatando, o **modal mais barato**: terrestre, fluvial e, por último, aéreo.
5. Empatando, a **menor capacidade** que resolve, para não prender um caminhão
   grande numa entrega pequena.

Sem veículo possível, a prescrição sai sem veículo e pede apoio da esfera
estadual ou federal.

### Prescrição geral

`execute()` avalia todos os abrigos, ordena do maior risco para o menor e
prescreve em sequência, reservando cada veículo escolhido. O abrigo mais
crítico escolhe primeiro e nenhum veículo é prometido duas vezes.

Com o seed padrão, o resultado é:

| Abrigo | Risco | Status | Envio | Veículo |
| --- | --- | --- | --- | --- |
| Ginásio Municipal de Muçum | 90 | Colapso Logístico | 13.200 L, 2.178 refeições, 26 kits | ARCANJO-03, 15 viagens |
| Pavilhão da Vila Germânica | 61 | Sobrecarga | 13.540 L, 2.008 refeições, 22 kits | ABTS-01, 3 viagens |
| Escola Estadual Petrópolis | 59 | Atenção | 2.420 L, 412 refeições | EMB-07, 4 viagens |
| Centro Comunitário de Jaboatão | 33 | Estável | Nenhum | |

---

## Check-in

- Ao menos uma pessoa por check-in; todos os números inteiros e não negativos.
- Idosos mais crianças não passam do total de pessoas; PcD também não.
- Pets são somados à parte.
- O check-in é aceito mesmo acima da capacidade. A sobrecarga aparece no risco.
- O abrigo é reavaliado na mesma gravação.

---

## Ordem de despacho

`registerDispatchOrder` é atômica: tudo é calculado antes da primeira
gravação, e qualquer regra violada lança `DomainError` sem alterar o disco.

| Validação | Erro |
| --- | --- |
| Abrigo inexistente | `SHELTER_NOT_FOUND` |
| Veículo inexistente | `VEHICLE_NOT_FOUND` |
| Veículo em missão ou em manutenção | `VEHICLE_UNAVAILABLE` |
| Modal que não alcança o abrigo | `INVALID_DISPATCH` |
| Itens negativos, fracionados ou todos zerados | `INVALID_DISPATCH` |

Efeitos, numa única operação:

1. A ordem entra no histórico com protocolo `S2ID-PC-UF-AAAA-NNNNNN`.
2. O estoque do abrigo recebe os itens e o abrigo é reavaliado.
3. O veículo passa para `EM MISSÃO`, "Em rota para" o abrigo.

Neste MVP a entrega é considerada imediata: o estoque sobe no registro da
ordem, não na chegada do veículo.

---

## Fila de sincronização offline

- Em modo offline, a ordem é gravada com `sincronizadoNuvem: false`.
- `getSyncQueue()` lista as pendentes, da mais antiga para a mais recente.
- `syncPendingOrders()` não faz nada em modo offline.
- Desligar o modo offline descarrega a fila automaticamente, como faria o
  service worker ao reconectar.
- O seed abre com uma ordem pendente, para a fila não começar vazia.

---

## Simulação de pico de emergência

Cada pico aplica, a todos os abrigos:

1. **Chegada em massa** de 18% da capacidade, com 20% de idosos, 25% de
   crianças, 6% de PcD e pets na proporção de 12%.
2. **Agravamento do acesso**: Livre vira Restrito e Restrito vira Isolado.
3. **12 h sem reposição**, consumidas já com a nova ocupação.
4. **Reavaliação** de autonomia, risco, status e explicabilidade.

O contador de picos e o horário do último ficam em `s2id_pro_simulation`. O
reset volta tudo ao seed.
