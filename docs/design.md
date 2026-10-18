# Design e acessibilidade

Princípios, tokens, componentes, animações, responsividade e o que foi feito por acessibilidade.

[Voltar ao README](../README.md)

---

## Princípios

O painel é usado em sala de situação, sob pressão. Cada decisão de design
existe para que o operador entenda o cenário em segundos e saiba o que fazer.

1. **Uma pergunta por tela.** O topo responde "o que precisa de mim agora?":
   uma frase com a situação e um único card com a prioridade e a ação.
2. **Cor é sinal, não decoração.** A base é monocromática. Vermelho aparece só
   no que está em colapso; âmbar só no que pede atenção. Abrigo estável fica em
   cinza. Se tudo tem cor, nada se destaca.
3. **Tipografia faz a hierarquia.** Números grandes e texto em três tons de
   cinza substituem cards, ícones e bordas coloridas.
4. **Detalhe sob demanda.** Censo, autonomia por item e os pesos da IA ficam
   na gaveta do abrigo, a um clique, e não disputam atenção com a prioridade.
5. **Linguagem de sala de situação.** A recomendação da IA sai como frase
   ("Água acaba em 11,1 h. A IA recomenda enviar...") em vez de uma grade de
   números para o operador montar sozinho.

---

## Tokens

Os tokens vivem em `src/styles/_tokens.scss` como variáveis CSS e são a única
fonte de cor, raio, sombra, espaçamento e motion. O tema do Angular Material lê
esses mesmos tokens.

| Grupo | Valores |
| --- | --- |
| Base | Fundo off-white `#f7f7f5`, superfície branca, linhas `#e8e8e4` |
| Texto | Tinta `#111110`, secundário `#62625d`, terciário `#9c9c96` |
| Ação | A própria tinta: botão principal preto com texto branco |
| Sinais | Crítico `#d93025`, alerta `#b86e00`, positivo `#1e7e45` (só em confirmações) |
| Foco | Azul `#1a73e8`, apenas no anel de foco do teclado |
| Tema escuro | Mesma estrutura em `:root[data-theme='dark']`: fundo `#0b0b0a`, superfície `#141413`, ação clara |
| Raios | 8, 12, 16, 24 px e pílula |
| Sombras | Quase nenhuma: `--shadow-1` para cards e `--shadow-pop` para o que flutua |
| Espaçamento | Escala de 4 px (`--space-1` a `--space-20`) |
| Motion | `--ease-emphasized: cubic-bezier(0.22, 1, 0.36, 1)`, durações de 150, 280 e 520 ms |
| Fontes | Geist para tudo; Geist Mono para códigos |

### Tons

Componentes recebem o tom por atributo, `data-tone`, e leem `--tone` e
`--tone-soft`. Há quatro: `critical`, `warning`, `positive` e `neutral`.

| Status do abrigo | Tom |
| --- | --- |
| Colapso logístico | `critical`, com ponto pulsante |
| Sobrecarga | `warning` |
| Atenção | `warning` |
| Estável | `neutral` |

Barras de progresso usam a própria variável `--bar-color`, para que uma barra
crítica dentro de um bloco neutro continue vermelha.

---

## Componentes

| Componente | Papel |
| --- | --- |
| `app-erp-header` | Marca, estado da sincronização como texto com ponto, "Simular pico" e um menu com modo offline e restauração |
| `app-kpi-summary-cards` | Frase de situação e os quatro indicadores da Meta 9.2.4 em tipografia, separados por linhas finas |
| `app-priority-dispatch-card` | O abrigo de maior risco, a recomendação em uma frase e a ação principal |
| `app-shelter-management-panel` | Lista de abrigos em linhas: ocupação, menor autonomia e risco |
| `app-fleet-panel` | Frota em linhas: situação, localização, carga e as ações confirmar entrega e liberar da manutenção |
| `app-shelter-sheet` | Gaveta do abrigo: suprimentos, pessoas, pesos da IA recolhidos e as ações |
| `app-modal` | Modal nativa com ícone discreto, detalhes em linhas e ações; folha inferior no celular |

### Variantes da modal

| Variante | Tom | Ícone padrão | Uso |
| --- | --- | --- | --- |
| `info` | `neutral` | `info` | Avisos neutros |
| `warning` | `warning` | `warning_amber` | Manifesto de abrigo fora do colapso, confirmação do pico |
| `danger` | `critical` | `error` | Manifesto de abrigo em colapso, reset, erros de regra |
| `success` | `positive` | `check_circle` | Despacho registrado, abrigo já abastecido |

---

## Animações

Somente CSS:

| Onde | Efeito |
| --- | --- |
| Entrada da página | `fade-in-up` de 10 px, escalonado em passos de 60 ms |
| Gaveta | Desliza da direita no desktop e de baixo no celular; sai com `animate.leave` |
| Modal | Sobe 16 px com leve escala; folha inferior no celular |
| Colapso | Anel pulsante no ponto de status, e só nele |
| Barras | Largura animada em 700 ms com a curva enfatizada |

---

## Responsividade

- Até 600 px: topbar só com a marca curta, o estado e o menu; KPIs em 2×2;
  prioridade empilhada com o risco no topo e botões em largura total; lista
  em duas linhas por abrigo; gaveta e modais como folha inferior.
- Até 720 px: a lista troca as colunas por uma linha de resumo por abrigo.
- Até 905 px: KPIs em 2×2.
- Áreas seguras do iPhone respeitadas com `env(safe-area-inset-*)`.

---

## Acessibilidade

- `prefers-reduced-motion` desliga entradas, pulsos e transições.
- Status nunca depende só de cor: todo ponto colorido vem com o nome do status
  em texto ao lado ou no rótulo da linha.
- Anel de foco azul visível em todos os elementos interativos.
- Cada linha da lista tem um `aria-label` com nome, status, risco, ocupação e
  autonomia, lidos de uma vez.
- Gaveta e modal prendem o Tab, fecham com ESC e devolvem o foco a quem as
  abriu. Com uma modal aberta sobre a gaveta, o ESC fecha só a modal.
- Tema claro, escuro ou do sistema, aplicado antes do primeiro pixel.
