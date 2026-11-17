# Otto — Demo Video Script

Format: 1080p H.264, narration (British male voice, Magnus) plus burned in captions.
Target length: about 2:30 (hard limit 3:00).
Covers: the problem and the kit flaw · the signed quote fix · request a payment · the gasless scan and pay · the agent budget and the on chain refusal · the close.

Every figure below is taken from BUILD_LIVE.md as independently rechecked in QA_GATE.md, or from chain state read at production time. Nothing in this video is mocked: the app shots are the real production build running against the live Aevum testnet deployment, the invoice payment in scene 4 is made live during the capture session, and the explorer shots are the real transactions.

Key facts used on camera (all verified):

| Fact | Value | Source |
|---|---|---|
| SettleCheckout address | 0x6a041F98390e352Db4Cdd2CC255061246A43a048 | BUILD_LIVE.md, rechecked in QA_GATE.md |
| AgentBudget address | 0xa321Ef5A86f9E8e28226f0Ae7295987376c25dc7 | BUILD_LIVE.md, rechecked in QA_GATE.md |
| Test suite | 68 of 68 passing (55 unit, 13 fork) | QA_GATE.md rerun |
| Live flows | 1.00 standard, 0.75 requested, 0.50 gasless, 0.50 agent, all tUSD8 and settled | BUILD_LIVE.md, rechecked in QA_GATE.md |
| Budget 1 | total cap 1.25, per payment cap 0.75, spent 0.50 | chain state, QA_GATE.md |
| Refused attempt | 1.00 against the 0.75 cap, transaction status 0, block 3352460 | chain state, QA_GATE.md |
| Refused transaction | 0xc54aba508a00a65f038a9edaea902b8419ceac1630ebf115d675721b00a37665 | BUILD_LIVE.md |

## Shot list and narration

### Scene 1 — Hook · the problem and the answer

Visual: The merchant dashboard against the live deployment, balance and received chart visible, slow push in.

Narration: "Freelancers and small merchants are starting to bill in stablecoins. But the checkout most teams build on has a dangerous flaw: anyone can pay any amount on any order, and the order is marked paid. Otto fixes that. This is Otto, live on the Aevum testnet."

### Scene 2 — The mechanism · a bill that can only settle exactly

Visual: The public invoice page in its waiting state, the locked amount and the seller signature copy on screen.

Narration: "Every Otto bill is a signed quote. The seller signs the invoice, the buyer's address, the exact amount and an expiry. The contract checks all four before a single coin moves. Pay the wrong amount, pay late, or pay from the wrong wallet, and the payment is rejected. There is no paid flag to fool."

### Scene 3 — Request a payment

Visual: The request share panel with the payment link and scan code.

Narration: "Requesting a payment takes seconds. The seller enters the amount and the buyer's address, signs once, and shares a link or a scan code. The link carries everything the buyer needs, and the amount on it cannot be changed by anyone."

### Scene 4 — Scan and pay, gasless

Visual: The same invoice page after the payment, the paid notice on screen.

Narration: "The buyer does not even need the gas token. They sign an authorisation on the token itself, a relayer sends it, and the contract records the exact amount. This invoice was paid just now, while filming, through this page."

### Scene 5 — The agent budget

Visual: The agent budget screen, Budget 1 with its caps, allowlist and activity.

Narration: "Otto also lets an AI agent pay bills for you, inside strict limits. The owner sets a total cap, a cap per payment, an approved list of payees and an expiry, and can revoke the budget at any moment. The agent's money never sits in the budget contract. It moves only when every limit passes."

### Scene 6 — The refusal

Visual: The refused transaction on the Aevum explorer, marked failed.

Narration: "And the limits bite. An agent payment of half a tUSD8 sat inside its budget and settled. But when a payment of one tUSD8 broke the per payment cap of nought point seven five, the chain itself refused it. Nothing settled, and the budget was untouched."

### Scene 7 — Close

Visual: The SettleCheckout contract page on the explorer, then the end card.

Narration: "Otto is open source, with sixty eight passing tests, and every flow you have seen is live on the Aevum testnet, ready to check on the explorer. Otto. Exact bills, paid exactly. Built for the Aevum Builder Challenge."

### End card

Visual: Dark card, Otto wordmark, the line "Exact bills, paid exactly.", the contract address, and github.com/Godson-droid/otto.

## Production notes

- App shots captured from the production build at 1920x1080 with a wallet connected per role against the live deployment. In this sandbox the browser's requests to the qday.info endpoints are bridged through Node to the same live endpoints because sandbox Chrome cannot tunnel to that domain; the app is untouched and every state shown was verified independently with cast. See QA_GATE.md observation O2.
- The scene 4 payment is a real 0.10 tUSD8 gasless payment made through the invoice page during the capture session, additional to the four flows in BUILD_LIVE.md and the one in QA_GATE.md. Role balances move accordingly and still total exactly 5.00 tUSD8.
- Each shot is a still with a slow zoom cut to its narration segment; short fades between scenes.
- Captions are the narration text, burned in, and the same captions ship as the otto-demo.srt sidecar.
- Narration synthesized per scene with the Magnus voice so shot lengths lock to the measured audio.
- The video is not uploaded anywhere. Upload waits for Godson's approval.
