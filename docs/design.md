# Design e acessibilidade

Tokens, tema Material, animações, responsividade e o que foi feito por acessibilidade.

[Voltar ao README](../README.md)

---

## Sistema de design

Os tokens vivem em `src/styles/_tokens.scss` como variáveis CSS e são a única
fonte de cor, raio, sombra, espaçamento e motion. O tema do Angular Material
lê esses mesmos tokens, então componente nativo e componente do Material
nunca divergem.

| Grupo | Valores |
| --- | --- |
| Ação | Google Blue `#1a73e8`, com variantes hover, active, soft e strong |
| Semânticas | Emerald `#10b981`, Amber `#f59e0b`, laranja `#f97316` e Coral `#ef4444`, cada uma com versão soft (fundo) e strong (texto) |
| Neutros | Escala de cinzas do Google: fundo `#f8f9fa`, superfície branca, contornos `#e0e3e7` |
| Tema escuro | Mesma estrutura em `:root[data-theme='dark']`: fundo `#131314`, superfície `#1e1f20`, azul clareado `#8ab4f8` |
| Raios | 4, 8, 12, 16, 24 px e pílula |
| Sombras | Quatro níveis de elevação no padrão do Google (`--shadow-1` a `--shadow-4`) |
| Espaçamento | Escala de 4 px (`--space-1` a `--space-16`) |
| Motion | `--ease-emphasized: cubic-bezier(0.22, 1, 0.36, 1)`, durações de 150, 300, 500 e 700 ms |

### Status e tons

Cada status do abrigo tem um tom semântico. Os componentes recebem o tom por
atributo, `data-tone`, e as classes utilitárias leem `--tone`, `--tone-soft` e
`--tone-strong`:

| Status | Tom |
| --- | --- |
| Estável | `success` (Emerald) |
| Atenção | `warning` (Amber) |
| Sobrecarga | `alert` (laranja) |
| Colapso Logístico | `danger` (Coral) |

O mapeamento de status para tom pertence à apresentação, não ao domínio.

### Tema Material

`_material.scss` gera o tema Material 3 com `mat.theme` e substitui os tokens
de sistema (`--mat-sys-*`) pelos tokens do projeto com `mat.theme-overrides`.
Os overrides por componente deixam cards com raio de 16 px, botões em pílula,
diálogos com 24 px e barras de progresso arredondadas e com transição suave.

O `<mat-icon>` usa Material Symbols Rounded por padrão, configurado no
`app.config.ts`; a variante Outlined também é carregada.

---

## Utilitários

| Classe | Uso |
| --- | --- |
| `.container` | Largura máxima de 1280 px com respiro lateral que cresce com a tela |
| `.page-header` | Título e ações da página, quebrando linha no celular |
| `.surface-card` | Card com borda fina, raio de 16 px e elevação sutil |
| `.card-hover` | Sobe 2 px e aumenta a sombra no hover (só em dispositivos com mouse) |
| `.icon-badge` | Container de ícone com fundo suave da cor semântica; `--round`, `--sm` e `--lg` |
| `.status-pill` | Pílula com ponto colorido para status |
| `.progress-track` / `.progress-fill` | Barra de progresso própria com largura animada |
| `.grid-auto` | Grid fluido que vira uma coluna no celular |
| `.stack` / `.cluster` | Empilhamento vertical e linha que quebra |
| `.hide-mobile` / `.hide-desktop` | Visibilidade por breakpoint (600 px) |

---

## Animações

Somente CSS, em `_animations.scss`:

| Classe | Efeito |
| --- | --- |
| `.fade-in-up` | Entra subindo 16 px; `--delay` escalona listas em passos de 80 ms |
| `.fade-in` / `.scale-in` | Entradas mais discretas para overlays e conteúdo trocado |
| `.pulse-subtle` | Anel pulsante na cor do tom, para abrigos em colapso |
| `.pulse-dot` | Ponto pulsante para "ao vivo" e fila pendente |
| `.skeleton` | Placeholder com brilho correndo |

---

## Responsividade

- Breakpoints de 600 px e 1240 px, alinhados às janelas do Material 3.
- Títulos com `clamp()`, crescendo de forma contínua entre celular e desktop.
- Alvos de toque de no mínimo 44 px, inclusive nos botões do Material.
- `viewport-fit=cover` e `env(safe-area-inset-*)` para o notch e a barra de
  gestos do iPhone.
- Diálogos limitados à largura da tela menos 32 px e à altura dinâmica
  (`dvh`), para não ficarem atrás da barra do navegador móvel.
- O hover que levanta o card só existe em `@media (hover: hover)`; no celular o
  toque não deixa o card preso no ar.

---

## Acessibilidade

- `prefers-reduced-motion` desliga entradas, pulsos e transições.
- Texto sobre fundo soft usa a variante strong de cada cor, para manter
  contraste: o Amber puro, por exemplo, não tem contraste suficiente sobre
  branco e fica reservado a barras e pontos.
- Foco visível em todos os elementos interativos, na cor primária.
- Tema claro, escuro ou do sistema, aplicado por script no `index.html` antes
  do primeiro pixel, para não piscar branco ao abrir.
- `.visually-hidden` para rótulos lidos apenas por leitores de tela.
