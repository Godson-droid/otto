// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentBudget} from "../../src/AgentBudget.sol";
import {SettleCheckout} from "../../src/SettleCheckout.sol";
import {Signing} from "../Signing.sol";
import {QuoteSigning} from "../QuoteSigning.sol";

interface ITUSD8 is IERC20 {
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address, bytes32) external view returns (bool);
}

/// @notice Runs AgentBudget against the REAL tUSD8 on a local fork of Aevum testnet.
///         No funds needed: `deal` writes a balance into the fork only.
///         Run with: make test-fork (forge test --match-path 'test/fork/*' --fork-url aevum)
contract AgentBudgetForkTest is Test {
    ITUSD8 constant TUSD8 = ITUSD8(0x456569838f1d43009A91ebA4263147Afd7233483);

    address owner = makeAddr("owner");
    address agent;
    uint256 agentKey;
    address merchant;
    uint256 merchantKey;
    address merchant2;
    uint256 merchant2Key;
    address relayer = makeAddr("relayer");

    SettleCheckout settle;
    SettleCheckout settle2;
    AgentBudget budgets;
    uint256 budgetId;

    uint256 constant TOTAL_CAP = 20e6;
    uint256 constant PER_PAYMENT_CAP = 4e6;
    uint256 constant AMOUNT = 3e6;

    function setUp() public {
        (agent, agentKey) = makeAddrAndKey("agent");
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (merchant2, merchant2Key) = makeAddrAndKey("merchant2");
        settle = new SettleCheckout(TUSD8, merchant);
        settle2 = new SettleCheckout(TUSD8, merchant2);
        budgets = new AgentBudget(TUSD8);
        deal(address(TUSD8), agent, 100e6);

        address[] memory payees = new address[](1);
        payees[0] = merchant;
        vm.prank(owner);
        budgetId = budgets.createBudget(agent, TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp + 1 days, payees);
    }

    function _quote(bytes32 invoiceId, uint256 amount) internal view returns (SettleCheckout.Quote memory) {
        return SettleCheckout.Quote({
            invoiceId: invoiceId,
            payer: agent,
            amount: amount,
            expiry: block.timestamp + 1 hours
        });
    }

    function _execute(SettleCheckout s, SettleCheckout.Quote memory q, uint256 signerKey) internal {
        bytes memory sig = QuoteSigning.signQuote(vm, signerKey, s.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: agent,
            to: address(s),
            value: q.amount,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: s.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s_) = Signing.signReceive(vm, agentKey, TUSD8.DOMAIN_SEPARATOR(), a);
        vm.prank(relayer);
        budgets.executePayment(budgetId, s, q, sig, 0, q.expiry, v, r, s_);
    }

    function test_fork_agentPaysInsideCap_realTusd8() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-budget-1"), AMOUNT);
        _execute(settle, q, merchantKey);

        assertEq(TUSD8.balanceOf(merchant), AMOUNT);
        assertEq(TUSD8.balanceOf(agent), 100e6 - AMOUNT);
        assertEq(TUSD8.balanceOf(address(budgets)), 0);
        assertTrue(settle.isSettled(q.invoiceId, AMOUNT));
        assertEq(settle.settlementOf(q.invoiceId).payer, agent);
        assertEq(budgets.budgetOf(budgetId).spent, AMOUNT);
        assertEq(budgets.remaining(budgetId), TOTAL_CAP - AMOUNT);
        assertTrue(TUSD8.authorizationState(agent, settle.authorizationNonce(q)));
    }

    function test_fork_abovePerPaymentCap_realTusd8_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-budget-2"), 5e6);
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: agent,
            to: address(settle),
            value: 5e6,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, agentKey, TUSD8.DOMAIN_SEPARATOR(), a);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PerPaymentCapExceeded.selector, 5e6, PER_PAYMENT_CAP));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(TUSD8.balanceOf(merchant), 0);
        assertFalse(settle.isSettled(q.invoiceId, 5e6));
    }

    function test_fork_payeeNotAllowlisted_realTusd8_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-budget-3"), AMOUNT);
        bytes memory sig = QuoteSigning.signQuote(vm, merchant2Key, settle2.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: agent,
            to: address(settle2),
            value: AMOUNT,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: settle2.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, agentKey, TUSD8.DOMAIN_SEPARATOR(), a);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PayeeNotAllowed.selector, merchant2));
        budgets.executePayment(budgetId, settle2, q, sig, 0, q.expiry, v, r, s);
        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertFalse(settle2.isSettled(q.invoiceId, AMOUNT));
    }

    function test_fork_afterRevoke_realTusd8_reverts() public {
        vm.prank(owner);
        budgets.revokeBudget(budgetId);

        SettleCheckout.Quote memory q = _quote(keccak256("fork-budget-4"), AMOUNT);
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: agent,
            to: address(settle),
            value: AMOUNT,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, agentKey, TUSD8.DOMAIN_SEPARATOR(), a);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.BudgetRevokedError.selector, budgetId));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        assertEq(TUSD8.balanceOf(merchant), 0);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    function test_fork_spendingAccumulates_realTusd8() public {
        _execute(settle, _quote(keccak256("fork-budget-5a"), 4e6), merchantKey);
        _execute(settle, _quote(keccak256("fork-budget-5b"), 4e6), merchantKey);

        assertEq(budgets.budgetOf(budgetId).spent, 8e6);
        assertEq(budgets.remaining(budgetId), TOTAL_CAP - 8e6);
        assertEq(TUSD8.balanceOf(merchant), 8e6);
        assertEq(TUSD8.balanceOf(agent), 100e6 - 8e6);
    }
}
