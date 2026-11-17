# Viola UI components (free file)

How to use the 10 components in Viola UI's free Figma file when you build a screen in code. Names, variants and rules come from the component descriptions in the Viola UI Figma file (version 1.2). Variant names are written `property=value`.

Build each component from tokens (`tokens/tokens.md`). If the project already has a matching component, use it and give it these variants rather than writing a new one.

## Rules that apply to every component

- Buttons are 36 px high at md (`h-control`). Use the sm size in toolbars and card headers.
- Only two shadows exist, both for floating panels. Cards and tables use a 1 px border.
- Green and red mean money that moved. A tag is never green or red to suggest a gain or loss.
- One active item at a time in a tab bar, range selector or sidebar.

## Actions

### button
Core action button.
- Variants: `type=primary|secondary|ghost` × `state=default|hover|active|disabled` × `content=label|icon-only|icon-left|icon-right` × `size=md|sm|xs`.
- md is 36 px.
- Primary uses `accent/primary` with `text/on-accent`; secondary uses `button/secondary-bg` with a `border/default` border; ghost has no fill.
- There is no destructive type. For a destructive action such as Sell, use a primary button with its fill overridden to `semantic/negative`, so it still switches in dark mode.
- Icon-only buttons need an accessible label.

## Navigation

### sidebar, sidebar/item
The app's left navigation.
- Sidebar: `mode=expanded|collapsed`. Expanded is 260 px wide and as tall as the screen.
- Item: `state=default|hover|active` × `mode=expanded|collapsed`. Collapsed shows the icon only. The active item uses the accent: `accent/primary` text on `accent/primary-subtle`.

### tab-bar, tab-item
A row of tabs.
- Item: `state=active|default|hover|disabled`. Exactly one is active, with an accent underline.

### range-tabs, range-pill
Time-range chips for charts: 7D, MTD, YTD, 1Y, All.
- Pill: `state=default|hover|active|disabled`. Exactly one is active.

## Data display

### table/cell
Every table in the kit is built from this cell.
- Variants in the free file: `type=header|text|text-2row|icon|chart` × `alignment=left|center|right`. The full kit has 16 types.
- In Figma, tables are built as vertical columns of cells, and the last cell in each column has no bottom line. In code, a normal `<table>` is fine: header row on `bg/surface-subtle` with `caption/strong` in `text/muted`, rows divided by `border/subtle`, and no line under the last row.
- Amounts and changes are right-aligned with `number/table` and tabular figures. Instrument cells use `text-2row`: the symbol in `body/strong`, the name in `caption/medium` and `text/muted`.

### sparkline
A 60 × 20 trend line in watchlist and table rows: a line over a light tint, green above the starting value and red below, with a dashed baseline in `chart/baseline`. Use `chart/spark-tint-positive` and `chart/spark-tint-negative` for the tints.
- Variants: `trend=up-1|up-2|down-1|down-2`. Up ends higher than it starts, down ends lower. Pick the one that matches the real price movement.

### Charts
The portfolio chart card.
- Variants: `view=Value|Performance`.
- Contents: portfolio line in `chart/line-portfolio`, benchmark in `chart/line-benchmark`, gridlines in `chart/baseline`, a tooltip card and range-tabs under the chart. Candles use `chart/candle-up` and `chart/candle-down`, never the P&L colours.

### tag
Compact label for a status, category or selected value.
- Variants: `state=default|hover|error|disabled|positive|warning|accent`, with an optional icon, flag or close X.
- The tone is cosmetic. Never use a positive or error tag to suggest a gain or loss: that belongs to the figure itself.

## Not in the free file

Form fields (input, select, date-picker, checkbox, radio, toggle), button-group, modal, popover, tooltip, alert, paginator, stepper, command palette, progress-bar, spinner, chart/bar and the 8 AI components are in the full kit, with their guide in the full agent pack. If a screen needs one, say so instead of inventing your own.
