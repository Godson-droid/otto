// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentBudget} from "../src/AgentBudget.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";
import {Signing} from "../test/Signing.sol";
import {QuoteSigning} from "../test/QuoteSigning.sol";

interface ITUSD8View is IERC20 {
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice End-to-end proof of Otto's four required flows on the real Aevum
///         testnet (chain 44005), against the live SettleCheckout and AgentBudget
///         deployments. Roles are fresh wallets funded by script/FundLive.s.sol;
///         every key comes from the environment (otto/.env, otto/.env.live).
///
///         Flow 1, pay to an address: merchant signs a quote, the payer approves
///         and settles it with `pay` (1.00 tUSD8).
///         Flow 2, request a payment: the merchant issues an invoice (a signed
///         quote created as a payment request) and the named payer settles it
///         (0.75 tUSD8).
///         Flow 3, scan and pay (the public invoice route): the payer settles
///         gaslessly by EIP-3009 authorisation and a relayer submits
///         (0.50 tUSD8); the payer spends no gas.
///         Flow 4, agent payment: the deployer (budget owner) creates a budget
///         for the agent (total cap 1.25, per payment cap 0.75, the merchant
///         allowlisted, one day expiry); the agent settles 0.50 inside the caps
///         through AgentBudget.executePayment, submitted by the relayer.
///         The deliberate above cap attempt (1.00 against the 0.75 per payment
///         cap) is NOT sent here: Foundry's broadcaster refuses transactions it
///         knows will revert. script/SignRefusalLive.s.sol prints its signed
///         parameters and it is sent with `cast send` and an explicit gas
///         limit, so the refusal lands on chain with status 0 (see
///         BUILD_LIVE.md).
///
///         Invoice ids derive from RUN_TAG (default "live1") so a rerun after a
///         partial failure never collides with an already settled invoice.
///         SETTLE, BUDGETS, DEPLOYER_PRIVATE_KEY, MERCHANT_PRIVATE_KEY,
///         PAYER_PRIVATE_KEY, AGENT_PRIVATE_KEY, RELAYER_PRIVATE_KEY
///         forge script script/ProofLive.s.sol --rpc-url https://rpc-test.qday.info \
///           --broadcast --legacy
contract ProofLive is Script {
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;

    uint256 constant FLOW1_AMOUNT = 1_000_000; // 1.00
    uint256 constant FLOW2_AMOUNT = 750_000; // 0.75
    uint256 constant FLOW3_AMOUNT = 500_000; // 0.50
    uint256 constant AGENT_AMOUNT = 500_000; // 0.50
    uint256 constant BUDGET_TOTAL_CAP = 1_250_000; // 1.25
    uint256 constant BUDGET_PER_PAYMENT_CAP = 750_000; // 0.75

    SettleCheckout settle;
    AgentBudget budgets;
    uint256 merchantKey;
    uint256 payerKey;
    uint256 agentKey;
    uint256 relayerKey;
    uint256 expiry;

    function run() external {
        require(block.chainid == 44005, "Aevum testnet only (chain 44005)");
        settle = SettleCheckout(vm.envAddress("SETTLE"));
        budgets = AgentBudget(vm.envAddress("BUDGETS"));
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        merchantKey = vm.envUint("MERCHANT_PRIVATE_KEY");
        payerKey = vm.envUint("PAYER_PRIVATE_KEY");
        agentKey = vm.envUint("AGENT_PRIVATE_KEY");
        relayerKey = vm.envUint("RELAYER_PRIVATE_KEY");
        require(settle.merchant() == vm.addr(merchantKey), "SETTLE merchant does not match MERCHANT_PRIVATE_KEY");
        require(address(settle.token()) == TUSD8_ADDR, "SETTLE is not bound to tUSD8");
        require(address(budgets.token()) == TUSD8_ADDR, "BUDGETS is not bound to tUSD8");

        string memory tag = vm.envOr("RUN_TAG", string("live1"));
        expiry = block.timestamp + 1 hours;

        _payStandard(_invoiceId(tag, "1"), FLOW1_AMOUNT);
        _payStandard(_invoiceId(tag, "2"), FLOW2_AMOUNT);
        _payGasless(_invoiceId(tag, "3"), FLOW3_AMOUNT);

        uint256 budgetId = _createBudget(deployerKey);
        _payAgent(budgetId, _invoiceId(tag, "4"));

        ITUSD8View tusd8 = ITUSD8View(TUSD8_ADDR);
        console.log("merchant tUSD8 balance:", tusd8.balanceOf(settle.merchant()));
        console.log("payer tUSD8 balance:   ", tusd8.balanceOf(vm.addr(payerKey)));
        console.log("agent tUSD8 balance:   ", tusd8.balanceOf(vm.addr(agentKey)));
        console.log("budget id:             ", budgetId);
        console.log("budget spent:          ", budgets.budgetOf(budgetId).spent);
        console.log("budget remaining:      ", budgets.remaining(budgetId));
    }

    function _invoiceId(string memory tag, string memory n) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("otto-", tag, "-invoice-", n));
    }

    function _quote(bytes32 invoiceId, address payer, uint256 amount)
        internal
        view
        returns (SettleCheckout.Quote memory)
    {
        return SettleCheckout.Quote({invoiceId: invoiceId, payer: payer, amount: amount, expiry: expiry});
    }

    /// Merchant quote signature plus the payer's EIP-3009 authorisation over it.
    function _signAll(SettleCheckout.Quote memory q, uint256 signerKey)
        internal
        view
        returns (bytes memory sig, uint8 v, bytes32 r, bytes32 s)
    {
        sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: q.payer,
            to: address(settle),
            value: q.amount,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: settle.authorizationNonce(q)
        });
        (v, r, s) = Signing.signReceive(vm, signerKey, ITUSD8View(TUSD8_ADDR).DOMAIN_SEPARATOR(), a);
    }

    /// Flows 1 and 2, standard path: the merchant signs the quote off chain; the
    /// payer approves and pays exactly the quoted amount.
    function _payStandard(bytes32 invoiceId, uint256 amount) internal {
        SettleCheckout.Quote memory q = _quote(invoiceId, vm.addr(payerKey), amount);
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        vm.startBroadcast(payerKey);
        ITUSD8View(TUSD8_ADDR).approve(address(settle), q.amount);
        settle.pay(q, sig);
        vm.stopBroadcast();
        console.log("settled (standard pay):", settle.isSettled(q.invoiceId, q.amount));
    }

    /// Flow 3, gasless path: the payer signs an EIP-3009 authorisation whose
    /// nonce is the quote hash; the relayer submits and pays the gas.
    function _payGasless(bytes32 invoiceId, uint256 amount) internal {
        SettleCheckout.Quote memory q = _quote(invoiceId, vm.addr(payerKey), amount);
        (bytes memory sig, uint8 v, bytes32 r, bytes32 s) = _signAll(q, payerKey);
        vm.startBroadcast(relayerKey);
        settle.payWithAuthorization(q, sig, 0, expiry, v, r, s);
        vm.stopBroadcast();
        console.log("settled (gasless pay):", settle.isSettled(q.invoiceId, q.amount));
    }

    /// Flow 4 setup: the deployer, as budget owner, grants the agent its mandate.
    function _createBudget(uint256 ownerKey) internal returns (uint256 budgetId) {
        address[] memory payees = new address[](1);
        payees[0] = settle.merchant();
        vm.startBroadcast(ownerKey);
        budgetId = budgets.createBudget(
            vm.addr(agentKey), BUDGET_TOTAL_CAP, BUDGET_PER_PAYMENT_CAP, block.timestamp + 1 days, payees
        );
        vm.stopBroadcast();
        console.log("budget created, id:", budgetId);
    }

    /// Flow 4: 0.50 tUSD8, inside both caps. The merchant signs the quote, the
    /// agent signs the EIP-3009 authorisation, the relayer submits.
    function _payAgent(uint256 budgetId, bytes32 invoiceId) internal {
        SettleCheckout.Quote memory q = _quote(invoiceId, vm.addr(agentKey), AGENT_AMOUNT);
        (bytes memory sig, uint8 v, bytes32 r, bytes32 s) = _signAll(q, agentKey);
        vm.startBroadcast(relayerKey);
        budgets.executePayment(budgetId, settle, q, sig, 0, expiry, v, r, s);
        vm.stopBroadcast();
        console.log("settled (agent payment):", settle.isSettled(q.invoiceId, q.amount));
    }
}
