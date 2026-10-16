# Arquitetura e convenções

Como o projeto é organizado: camadas, pastas, persistência, modelo de dados e convenções de código.

[Voltar ao README](../README.md)

---

## Estrutura do projeto

```
s2id-erp-contingencia/
├── public/
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── domain/                       Regras de negócio, sem Angular e sem armazenamento
│   │   │   ├── entities/                 Abrigo, veículo, ordem de despacho, estado da simulação
│   │   │   │                             e as funções puras de cada um (check-in, abastecimento...)
│   │   │   ├── errors/                   DomainError, com código para a interface tratar
│   │   │   ├── repositories/             ContingencyRepository (contrato abstrato)
│   │   │   ├── shared/                   Arredondamentos e validações numéricas
│   │   │   └── use-cases/                PrescriptiveLogisticsAiUseCase (motor prescritivo)
│   │   ├── data/                         Implementações concretas do contrato
│   │   │   ├── repositories/             LocalStorageContingencyRepository
│   │   │   ├── seed/                     Abrigos, frota e ordens iniciais
│   │   │   ├── storage/                  JsonStorage e as chaves do localStorage
│   │   │   └── provide-contingency-data.ts   Raiz de composição (liga contrato e implementação)
│   │   ├── app.config.ts                 Providers, locale pt-BR e fonte dos ícones
│   │   ├── app.routes.ts                 Rotas (preenchidas nas próximas etapas)
│   │   └── app.ts                        Componente raiz
│   ├── styles/
│   │   ├── _tokens.scss                  Paleta, raios, sombras, espaçamento, motion, fontes
│   │   ├── _reset.scss                   Reset mínimo
│   │   ├── _typography.scss              Escala tipográfica e Material Symbols
│   │   ├── _animations.scss              fade-in-up, pulse-subtle, card-hover, skeleton
│   │   ├── _material.scss                Tema Material 3 e overrides de componentes
│   │   └── _utilities.scss               Container, cards, badges de ícone, tons, grids
│   ├── index.html
│   ├── main.ts / main.server.ts / server.ts
│   └── styles.scss
├── docs/
├── angular.json
├── LICENSE
├── package.json
└── tsconfig.json
```

---

## Camadas

A separação segue Clean Architecture. As dependências apontam sempre para
dentro: a apresentação conhece o domínio, a camada `data` conhece o domínio, e
o domínio não conhece ninguém.

| Camada | Pode importar | Não pode importar |
| --- | --- | --- |
| `domain` | Apenas o próprio `domain` | Angular, `data`, componentes, `localStorage` |
| `data` | `domain`, `@angular/core` | Componentes e telas |
| Apresentação | `domain` (contrato, entidades, use case) | `data` diretamente |

### Inversão de dependência

`ContingencyRepository` é uma classe abstrata, não uma interface, porque
interfaces somem na compilação e não servem de token de injeção. A tela pede
`inject(ContingencyRepository)` e recebe a implementação escolhida em
`provideContingencyData()`. Trocar o `localStorage` por uma API é trocar uma
linha nessa função.

O use case não tem `@Injectable`: é uma classe TypeScript pura, entregue ao
Angular por `useFactory`. Isso mantém o domínio testável com `new`, sem
`TestBed`.

### Responsabilidades

| Peça | Responsabilidade |
| --- | --- |
| Entidades (`*.entity.ts`) | Tipos e funções puras de transição: `applyCheckIn`, `receiveSupplies`, `startMission`, `applyEmergencySurge`, validações |
| `PrescriptiveLogisticsAiUseCase` | Consumo, autonomia, risco, status, explicabilidade e prescrição |
| `ContingencyRepository` | Contrato de leitura, gravação, fila offline, simulação e reset |
| `LocalStorageContingencyRepository` | Orquestra entidades e motor e grava cada coleção como uma unidade |
| `JsonStorage` | JSON tipado sobre o `localStorage`, fallback em memória e evento entre abas |

### Reatividade

O contrato é síncrono e não expõe Signals, para o domínio não depender do
Angular. A ponte fica em `subscribe()`: o repositório avisa a cada gravação,
inclusive as feitas em outra aba, e a fachada da apresentação (próxima etapa)
relê os dados para dentro de um `signal()` e deriva o restante com `computed()`.

### SSR

O projeto mantém o SSR e a pré-renderização gerados pelo Angular CLI. No
servidor não existe `localStorage`, então o `JsonStorage` trabalha em memória e
o HTML pré-renderizado sai com o seed. No navegador, a hidratação assume e os
dados reais do dispositivo passam a valer.

---

## Persistência

| Chave | Conteúdo |
| --- | --- |
| `s2id_pro_shelters` | Abrigos, já com autonomia, risco, status e explicabilidade calculados |
| `s2id_pro_fleet` | Frota de resgate e suprimentos |
| `s2id_pro_orders` | Ordens de despacho, da mais recente para a mais antiga |
| `s2id_pro_offline_mode` | `true` quando o modo offline está ativo |
| `s2id_pro_simulation` | Quantos picos foram simulados e quando foi o último |
| `s2id_pro_theme` | Tema escolhido: `system`, `light` ou `dark` (lido no `index.html`) |

