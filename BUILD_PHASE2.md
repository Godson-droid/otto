# Otto, build phase 2 report

Date: 16 November 2026
Scope of this phase: the capped agent budget contract, built and proven locally exactly like phase 1. No live deployment, no faucet claim, nothing posted anywhere.

## What was built

The new contract is contracts/src/AgentBudget.sol. An owner creates a budget for one named agent: a total budget cap in tUSD8, a per payment cap, a payee allowlist and an expiry. The owner can add or remove payees, and can revoke the budget at any moment; after revocation nothing executes.

The design is a gatekeeper, not a vault. AgentBudget never holds funds (its token balance is zero before, during and after every proof below) and it never marks an invoice paid. The money stays in the agent's wallet and moves only through SettleCheckout's gasless EIP 3009 route, so settlement truth stays exactly where phase 1 put it: in SettleCheckout's amount verified record.

How a payment executes:

1. The merchant signs a SettleCheckout quote naming the agent as payer.
2. The agent signs the EIP 3009 authorisation for that quote (its nonce is the quote hash, as in phase 1).
3. Anyone, in practice a relayer, submits both to AgentBudget.executePayment. The agent, the payer side, needs no gas token.
4. AgentBudget checks every limit at once before any token can move: the budget exists, is not revoked and has not expired; the quote's payer is the budget's named agent; the checkout settles in the budget's token; the checkout's merchant (the payee, and the only signer whose quotes that checkout accepts) is on the allowlist; the amount fits the per payment cap; the amount fits what remains of the total cap.
5. Only then does it forward to SettleCheckout.payWithAuthorization, and it emits its own AgentPayment event recording the budget, the agent, the payee, the amount, the invoice id and the quote hash, so every agent payment is auditable on its own.

Being the named agent is proven cryptographically, not by who submits: the quote must name the agent as payer, and only the agent's own signature can move the agent's money. A caller who is not the named agent, presenting their own quote or the agent's quote with their own authorisation, is refused before any token moves. Cap accounting (spent against the caps) is updated before the external call, and if SettleCheckout rejects anything, the whole transaction reverts and the accounting rolls back with it.

## Test results

68 tests pass in total, all of phase 1's 41 included.

- Unit: 55 of 55, including 22 new AgentBudget tests (contracts/test/AgentBudget.t.sol).
- Fork tests against the real tUSD8: 13 of 13, including 5 new AgentBudget fork tests (contracts/test/fork/AgentBudgetFork.t.sol).
- Final bytecode rechecked Shanghai safe.

The positive path covers creation and terms storage, a gasless payment inside the limits submitted by a relayer, the agent submitting directly, spending accumulating across payments, payments exactly at both caps succeeding (five payments of exactly the per payment cap spend exactly the total cap), and paying a second merchant after the owner adds them to the allowlist.

The negative suite proves each limit bites on its own, with no other limit masking it:

- Above the per payment cap: 5 tUSD8 against a 4 cap and a 20 total, refused with PerPaymentCapExceeded.
- Beyond the total budget: 2 tUSD8 that fits the per payment cap but not the 1 tUSD8 remaining, refused with TotalBudgetExceeded.
- Payee not on the allowlist: a fully valid quote from a second merchant's checkout, refused with PayeeNotAllowed; removing a payee blocks later payments the same way.
- After the budget expiry: quote and authorisation still valid for another day, refused with BudgetExpired.
- After revocation: refused with BudgetRevokedError, and the revocation event and non owner management refusals are covered too.
- A caller who is not the named agent: a quote naming a stranger as payer, with the stranger's own valid authorisation, refused with PayerNotAgent whether the stranger or a relayer submits it.
- A quote whose amount was tampered with after signing: SettleCheckout's InvalidQuoteSignature propagates and no cap accounting sticks.
- An authorisation whose amount does not match the quote: the token rejects the signature.
- A quote presented through a merchant's checkout but signed by the wrong merchant: refused by the checkout.
- A replayed quote: refused as already settled, and the cap accounting stays at one payment.
- Creation validation: zero agent, zero or inverted caps, a past expiry and a zero payee all revert; unknown budget ids revert everywhere.

## Fork proof

Executed for real on a local fork node of Aevum (Shanghai, chain 440050, started at block 3,344,030), with anvil's public test accounts 0 (owner), 1 (merchant), 2 (agent) and 3 (relayer):

- SettleCheckout deployed at 0x15f2a413998200Df5aFB99a80231A071F5Ac68E1.
- AgentBudget deployed at 0x3dDA93Eb22b6bD8aa9440263A78892078F54c35C.
- Budget created in transaction 0xa38f87267148a58b059bcfae199c80362bff4be898aec686c809071713a066e6 (block 3,344,035, success): total cap 20 tUSD8, per payment cap 4 tUSD8, expiry one day, allowlist holding only the merchant.
- Payment inside the cap in transaction 0x921d735cbec333d678e0d4926f443f77edf72b33a56e3b1eeabfcd4fd9e48277 (block 3,344,036, success), submitted by the relayer: invoice otto-budget-proof-1 settled at exactly 3 tUSD8. Read immediately afterwards: the agent's balance went from 100.15 to 97.15 tUSD8, the merchant gained exactly 3, the budget showed 3 spent and 17 remaining, and the AgentBudget contract's own balance was zero.
- Payment above the cap in transaction 0x7941def3c234c2a9144f8ffb53d1c9b57c7b46d0152c051c6e8e8800fc7c818c (block 3,344,047, status 0, refused on chain with PerPaymentCapExceeded): a 5 tUSD8 quote against the 4 tUSD8 per payment cap. Invoice otto-budget-proof-2 is not settled, and the budget still shows exactly 3 spent.

Two process notes, for honesty. First, Foundry's script broadcaster landed the budget creation and the inside cap payment, then stopped at gas estimation for the deliberately refused transaction, because it will not send a transaction it knows will revert. The refused attempt was therefore sent with cast send and an explicit gas limit, using signed parameters printed by contracts/script/SignRefusalQuote.s.sol, which is why it exists. The Makefile target documents this two step flow. Second, while this proof ran, a parallel work session began using the same fork node and the same public anvil accounts for its own separate deployment (its own contract addresses). Otto's contract state was rechecked afterwards and is unaffected (spent exactly 3, invoice states unchanged); the shared agent account's balance moved after the readings above, which is why balances are quoted as read immediately after the inside cap payment. The fork node was left running because the parallel session was still active on it.

Scripts: contracts/script/DeployBudget.s.sol, contracts/script/ProofAgentBudget.s.sol and contracts/script/SignRefusalQuote.s.sol, with make targets deploy-budget-fork and proof-budget-fork.

## What remains

- Live testnet deployment of both contracts, with the Discord faucet claim to the phase 1 deployer address (Godson approved Muse posting the claim on his behalf on 16 November 2026).
- The web interface, built on the Figma template base Godson selects.
- Demo activity, video, final QA gate and submission before 11 December 2026, 09:00 WAT.
