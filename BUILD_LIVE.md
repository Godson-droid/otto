# Otto, live phase report (part 1: deployment and contract level proof)

Date: 16 November 2026
Scope of this phase: deploy SettleCheckout and AgentBudget to the real Aevum testnet (chain 44005), fund the demo roles from the Discord faucet float, run the four required flows live through the contracts, verify every settlement on chain state, and repoint the web app at the live deployment. No demo video, no GitHub push, no DoraHacks submission in this phase.

## Funding

The Discord faucet claim for the deployer address landed while this phase was polling: exactly 1 tQDAY and 5 tUSD8 to the deployer, 0x3EFe17e855fD3D76EdD06BA87D84a9D5C7D26D9C. No other funding route was used or needed.

Demo roles are fresh wallets created for this phase. Their keys live only in otto/.env.live (mode 600, ignored by git) and are never printed anywhere.

- Merchant (signs quotes, receives every payment): 0x14B1aa000Fa304A8CCB1eBCEa30e7284d936E7aE
- Payer: 0x6Fde300972Cb9BCd42De1a712729BD2388c7d6a8
- Agent: 0xE7E60685BAB7024F3b4f2f0a84edb6ff7B8E1cBE
- Relayer: 0xCcEb2AAEf7cDaBcD7973946C978bf9D56aA54C54
- Budget owner: the deployer itself.

One process note, for honesty. The first four role keypairs generated in this phase were printed into a tool log by a misdirected output stream. They were discarded unused and never funded, exactly as phase 1 handled the same accident, and the roles above are the replacements, generated with their keys written straight to the env file.

The deployer spread the float with script/FundLive.s.sol, all four transfers in block 3352362, all successful:

- Payer gas float, 0.1 tQDAY: 0x8459d652fa2a7944c160ffc7cc75559099d27f2ea5a6037d715a19535305c7ae
- Relayer gas float, 0.1 tQDAY: 0x68e65e8a063fe641f2db12ae5c3b81d57db9e43732e3040802362f780c1b744f
- Payer payment float, 2.50 tUSD8: 0x4e81d3846b798ae4d3f850640e6de5df5f3e3d66fbcbf8fceb065aae7c3d8479
- Agent payment float, 1.50 tUSD8: 0xabd9333759176a4a6f663028a612a90055022f5cf7e1834a02d8f6c4e90d0ffd

The merchant needed no funding: it only signs quotes off chain and receives payments. The agent needed no gas token: its payments are submitted by the relayer.

## Deployment

Both contracts deployed from the deployer with legacy transactions at 1 gwei, and both verified on chain afterwards (merchant binding and tUSD8 binding read back from the deployed contracts).

- SettleCheckout: 0x6a041F98390e352Db4Cdd2CC255061246A43a048
  Deploy transaction 0x86cc7337f2e829c1942371a73d06443d3c5a12f8802cbafe7e246a5fd51d5c19, block 3352316, gas used 990,964.
  Explorer: https://explorer-test.qday.info/address/0x6a041F98390e352Db4Cdd2CC255061246A43a048
- AgentBudget: 0xa321Ef5A86f9E8e28226f0Ae7295987376c25dc7
  Deploy transaction 0x1168a5edad989b3147827346243d699faca047df71a41c0c4f41feda49eb1c76, block 3352333, gas used 964,201.
  Explorer: https://explorer-test.qday.info/address/0xa321Ef5A86f9E8e28226f0Ae7295987376c25dc7

## The four flows, live

Run by script/ProofLive.s.sol (run tag live1) and verified afterwards by reading settlementOf for every invoice from chain state, not from transaction success alone.

### Flow 1: pay to an address (standard signed quote pay), 1.00 tUSD8

- Invoice 0xeba0d7f0dbd21b577eae9d97de997ade0468c6c50265cf738fa58a441054b5f6
- Approve transaction 0x8d89a2d4d62de722a069e3926a116c46ae4a853ef52f337f87bedd43d680c2f2, block 3352395
- Pay transaction 0x5f9d74d46e48294ab96edc6cdcdbf149b1df9d6bd76340ce3301ffaa1e9425a1, block 3352398
- Chain state: settled for the payer at exactly 1.00 tUSD8, quote hash 0xf0b2ba836a3551b147f9ba74996f5190b7f839865e79133e85b7e81375f12c27

### Flow 2: request a payment (merchant issues the invoice, payer settles it), 0.75 tUSD8

- Invoice 0x357a74e00da25d15b6c1acef10d5d4be64c18d65ab4bc4576d8608a1656ef4f7
- Approve transaction 0xacc7c2e38fc6a052f04e569a4af886f2a780b01ad5cc746c0bcbde98e0ed5425, block 3352401
- Pay transaction 0x161138b510b5692292cb0cab531e49bd5bbceaef802550c5168128c91838f064, block 3352404
- Chain state: settled for the payer at exactly 0.75 tUSD8, quote hash 0xd1b9611beb7753c7f93405eda1fce02933500f276311ef4ade19da09bf1bf49f