Regras:

- Cada coleção é lida do disco a cada chamada; não há cache que fique velho
  quando outra aba grava.
- Chave ausente, JSON inválido ou formato inesperado faz a coleção voltar ao
  seed sozinha. As demais coleções não são tocadas.
- O seed de abrigos guarda apenas dados operacionais. Autonomia, risco e
  explicabilidade saem do motor no momento do seed, então mudar uma taxa de
  consumo muda o seed sem editar número nenhum à mão.
- O reset restaura as cinco chaves do plano e preserva o tema.

---

## Modelo de dados

### `Shelter`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | |
| `nome` | `string` | |
| `municipio` / `uf` | `string` | UF com duas letras maiúsculas |
| `baciaHidrografica` | `string` | |
| `acessoViario` | `'LIVRE' \| 'RESTRITO' \| 'ISOLADO'` | Define os modais que alcançam o abrigo |
| `capacidadeTotal` | `number` | Inteiro maior que zero |
| `ocupacaoAtual` | `number` | Pode passar da capacidade |
| `gruposVulneraveis` | `{ idosos, criancas, pcd, pets }` | Idosos, crianças e PcD contam dentro da ocupação; pets não |
| `estoque` | `{ aguaLitros, refeicoesUnidades, kitsMedicos }` | |
| `autonomiaHoras` | `{ agua, alimentos, medicamentos }` | **Calculado.** Uma casa decimal, teto de 720 h |
| `riscoColapsoIA` | `number` | **Calculado.** 0 a 100 |
| `status` | `'ESTÁVEL' \| 'ATENÇÃO' \| 'SOBRECARGA' \| 'COLAPSO LOGÍSTICO'` | **Calculado** a partir do risco |
| `aiExplainability` | `{ taxaOcupacao, burnRateSuprimentos, indiceVulnerabilidade, isolamentoViario }` | **Calculado.** Inteiros que somam 100 |
| `atualizadoEm` | ISO 8601 | |

`ShelterOperationalData` é o `Shelter` sem os campos calculados: é o que o
operador informa e o que o motor recebe.

### `FleetVehicle`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | |
| `prefixo` | `string` | Único na frota; é por ele que a ordem referencia o veículo |
| `modelo` | `string` | |
| `modal` | `'TERRESTRE' \| 'FLUVIAL' \| 'AÉREO'` | |
| `iconeMaterial` | `string` | Glifo do Material Symbols |
| `status` | `'DISPONÍVEL' \| 'EM MISSÃO' \| 'MANUTENÇÃO'` | Só `DISPONÍVEL` entra na prescrição e no despacho |
| `localizacaoAtual` | `string` | Usada para preferir veículos no município do abrigo |
| `capacidadeCargaKg` | `number` | Maior que zero |

### `DispatchOrder`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | `crypto.randomUUID()`, com alternativa para HTTP sem contexto seguro |
| `protocoloS2id` | `string` | `S2ID-PC-UF-AAAA-NNNNNN`, sequência global crescente |
| `dataHora` | ISO 8601 | |
| `abrigoId` / `abrigoNome` | `string` | O nome é copiado para o histórico não mudar se o abrigo for renomeado |
| `veiculoPrefixo` | `string` | |
| `itensDespachados` | `{ aguaLitros, refeicoes, kitsMedicos }` | Inteiros não negativos, ao menos um maior que zero |
| `tempoDecisaoMinutos` | `number` | Do alerta à decisão; compara IA e operador |
| `origem` | `'IA_PRESCRITIVA' \| 'MANUAL_OPERADOR'` | |
| `sincronizadoNuvem` | `boolean` | `false` enquanto está na fila offline |

### `SimulationState`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `picosSimulados` | `number` | |
| `ultimoPicoEm` | ISO 8601 \| `null` | |

---

## Convenções de código

- **Sem NgModules.** Componentes standalone com `imports` explícitos.
- **Fluxo de controle nativo.** Apenas `@if`, `@for`, `@switch` e `@let`.
- **Signals para estado.** `signal`, `computed`, `effect`, `input()`,
  `output()`, `model()` e `inject()`.
- **Sem `any`.** `strict`, `strictTemplates`, `noImplicitOverride`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch` e
  `noPropertyAccessFromIndexSignature` ativos.
- **Domínio puro.** Nada em `domain/` importa Angular, e nenhuma função de
  domínio altera o objeto recebido: toda transição devolve um novo objeto.
- **Erros de regra são `DomainError`** com `code`, para a interface reagir sem
  comparar mensagens.
- **Nomenclatura em inglês** para classes, métodos e funções; **campos das
  entidades, textos de interface e comentários em português**, porque o
  vocabulário do domínio é o da Defesa Civil. Comentário explica o porquê de
  uma decisão, não o que a linha faz, e existe só em TypeScript: templates e
  folhas de estilo não levam comentário.
- **Membros usados apenas no template** marcados como `protected readonly`.
- **Testes onde o erro é silencioso.** O alvo é a matemática do motor e a
  atomicidade das gravações: um número errado ali entra como dado válido e
  orienta um despacho real. Layout segue verificado a olho, pelo build com
  `strictTemplates` e pelo navegador.
