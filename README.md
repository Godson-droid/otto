# Otto

Otto is a payment app for freelancers and small merchants on the Aevum testnet, built for the Aevum Builder Challenge. A seller sends a buyer one exact bill. The buyer pays that exact amount in tUSD8, with their own wallet or with a signed authorisation that needs no gas token at all. An AI agent can also be given a small, capped budget to pay approved bills on the owner's behalf, and the owner can take that budget back at any moment.

## Why Otto exists

The starter checkout most teams begin from has a real flaw, documented by its own authors: anyone can pay any amount on any order and the order is marked paid. Pay a fraction of a bill and the seller's screen says settled, while the real buyer is blocked. Otto is built so that can never happen. A bill only settles when the full quoted amount arrives from the buyer named on the quote, before the quote expires.

## How a payment works

1. The merchant creates a quote: an invoice id, the buyer's address, the exact amount and an expiry, signed with the merchant's key.
2. The buyer pays in one of two ways. The standard way is a normal wallet payment. The gasless way is a signed authorisation on tUSD8 itself, sent in by a relayer, so a buyer holding no gas token can still pay.
3. The contract checks the signature, the amount, the buyer and the expiry before moving any money. Anything short, late, replayed or from the wrong person is rejected.
4. Settlement is only ever reported together with its amount. There is no bare paid flag to fool, and sending tokens straight to the merchant settles nothing.

## What is built

- SettleCheckout, the quote based payment contract, and AgentBudget, the capped agent budget contract. Together they pass 68 tests: 55 unit tests including the negative suites that prove the starter kit flaw is closed and every budget limit bites on its own, and 13 fork tests against the real tUSD8.
- AgentBudget in short: an owner grants one named agent a total cap, a per payment cap, a payee allowlist and an expiry, revocable at any moment. The contract holds no funds and marks nothing paid; it only checks the limits and forwards the agent's own signed authorisation to SettleCheckout.
- The web interface, built on the Viola UI design system: dashboard, pay to an address with an identity check, payment requests with share links and scan codes, the public invoice page, and the agent budget screen. See BUILD_UI.md.
- Both contracts are deployed on the Aevum testnet and all four flows have been run live, with every settlement read back from chain state and every balance reconciling to the cent. The full record is in BUILD_LIVE.md, and an independent check of all of it is in QA_GATE.md.

## Live on the Aevum testnet

Chain 44005, RPC https://rpc-test.qday.info, explorer https://explorer-test.qday.info.

- SettleCheckout: 0x6a041F98390e352Db4Cdd2CC255061246A43a048
- AgentBudget: 0xa321Ef5A86f9E8e28226f0Ae7295987376c25dc7

Transactions that show the app working: a standard payment of 1.00 tUSD8 (0x5f9d74d46e48294ab96edc6cdcdbf149b1df9d6bd76340ce3301ffaa1e9425a1), a requested payment of 0.75 (0x161138b510b5692292cb0cab531e49bd5bbceaef802550c5168128c91838f064), a gasless scan and pay of 0.50 submitted by a relayer (0x2131028ee3739f6c000a5138db5a7ca8237e3c8fb02015caa03c4f6f5a76a294), an agent payment of 0.50 inside its budget (0xc711fb176f6568f1379ba28a199d67d04d23d4bedd54f4c71f0115bf9c8cfd2c), and a 1.00 agent payment attempt the chain refused because it broke the 0.75 per payment cap (0xc54aba508a00a65f038a9edaea902b8419ceac1630ebf115d675721b00a37665).

## How it fits together

The merchant's key signs a quote off chain. SettleCheckout is the only place settlement truth lives: it verifies the quote signature, the exact amount, the named payer and the expiry, then moves tUSD8 straight to the merchant and records the settlement with its amount. The gasless path adds a signed authorisation on tUSD8 itself (the EIP 3009 transferWithAuthorization message), with the quote hash as its nonce, so a relayer can submit it and the payer needs no gas token. AgentBudget sits in front of that same gasless path for agent payments: it checks the budget, the caps, the allowlist and the expiry first, and only then forwards the agent's authorisation to SettleCheckout. The web app reads settlement state and events from the chain, signs quotes and authorisations in the payer's wallet, and offers a relay route that rechecks both signatures before it spends any gas.

## Run it yourself

You need Foundry, Node 22 and pnpm.

1. Clone this repo with its submodules, or run the submodule update after cloning.
2. Contracts: use the Makefile at the repo root. The unit tests need no network and no keys; the fork tests read the public Aevum RPC. Only the live deployment and proof scripts need keys, and they read them from .env and .env.live at the repo root, which are never committed.
3. Web: copy web/.env.example to web/.env.local and fill in the contract addresses (the live ones above work), a WalletConnect project id, and a funded relayer key if you want gasless payments through the app. Then install from the repo root and start the web app.

The Makefile targets are documented in the Makefile itself: check runs the build, the Shanghai opcode check and both test suites.

## Layout

- contracts: the Foundry contracts and tests.
- packages/aevum: chain configuration, ABIs and helpers shared across the app.
- examples: small TypeScript programs, including a setup checker and a gasless payment relay.
- web: the Next.js interface.

## Credit

Based on Aevum Starter Kit by the QDay team, used under its MIT licence. The kit's licence and notices are kept in this repository.

The web interface is built on the Viola UI design system by Kseniya Savitsyna (violaui.com), free tier, used under the maker's licence for personal and commercial projects. Viola's token file ships unedited in web/src/styles/viola-tokens.css, and the maker's free agent pack is kept in design/ for reference.