### Flow 3: scan and pay (public invoice route, gasless EIP 3009), 0.50 tUSD8

- Invoice 0x0e053a34b624fc6d82cb360a7c042f65369139aff30acca30309495fb34abd90
- PayWithAuthorization transaction 0x2131028ee3739f6c000a5138db5a7ca8237e3c8fb02015caa03c4f6f5a76a294, block 3352407, submitted and paid for by the relayer; the payer signed only and spent no gas
- Chain state: settled for the payer at exactly 0.50 tUSD8, quote hash 0x121fb8f9b14fd8ed7b23f9fb92db5ae72c985799f96f882e7bae75384472030f

### Flow 4: agent payment under a capped budget, 0.50 tUSD8, plus the above cap refusal

- Budget created by the deployer as owner, transaction 0x12d895780ca69167a63212d4b3bcce754c6cfceb5205f062e26272fdb7d40f31, block 3352410. Budget id 1: agent as above, total cap 1.25 tUSD8, per payment cap 0.75 tUSD8, expiry 1794950621, the merchant the only allowlisted payee.
- Inside cap payment, invoice 0xe0d04ad6cc601928b35bde6aaec14fa07cb98e43ed9ea144798b025fe5356c56, executePayment transaction 0xc711fb176f6568f1379ba28a199d67d04d23d4bedd54f4c71f0115bf9c8cfd2c, block 3352413, submitted by the relayer.
- Chain state: settled for the agent at exactly 0.50 tUSD8, quote hash 0x816ce70febac0dfa31c606731f7a3366abe9df0fb6ebbfe12598aa8c1df3a1cb. Budget reads spent 0.50, remaining 0.75.
- Above cap attempt, invoice 0x07ddae2960b2510fe88fd6bed2986dfe48e3b56f2743311eec2de28ddc50d455: a 1.00 tUSD8 quote against the 0.75 per payment cap, signed properly by merchant and agent and sent as a real transaction by the relayer (signed parameters printed by script/SignRefusalLive.s.sol, sent with cast send and an explicit gas limit, because Foundry's broadcaster will not send a transaction it knows will revert). Transaction 0xc54aba508a00a65f038a9edaea902b8419ceac1630ebf115d675721b00a37665, block 3352460, status 0. Replaying the same call returns the revert PerPaymentCapExceeded with the amount 1.00 and the cap 0.75. Afterwards the invoice is not settled, the budget still reads spent 0.50, and the agent's balance is unchanged.

## Balance reconciliation

tUSD8, read from chain state after every flow completed. The faucet's 5.00 is accounted for to the cent.

- Deployer: started 5.00, funded the payer 2.50 and the agent 1.50, ends 1.00
- Merchant: received 1.00 + 0.75 + 0.50 + 0.50 across the four flows, ends 2.75
- Payer: funded 2.50, paid 1.00 + 0.75 + 0.50, ends 0.25
- Agent: funded 1.50, paid 0.50, ends 1.00
- Relayer: 0.00 throughout
- Total across all roles: 5.00, matching the faucet exactly
- SettleCheckout holds 0 tUSD8 (payments pass straight through to the merchant) and AgentBudget holds 0 tUSD8 (it is a gatekeeper, never a vault), both read from chain state

Gas, for completeness: every transaction ran at 1 gwei. The payer spent exactly 430,106 gas across its four transactions and the relayer exactly 484,819 across its three, each matching its receipts to the unit. The deployer ends with 0.797706447 tQDAY after both deployments, the four funding transfers, the budget creation and the 0.2 tQDAY of role floats.

## Web app repoint

web/.env.local now leads with the Aevum network: NEXT_PUBLIC_SETTLE_AEVUM and NEXT_PUBLIC_AGENT_BUDGET_AEVUM hold the live addresses above, NEXT_PUBLIC_DEPLOY_BLOCK_AEVUM is 3352316, and RELAYER_PRIVATE_KEY is the funded live relayer wallet, so gasless payments through the app's relay route work on testnet. The fork entries from the interface phase are kept below them for local work.

Verification against the live configuration: the type check passes clean and the production build succeeds with all seven routes (/, /pay, /pay/[invoiceId], /request, /budget, /receipts/[orderId], /api/relay).

## Scripts added in this phase

- contracts/script/FundLive.s.sol (make fund-live)
- contracts/script/ProofLive.s.sol (make proof-live SETTLE=... BUDGETS=...)
- contracts/script/SignRefusalLive.s.sol (make sign-refusal-live SETTLE=...)
- Live deploy targets in the Makefile: deploy-settle-aevum, deploy-budget-aevum

## What remains

- Drive the same four flows through the web interface against this live deployment and capture the demo (part 2 of the live phase).
- Independent QA gate, GitHub push, and the DoraHacks submission, all before 11 December 2026, 09:00 WAT.
