---
name: viola-ui
description: Build a screen or component with Viola UI tokens, text styles and sample data. Use when the user asks for a finance, investing, portfolio or trading screen in this project, or pastes a link to a Viola UI Figma frame.
---

# Build a screen with Viola UI

Follow `AGENTS.md`. This skill adds the order of work.

## 1. Read before writing
- Read `tokens/tokens.md` for colour tokens, text styles and layout values.
- Read `components.md` for the component you need: its variants, and when to use it or not.
- Read `data/portfolio.md` for every figure you show.
- If the user gave a Figma link and the Figma MCP server is connected, call `get_design_context` for the frame and `get_variable_defs` for its variables. For a large frame, ask for its sections one by one.

## 2. Map, don't guess
- Map each Figma variable to its token: `bg/surface` → `--bg-surface` → `bg-bg-surface`.
- Map each text layer to a text style, not a size. Trust the text style the MCP server lists for a layer. On an instance whose text style was changed, the code can still show the component's original size variable, for example `var(--size-body,13px)` on a 13 px price that uses `number/table`.
- Copy text and figures from the frame or `data/portfolio.md` exactly. Use the minus sign (−) for losses.

## 3. Build
- Use the project's components first, with the variants in `components.md`. Then plain elements with token classes.
- Icons are SVGs with `currentColor`, coloured with a text class.
- Dark mode comes from the `.dark` class. Don't write a second set of colours.

## 4. Check before you finish
Search your changes and fix anything found:
- a hex value, `rgb()` or palette class (`slate-`, `gray-`, `green-`, `red-`, `blue-` followed by a number)
- a `dark:` variant
- an off-scale size such as `h-11` or `p-10`. Viola's scale is 1, 2, 3, 4, 5, 6, 8 and 12, plus `icon`, `icon-lg`, `control` (36 px) and `control-lg` (44 px). Other steps produce no CSS
- an amount or percentage without tabular figures
- a hyphen used as a minus sign
- green or red on anything that isn't a gain or a loss
- a figure that isn't in the frame or `data/portfolio.md`

## 5. Report
End with a short summary: what you built, the tokens you used, and any gaps. A gap is a value with no matching token or a figure you couldn't find. List it; don't invent one.
