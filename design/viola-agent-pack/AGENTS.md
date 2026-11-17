# Viola UI rules for coding agents

This project builds screens from the Viola UI Figma kit. Read `tokens/tokens.md` and `components.md` before writing UI code. Every value below comes from the kit's Figma variables and text styles.

## Colours
- Every colour is a Viola token. Figma `bg/surface` is the CSS variable `--bg-surface` and the Tailwind class `bg-bg-surface`. Values are in `tokens/tokens.css`.
- Never write a hex value, `rgb()` or a palette class such as `slate-500` in a component.
- Dark mode is the `.dark` class on `<html>`, which swaps the variables. Never add `dark:` variants or a second palette.
- `semantic/positive` (green) and `semantic/negative` (red) are only for money that moved: gains and losses. Never use them for status, badges, chart series or decoration. Red is also used for destructive actions.
- `accent/primary` is for primary actions, links, active states and AI. Never colour an amount with it.
- Charts use `chart/*` tokens. Candles use `chart/candle-up` and `chart/candle-down`, which are not the P&L colours.

## Type
- Font is Geist. Use the text styles in `tokens/tokens.md` (Tailwind: `text-number-table`, `text-body-default` and so on), not pixel sizes.
- `marketing/*` styles are for landing pages only, never product UI.

## Layout
- Spacing uses `space/*` (4, 8, 12, 16, 20, 24, 32, 48). Radius uses `radius/*` (xs 4 to xl 12, full 999). Controls are 36 px high. In Tailwind, use `h-control` (36) and `h-control-lg` (44); other steps such as `h-11` don't exist.
- Cards: 16 px left and right, 20 px top, 24 px bottom.
- Only two shadows exist: `elevation/floating` and `overlay/backdrop-blur`. Everything else is a 1 px border.

## Numbers
- Every amount and percentage uses tabular figures (`tabular-nums` or the `.tnum` class). Right-align amounts in tables.
- Gains carry `+`. Losses use the minus sign (−), not a hyphen.
- Currency to 2 decimals, percentages as shown in the data. Zero is `0.00`, never a dash.
- Never show a price or total without its currency, for example "Total cash (in EUR)".
- Never invent, round or recalculate a figure. Use `data/portfolio.md`. If a figure you need isn't there, say so instead of making one up.

## AI elements
- Every AI element shows the AI icon and the words "AI-generated", says where its claim came from, can be dismissed, and never gives investment or tax advice.

## Copy
- Sentence case. No exclamation marks. Numbers, not adjectives: "Settles the same business day", not "settles fast".

## When something doesn't fit
- If a value in a design has no matching token, don't invent one. Name the layer and its value in your summary and leave it out.
