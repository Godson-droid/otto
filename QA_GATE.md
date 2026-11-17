# Otto, independent QA gate

Date: 17 November 2026
Scope: an adversarial recheck of the whole submission before the demo video, the public GitHub push and the DoraHacks package. The contracts, the live claims in BUILD_LIVE.md, the web app against the live deployment, the README and the repository contents were all treated as unproven until rechecked here.

## Verdict

Pass. Three documentation defects were found and fixed. No code defects and no structural defects were found. Every live claim in BUILD_LIVE.md was re read from chain state and matched exactly.

## What was rerun and rechecked

Contracts. The full Foundry suite was rerun from a clean shell: 55 of 55 unit tests pass and 13 of 13 fork tests against the real tUSD8 pass, 68 of 68 in total, matching the count the build reports claim. The web type check passes clean and the production build succeeds with all seven routes.

Live chain claims, re read through the public RPC with cast, not from the build reports:

- SettleCheckout deploy transaction lands at block 3352316 and created 0x6a041F98390e352Db4Cdd2CC255061246A43a048; AgentBudget at block 3352333 and created 0xa321Ef5A86f9E8e28226f0Ae7295987376c25dc7. The deployed SettleCheckout reads back the live merchant and the tUSD8 token address.
- All four settlements read back with the exact payer and amount claimed: 1.00 and 0.75 and 0.50 from the payer, 0.50 from the agent. A check at the wrong amount of one millionth returns not settled, so settlement is amount verified in the live contract, not just in tests.
- Budget 1 reads back owner deployer, agent as claimed, total cap 1.25, per payment cap 0.75, spent 0.50, not revoked.
- The above cap attempt transaction 0xc54aba508a00a65f038a9edaea902b8419ceac1630ebf115d675721b00a37665 has receipt status 0 at block 3352460, its invoice is unsettled, and the budget still reads spent 0.50.
- Final tUSD8 balances re read: deployer 1.00, merchant 2.75, payer 0.25, agent 1.00, relayer 0, both contracts 0. The total is exactly the 5.00 the faucet sent. The deployer tQDAY balance reads 0.797706447, matching the report to the last digit.

Web app against the live deployment. The production build was driven in a browser with a wallet connected per role, and each screen was checked against live chain data:

- Dashboard as the merchant shows the live balance (2.75 at the time of the check) read from the chain.
- Pay to an address: the identity panel answers from the live registry and honestly reports that the merchant address has no identity record.
- Request a payment: a real request for 0.10 tUSD8 naming the payer was created and signed in the app, producing a working share link.
- The public invoice page opened that link in a fresh session, showed the exact amount and the waiting state, and the payer paid gaslessly through the page itself. The settlement is on chain: transaction 0x1935f8bd6846c00e48e96090f9713481cb9d8960f6f27ac105169a47a60fab47, block 3369766. Merchant and payer balances moved to 2.85 and 0.15, and the five role total is still exactly 5.00.
- Agent budget as the owner shows live Budget 1 with its caps, its spent 0.50 and its remaining 0.75.
- The receipt page for the first live payment shows it settled at exactly 1.00 with matching transaction details.
- The explorer page for the refused transaction loads publicly and shows the failed transaction.

Secrets and repo hygiene. Every tracked file and the full git history were scanned: no private key value appears anywhere, the env files holding the keys are ignored by git and untracked, and the example env files contain no values beyond the public RPC address. Broadcast logs are untracked. Nothing in the tree would embarrass the submission.

## Defects found and fixed

D1, documentation, minor, fixed. The README said the live testnet deployment was still a remaining phase and quoted the phase one test count of 41. The deployment had been live for hours and the suite is 68. The README now carries the live addresses, the evidence transactions, the correct counts, an architecture section and run instructions.

D2, documentation, minor, fixed. NOTICE.md still listed the starter kit's original library versions, forge std v1.9.6 and OpenZeppelin v5.1.0. The repo builds on forge std v1.14.0 and OpenZeppelin v5.4.0, verified from the submodule checkouts. NOTICE.md now matches.

D3, documentation, moderate, fixed. The README had no setup steps and no architecture summary, against the challenge checklist item that a stranger can run the project from the README. Both were added as part of the D1 fix and checked against the Makefile and the env examples.

## Observations that are not defects

O1. The dashboard received total and receipt list are scoped to the request book kept in the merchant's own browser, by design, and the app says so in plain words. A first pass flagged the empty state in a fresh browser as a suspected defect. A retest with a settled request in the book showed the received figure and the receipt within seconds, and the received over time chart folds every settlement for the merchant from chain events. The behaviour matches the documented design in BUILD_UI.md.

O2. The sandbox browser cannot reach the qday.info domains directly (its proxy tunnel fails in every configuration tried), while curl, Node and cast reach the same endpoints fine. For the browser checks above, only the page's RPC and explorer requests were bridged through Node to the same live endpoints; the app itself was untouched and all state was verified independently with cast. The real RPC's cross origin preflight was checked with curl and is correct, so ordinary browsers are unaffected. This is a sandbox limitation, not an app defect.

O3. The fork only proof scripts contain the well known public anvil test mnemonic. Those scripts hard require the fork chain id 440050 and cannot run against the real testnet. No live key material appears in any file.

O4. Three test invoices of 0.10 tUSD8 were created through the real request flow during this gate; the third was the one paid through the invoice page. The first two remain open and unpaid, which is harmless on a testnet and changes no totals.
