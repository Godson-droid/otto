# Viola UI agent pack (free)

Rules, tokens and sample data that let AI coding agents build screens with the free Viola UI file. Free for personal and commercial projects.

## What's inside

| File | For | What it does |
|---|---|---|
| `AGENTS.md` | Every agent (Cursor, Codex, Claude Code and others) | The rules: tokens only, P&L colours, numbers, AI elements, copy |
| `CLAUDE.md` | Claude Code | Imports `AGENTS.md` and points to the skill |
| `.claude/skills/viola-ui/SKILL.md` | Claude Code | The order of work for a new screen, with a check before finishing. Run it with `/viola-ui` |
| `.cursor/rules/viola-ui.mdc` | Cursor | An always-on rule with the short version |
| `components.md` | Agents and people | The 10 components in the free file: variants, when to use each and when not |
| `tokens/tokens.md` | Agents and people | Every token with Light and Dark values and what it's for |
| `tokens/light.tokens.json`, `tokens/dark.tokens.json`, `tokens/base.tokens.json` | Token tools | W3C Design Tokens format (2025.10): colours per mode, plus type, spacing and radius |
| `tokens/tokens.css` | Web projects | CSS variables, Light under `:root` and Dark under `.dark` |
| `tokens/tailwind.config.js` | Tailwind CSS v3 | Classes that point at the variables, such as `bg-bg-surface` |
| `tokens/tailwind.v4.css` | Tailwind CSS v4 | The same classes as a v4 theme. Import it after `tailwindcss` |
| `data/portfolio.md` | Agents | The dashboard figures: totals, holdings and cash |

## Set up

1. Copy everything into the root of your project, keeping the folders.
2. Import `tokens/tokens.css` once in your app and load the Geist font.
3. In Tailwind CSS v4, add `@import "./tokens/tailwind.v4.css";` after `@import "tailwindcss";`. In v3, use `tokens/tailwind.config.js` or merge its `theme` into yours.
4. Ask your agent for a screen. In Claude Code you can also type `/viola-ui`.

If you already have a `CLAUDE.md` or `AGENTS.md`, add the rules from ours to yours instead of replacing it.

The `.claude` and `.cursor` folders start with a dot, so macOS Finder hides them. Press Cmd+Shift+. to show them, or copy the pack with the terminal.

Optional: connect Figma's MCP server so the agent can read your Viola UI frames directly.

## The full kit

The full Viola UI kit comes with the full agent pack: every component in the kit, including forms, overlays and the 8 AI components, a `/viola-review` skill that checks a diff and names the fix, and the complete sample data for every screen. violaui.com

Viola UI · violaui.com · support@violaui.com

The token files are built from the Viola UI Figma variables (version 1.2, 29 Oct 2026).
