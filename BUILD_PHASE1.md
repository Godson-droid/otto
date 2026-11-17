# Otto, build phase 1 report

Date: 16 November 2026
Scope of this phase: scaffold, deployer wallet, and the signed quote payment flow proven on a local fork. No live deployment, no faucet claim, nothing posted anywhere.

## What was built

The project scaffold is a full copy of the Aevum starter kit with its licence and notices kept, the shared aevum package and chunked log reader kept, and the setup checker kept. The empty library folders were replaced with real submodules: forge std v1.14.0 and OpenZeppelin v5.4.0. Before any change, the kit baseline was verified: it builds, its 11 unit tests pass, and its bytecode passes the Shanghai check.

A fresh deployer wallet was created for this build. Its key lives only in the project env file, which is ignored by git. Deployer address: 0x3EFe17e855fD3D76EdD06BA87D84a9D5C7D26D9C. During creation, one early keypair was discarded unused after its key appeared in a tool log; only the replacement keypair is stored.

## SettleCheckout

The new contract is contracts/src/SettleCheckout.sol. The merchant signs an EIP 712 quote holding the invoice id, the payer, the exact amount and an expiry. Both payment paths check the signature, the exact amount, the named payer and the expiry before any money moves:

- pay: the standard path, payer approves and the contract pulls the exact quoted amount.
- payWithAuthorization: the gasless path, built on the EIP 3009 signed transfer in tUSD8, with the quote hash as the authorisation nonce, so a relayer can submit and the payer needs no gas token.

There is deliberately no amount free paid flag. Settlement is only ever reported by isSettled with the amount attached, and sending tokens straight to the merchant settles nothing. This closes the documented flaw in the starter kit checkout, where anyone could pay any amount on any order and mark it paid.

## Test results

41 tests pass in total.

- Unit: 33 of 33, including 22 new SettleCheckout tests and one fuzz test at 256 runs, plus the 11 kit tests.
- Fork tests against the real tUSD8 contract: 8 of 8.

The negative suite proves the kit flaw is dead: a tampered amount fails the signature check; paying without approval settles nothing and leaves clean state; a direct transfer to the merchant does not settle; the wrong payer is rejected on both paths; an expired quote is rejected on both paths; replaying a quote is rejected on the same path and across paths; a sequential invoice id cannot be claimed by a stranger or with a payer signed quote; a tampered payer, expiry or invoice id all fail; a zero amount quote fails.

## Fork proof

The flow was executed for real on a local fork node of Aevum (Shanghai, started at block 3,342,256):

- SettleCheckout deployed at 0x7100DD5bb790382BD3223EdcA3A6C34F27a2ED7c, deploy transaction 0xd206f7ab6107334962efcd54b64ca432ba29f34f84c2d0d19360d333257d9ee2.
- Standard pay transaction 0x3428b06163348aa47b5f401fad44c60457e56b2564c0f2cec3cca518359e1991 settled invoice 1 at exactly 5 tUSD8. A check at the wrong amount of 1 correctly reported not settled.
- Gasless payWithAuthorization transaction 0x37c08a5cb372233c1a905f4f1fcf2fb38f8021c59eb967d7a050f4191467274b settled invoice 2 at exactly 3 tUSD8, submitted by a relayer, with the buyer recorded as payer.
- Balances reconcile exactly: 100.15 minus 5 minus 3 equals 92.15 tUSD8.

Scripts live at contracts/script/DeploySettle.s.sol and contracts/script/ProofQuoteFlow.s.sol, with make targets deploy settle fork and proof fork.

## What remains

- The agent budget contract (capped agent payments with expiry and revoke).
- Live testnet deployment, with the Discord faucet claim to the deployer address above (Godson approved Muse posting the claim on his behalf on 16 November 2026).
- The web interface, built on a high quality free Figma template.
- Demo activity, video, final QA gate and submission before 11 December 2026, 09:00 WAT.
