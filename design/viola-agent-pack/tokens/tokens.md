# Viola UI tokens

Colour tokens have a Light and a Dark value. In code, `bg/surface` is the CSS variable `--bg-surface` and the Tailwind class `bg-bg-surface`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg/page` | #F8F9FC | #141414 | Page background behind cards |
| `bg/surface` | #FFFFFF | #1E1E1E | Cards, panels, tables |
| `bg/surface-subtle` | #F8F9FC | #262626 | Table headers, inset fields, insight cards |
| `bg/sidebar` | #FFFFFF | #1A1A1A | Left navigation |
| `bg/hover` | #F1F5F9 | #262626 | Row and item hover |
| `border/default` | #E2E8F0 | #2A2A2A | Card, input and panel borders |
| `border/subtle` | #F1F5F9 | #2A2A2A | Row dividers inside tables and lists |
| `text/primary` | #0F172A | #E5E5E5 | Headings, figures, body |
| `text/secondary` | #475569 | #A3A3A3 | Supporting text |
| `text/muted` | #64748B | #8A8A8A | Labels, captions, table headers |
| `text/nav-inactive` | #64748B | #8A8A8A | Inactive nav items and tabs |
| `text/on-accent` | #FFFFFF | #FFFFFF | Text on accent fills |
| `text/link` | #6366F1 | #818CF8 | Links (alias of accent/primary) |
| `accent/primary` | #6366F1 | #818CF8 | Primary actions, links, active states, AI. Never money |
| `accent/primary-subtle` | #EEF2FF | #333333 | Active nav and tab backgrounds, AI surfaces |
| `accent/primary-hover` | #5558E3 | #737FF7 | Primary hover |
| `accent/primary-active` | #4B4ED6 | #5F6CE8 | Primary pressed |
| `accent/primary-border` | #C7D2FE | #464B8F | Accent outlines |
| `semantic/positive` | #047857 | #10B981 | Gains only |
| `semantic/positive-subtle` | #ECFDF5 | #333333 | Background behind a gain tag |
| `semantic/positive-border` | #A7F3D0 | #2A2A2A | Border of a gain tag |
| `semantic/negative` | #DC2626 | #F87171 | Losses, and destructive actions |
| `semantic/warning` | #D97706 | #FBBF24 | Warnings that are not about gains or losses |
| `semantic/warning-subtle` | #FEF3C7 | #3A2E14 | Warning background |
| `semantic/warning-border` | #FDE68A | #5C4A1E | Warning border |
| `semantic/negative-subtle` | #FEE2E2 | #3B1D1D | Background behind a loss tag |
| `semantic/negative-border` | #FECACA | #5C2E2E | Border of a loss tag |
| `button/secondary-bg` | #FFFFFF | #2A2A2A | Secondary button fill |
| `chart/line-portfolio` | #3B82F6 | #3B82F6 | Portfolio line |
| `chart/line-benchmark` | #64748B | #A3A3A3 | Benchmark line |
| `chart/baseline` | #E2E8F0 | #333842 | Chart gridlines and baselines |
| `chart/spark-tint-positive` | #F2FFF2 | #092809 | Fill under a rising sparkline |
| `chart/spark-tint-negative` | #FFEDED | #1C0606 | Fill under a falling sparkline |
| `chart/donut-1` | #6366F1 | #818CF8 | Allocation slice 1 |
| `chart/donut-2` | #818CF8 | #A5B4FC | Allocation slice 2 |
| `chart/donut-3` | #A5B4FC | #C7D2FE | Allocation slice 3 |
| `chart/donut-4` | #C7D2FE | #E0E7FF | Allocation slice 4 |
| `chart/donut-5` | #E2E8F0 | #333842 | Allocation slice 5 or remainder |
| `chart/candle-up` | #0EA5A0 | #2DD4BF | Rising candle (not a P&L colour) |
| `chart/candle-down` | #E06B5E | #F0857A | Falling candle (not a P&L colour) |
| `icon/muted` | #94A3B8 | #8A8A8A | Secondary icons |
| `icon/nav` | #334155 | #B0B0B0 | Nav and card icons |

## Text styles (Geist)

| Style | Size | Weight | Line height | Class | Use |
|---|---|---|---|---|---|
| `display/hero` | 32 | 800 | 40 | `text-display-hero` |  Tabular figures. |
| `heading/page` | 24 | 800 | 32 | `text-heading-page` |  |
| `subheading/stat` | 18 | 600 | 24 | `text-subheading-stat` |  |
| `subheading/glyph` | 18 | 800 | 24 | `text-subheading-glyph` |  |
| `title/card` | 16 | 700 | 22 | `text-title-card` |  |
| `title/brand` | 16 | 800 | 22 | `text-title-brand` |  |
| `number/large` | 16 | 600 | 22 | `text-number-large` |  Tabular figures. |
| `number/table` | 13 | 600 | 18 | `text-number-table` |  Tabular figures. |
| `number/emphasis` | 13 | 700 | 18 | `text-number-emphasis` |  Tabular figures. |
| `body/strong` | 14 | 600 | 20 | `text-body-strong` |  |
| `body/default` | 14 | 500 | 20 | `text-body-default` |  |
| `body/small` | 13 | 500 | 18 | `text-body-small` |  |
| `body/small-regular` | 13 | 400 | 18 | `text-body-small-regular` |  |
| `label/strong` | 12 | 600 | 16 | `text-label-strong` |  |
| `label/default` | 12 | 500 | 16 | `text-label-default` |  |
| `caption/strong` | 11 | 600 | 14 | `text-caption-strong` |  |
| `caption/emphasis` | 11 | 700 | 14 | `text-caption-emphasis` |  |
| `caption/medium` | 11 | 500 | 14 | `text-caption-medium` |  |
| `caption/default` | 11 | 400 | 14 | `text-caption-default` |  |
| `marketing/display` | 56 | 800 | 62 | `text-marketing-display` | Hero headline on marketing pages. Not for app UI. |
| `marketing/heading` | 34 | 800 | 40 | `text-marketing-heading` | Section heading on marketing pages. |
| `marketing/quote` | 26 | 600 | 36 | `text-marketing-quote` | Pull quote / testimonial on marketing pages. |
| `marketing/lead` | 18 | 500 | 28 | `text-marketing-lead` | Lead paragraph under a marketing headline. |

## Layout

- space: `space/1` 4, `space/2` 8, `space/3` 12, `space/4` 16, `space/5` 20, `space/6` 24, `space/8` 32, `space/12` 48
- radius: `radius/xs` 4, `radius/sm` 6, `radius/md` 8, `radius/lg` 10, `radius/xl` 12, `radius/full` 999
- sizing: `sizing/icon` 16, `sizing/icon-lg` 24, `sizing/control` 36, `sizing/control-lg` 44
- shadows: `shadow/floating` (y 4, blur 16, #0F172A at 6%) and a 12 px backdrop blur. Everything else is a 1 px border.
