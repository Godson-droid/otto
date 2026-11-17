# Otto interface phase: build record

The web interface in `web/` was rebuilt on the Viola UI design system (free tier) and wired to Otto's contracts on a local fork of Aevum. This file records what came from Viola, what was adapted and why, the dynamic touches added on top, how the result was verified, and what remains for the live deployment.

## The Viola material, and how it was obtained

Viola UI (violaui.com, by Kseniya Savitsyna) is a Figma design system. The maker publishes a free agent pack as a direct download, and that pack is what this build works from: `design/viola-agent-pack/` in this folder holds it unedited, including the token files (`tokens/tokens.css`, light, dark and base token JSON, a Tailwind config), the maker's own rules file (`AGENTS.md`), the component notes (`components.md`) and the sample data. The free Figma Community file itself is a canvas app and cannot be extracted programmatically in this environment; the agent pack is the same system in code form, and it is the pack, not a reading of the canvas, that the interface implements.

What came from Viola, used as specified by the maker's rules:

- The complete token set. `web/src/styles/viola-tokens.css` is the maker's `tokens.css` copied verbatim: 42 colour tokens across light and dark modes, spacing, radii, control sizes and the chart tokens. Components reference variables only; no hex value appears anywhere in the app's own CSS.
- The 23 text styles, mapped to utility classes (page heading, card title, label, body, caption, table number and the rest) with the maker's sizes, weights and line heights.
- Dark mode exactly as the maker specifies: a `.dark` class on the html element swapping the variables, never per component variants. The app adds a theme toggle and remembers the choice per browser.
- The button pattern (36 px medium, 44 px large, primary, secondary, ghost, danger), the sidebar and sidebar item pattern (260 px, subtle accent fill on the current item), the table cell pattern (header row on the subtle surface, caption strong muted headers, rows divided by the subtle border, no line under the last row, amounts right aligned with tabular figures), the tag pattern with its tones, and the portfolio chart treatment (portfolio line token, dashed baselines in the baseline token, a light tint under the line).
- The maker's semantic rule: positive and negative colour is reserved for money that moved, never for status. Status is carried by tags and wording.
- The font is Geist, loaded through Next, as the token file names it.

## What was adapted or approximated, and why

The free file does not contain form fields, notices, a spinner, a progress bar, a stepper or a modal; the maker's notes say these live in the full kit. Otto needs all of them, so they were built from Viola tokens only (same surfaces, borders, radii, spacing and text styles) and are original code in Viola's visual language:

- Form fields (44 px, token border, accent focus ring), notices in four tones, the step list on the invoice page, the progress bar on the budget screen, the spinner, and the network switch in the top bar.
- Addresses render in Geist with tabular figures because Viola has no monospace token; inventing a second font would leave the system.
- The identity panel (Confirmation of Payee) is an Otto component styled as a Viola notice. The Aevum identity registry is an ERC 721 that is not enumerable, so the panel reports the record count from `balanceOf`, with best effort enrichment from `Registered` events over the most recent 20,000 blocks. A count is all the registry can prove; the copy says exactly that.
- The chart is drawn as inline SVG from real settlement events, following the portfolio chart treatment above. Viola's range tabs are not reproduced: Otto's receipts have no meaningful ranges yet, and a control that does nothing would be decoration.
- RainbowKit provides the wallet connection modal (it is the kit's wallet stack, not a Viola component) and is themed with the Viola accent values in both modes.

One file outside `web/` was touched: `packages/aevum/src/contracts.ts` gained the SettleCheckout, AgentBudget and identity registry ABIs, in the same parseAbi style as the kit's own entries, because every screen imports ABIs from the shared package.

## The screens

- Dashboard: balance, waiting count and received total as stat cards; a received over time chart; the merchant's payment requests with settlement state polled from SettleCheckout `isSettled` every 12 seconds; recent receipts folded from `InvoicePaid` events.
- Pay to an address: a direct tUSD8 transfer with a Confirmation of Payee panel that looks the address up in the identity registry before signing, with the plain warning when no record exists.
- Request a payment: amount, payer, note and expiry; the merchant signs the quote once, and the share panel shows the link and a QR code. Requests are kept in the browser; the link carries everything a payer needs.
- The public invoice page: the link is parsed and validated, the quote signature is recovered and compared against the named merchant and the contract's merchant, the exact amount is locked, and the payer can pay gaslessly (EIP 3009 signature plus the relayer) or from their wallet (approve and pay). Settlement is polled every 6 seconds.
- Agent budget: budgets are discovered by scanning `budgetOf` for the connected owner or agent; the allowlist and the agent activity log are folded from `PayeeAdded`, `PayeeRemoved` and `AgentPayment` events; create, add payee, remove payee and revoke are all wired. AgentBudget was present in the contracts tree when this screen was wired, together with its deploy script and make targets, so the screen is wired to the real contract, not only to its specification.
- Receipts: read from `settlementOf`, with transaction details shown only when the transaction's own `InvoicePaid` log matches the invoice and the contract.

The relay route was rewritten for SettleCheckout with the kit's safety rails kept: only the configured contract, both signatures recovered and matched before any gas is spent, an already settled check, an in flight claim, per IP and per payer rate limits, a daily cap, simulation before submission, legacy transactions, and anvil keys refused on non local chains.

## Dynamic touches

Added on top of the Viola base at Godson's direction, all inside the template's design language and all disabled under `prefers-reduced-motion`:

- Animated counters: the balance and received figures count up on load, and count again whenever the value changes, for example when a payment lands while the dashboard is open. The final frame is always the exact figure in the standard amount format.
- The received over time chart: Viola's portfolio chart treatment drawn from the merchant's real settlements, cumulative, with the line drawing itself in on mount and the end point popping in last.
- Live status treatment: waiting states carry a soft pulsing dot (dashboard rows and the invoice page). When a request flips from waiting to paid while the page is open, its row flashes once in the positive tint and the Paid tag pops; on the invoice page the paid notice rises in and its tag pops the same way.
- Page and card transitions: every screen's content rises and fades in with a short stagger; the request share panel rises when a request is created.
- Skeleton loading states: shimmering placeholders in Viola surface tones stand in for the balance figure, the requests table, the receipts table and the budget card while chain reads are in flight, instead of blank panels.
- Micro interactions: buttons and icon buttons ease colour changes and press in slightly, sidebar items and table rows highlight on hover, and the budget progress bar animates width changes smoothly.
- Populated captures: every screenshot was taken against the seeded fork described below, with real requests, settlements and a live budget on screen. No empty placeholder cards appear in the captures.

## Verification

- `pnpm typecheck` is clean and `pnpm build` succeeds: routes `/`, `/pay`, `/pay/[invoiceId]`, `/request`, `/budget`, `/receipts/[orderId]` and `/api/relay`.
- The app was run against a local anvil fork of Aevum (chain 440050) with SettleCheckout at 0x0bE8ED62c25d29e57f6555d59F3eb407eF357e38 and AgentBudget at 0x14Db49B0064f68EB28493E9908D57E12E85B530F, seeded with dealt tUSD8, a settled 40.00 request, a settled 25.00 invoice, budget 1 (total cap 200, per payment cap 50, the merchant on the allowlist) and an 18.75 agent payment through that budget, verified settled on chain. During capture, a 12.50 request and then a 60.00 request were paid gaslessly through the real interface, and both settled on chain; the screenshots show those states.
- Two real bugs were found by the captures and fixed. First, the gasless authorization window was anchored to the device clock; the token judges the window by the time of the block the payment lands in, so the window is now anchored to the pending block, which is the closest estimate of that landing time and is correct on chains whose clock has drifted. Second, the receipt page labelled the SettleCheckout contract address as the payee; it now reads and shows the contract's merchant, which is where the money lands.
- Screenshots, desktop (1440 px) and mobile (390 px), light and dark where the screen has a theme pair, are in `web/docs/screenshots/`: dashboard-desktop-light, dashboard-desktop-dark, dashboard-mobile, request-desktop, request-mobile, pay-desktop, pay-mobile, invoice-mobile, invoice-desktop (waiting), invoice-paid-desktop, budget-desktop-light, budget-desktop-dark, budget-mobile, receipt-desktop.
- The sandbox restarted several times during this phase and wiped the fork and tooling each time; the contracts were redeployed and the demo data reseeded identically after each restart, which is why the addresses above are the fourth deployment. The capture harness (seed scripts, signer sidecar, screenshot driver) lives in `~/workspace/aevum-build/harness/` so it survives restarts; it uses anvil's public test keys on the local fork only.

## What remains

- Live wiring after the testnet deployment: set `NEXT_PUBLIC_SETTLE_AEVUM` and `NEXT_PUBLIC_AGENT_BUDGET_AEVUM` to the deployed addresses and `NEXT_PUBLIC_DEPLOY_BLOCK_AEVUM` to the deployment block, and give the relay a funded, non anvil `RELAYER_PRIVATE_KEY`. Nothing else in the app changes; explorer links already switch on per network.
- The request book is per browser by design (the share link is the portable record). A merchant using a second device will not see requests created on the first; the dashboard says so in plain words.
- Identity enrichment beyond the record count stays best effort over a bounded event window, because the registry exposes no enumeration.
