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

/// @notice End-to-end proof of Otto's capped agent budget against a running
///         `make fork` node (chain 440050, real tUSD8 state, real transactions).
///         Uses anvil's public test accounts 0 (owner), 1 (merchant), 2 (agent) and
///         3 (relayer). LOCAL FORK ONLY: these keys are public and the balances are
///         fork-only. Before running: deploy with script/DeploySettle.s.sol and
///         script/DeployBudget.s.sol and fund the agent (`make deal TO=<agent>`), then:
///         SETTLE=<address> BUDGETS=<address> forge script \
///           script/ProofAgentBudget.s.sol --rpc-url http://127.0.0.1:8555 --broadcast
///         The second payment is deliberately above the per payment cap: it is sent
///         as a real transaction and must land refused (status 0), spending nothing.
contract ProofAgentBudget is Script {
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;

    uint256 constant TOTAL_CAP = 20e6; // 20 tUSD8
    uint256 constant PER_PAYMENT_CAP = 4e6; // 4 tUSD8

    function run() external {
        require(block.chainid == 440050, "local fork only (chain 440050)");
        SettleCheckout settle = SettleCheckout(vm.envAddress("SETTLE"));
        AgentBudget budgets = AgentBudget(vm.envAddress("BUDGETS"));
        uint256 ownerKey = vm.deriveKey(ANVIL_MNEMONIC, 0);
        uint256 merchantKey = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 agentKey = vm.deriveKey(ANVIL_MNEMONIC, 2);
        uint256 relayerKey = vm.deriveKey(ANVIL_MNEMONIC, 3);
        address merchant = settle.merchant();
        require(merchant == vm.addr(merchantKey), "SETTLE merchant is not anvil account 1");

        uint256 budgetId = _createBudget(budgets, ownerKey, vm.addr(agentKey), merchant);
        _payInsideCap(settle, budgets, budgetId, merchantKey, agentKey, relayerKey);
        _payAboveCapRefused(settle, budgets, budgetId, merchantKey, agentKey, relayerKey);

        ITUSD8View tusd8 = ITUSD8View(TUSD8_ADDR);
        console.log("merchant tUSD8 balance:", tusd8.balanceOf(merchant));
        console.log("agent tUSD8 balance:   ", tusd8.balanceOf(vm.addr(agentKey)));
        console.log("budget spent:          ", budgets.budgetOf(budgetId).spent);
        console.log("budget remaining:      ", budgets.remaining(budgetId));
    }

    function _createBudget(AgentBudget budgets, uint256 ownerKey, address agent, address merchant)
        internal
        returns (uint256 budgetId)
    {
        address[] memory payees = new address[](1);
        payees[0] = merchant;
        vm.startBroadcast(ownerKey);
        budgetId = budgets.createBudget(agent, TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp + 1 days, payees);
        vm.stopBroadcast();
        console.log("budget created, id:", budgetId);
    }

    /// Payment 1: 3 tUSD8, inside the 4 tUSD8 per payment cap. The merchant signs the
    /// quote, the agent signs the EIP-3009 authorisation, the relayer submits.
    function _payInsideCap(
        SettleCheckout settle,
        AgentBudget budgets,
        uint256 budgetId,
        uint256 merchantKey,
        uint256 agentKey,
        uint256 relayerKey
    ) internal {
        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256("otto-budget-proof-1"),
            payer: vm.addr(agentKey),
            amount: 3e6,
            expiry: block.timestamp + 1 hours
        });
        (bytes memory sig, uint8 v, bytes32 r, bytes32 s) = _signAll(settle, q, merchantKey, agentKey);
        vm.startBroadcast(relayerKey);
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        vm.stopBroadcast();
        console.log("payment 1 (3 tUSD8, inside cap) settled:", settle.isSettled(q.invoiceId, q.amount));
    }

    /// Payment 2: 5 tUSD8, above the 4 tUSD8 per payment cap. Sent as a real
    /// transaction through a low level call so the refusal lands on chain (status 0)
    /// instead of aborting this script.
    function _payAboveCapRefused(
        SettleCheckout settle,
        AgentBudget budgets,
        uint256 budgetId,
        uint256 merchantKey,
        uint256 agentKey,
        uint256 relayerKey
    ) internal {
        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256("otto-budget-proof-2"),
            payer: vm.addr(agentKey),
            amount: 5e6,
            expiry: block.timestamp + 1 hours
        });
        (bytes memory sig, uint8 v, bytes32 r, bytes32 s) = _signAll(settle, q, merchantKey, agentKey);
        vm.broadcast(relayerKey);
        (bool ok,) = address(budgets).call(
            abi.encodeCall(
                AgentBudget.executePayment, (budgetId, settle, q, sig, 0, q.expiry, v, r, s)
            )
        );
        console.log("payment 2 (5 tUSD8, above cap) executed:", ok);
        console.log("payment 2 settled:", settle.isSettled(q.invoiceId, q.amount));
    }

    function _signAll(SettleCheckout settle, SettleCheckout.Quote memory q, uint256 merchantKey, uint256 agentKey)
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
        (v, r, s) = Signing.signReceive(vm, agentKey, ITUSD8View(TUSD8_ADDR).DOMAIN_SEPARATOR(), a);
    }
}
