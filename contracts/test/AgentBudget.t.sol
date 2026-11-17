// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentBudget} from "../src/AgentBudget.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {Signing} from "./Signing.sol";
import {QuoteSigning} from "./QuoteSigning.sol";

/// @notice Unit tests for the capped agent budget. The positive path proves an agent
///         can pay gaslessly inside its mandate; the negative suite proves every
///         limit bites on its own, with no other limit masking the failure.
contract AgentBudgetTest is Test {
    MockUSD8 token;
    SettleCheckout settle; // merchant is its payee
    SettleCheckout settle2; // merchant2 is its payee
    AgentBudget budgets;

    address owner;
    address agent;
    uint256 agentKey;
    address merchant;
    uint256 merchantKey;
    address merchant2;
    uint256 merchant2Key;
    address stranger;
    uint256 strangerKey;
    address relayer = makeAddr("relayer");

    uint256 budgetId;
    uint256 constant TOTAL_CAP = 20e6; // 20 tUSD8
    uint256 constant PER_PAYMENT_CAP = 4e6; // 4 tUSD8
    uint256 constant AMOUNT = 3e6; // 3 tUSD8, inside every limit

    function setUp() public {
        owner = makeAddr("owner");
        (agent, agentKey) = makeAddrAndKey("agent");
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (merchant2, merchant2Key) = makeAddrAndKey("merchant2");
        (stranger, strangerKey) = makeAddrAndKey("stranger");
        token = new MockUSD8();
        settle = new SettleCheckout(IERC20(address(token)), merchant);
        settle2 = new SettleCheckout(IERC20(address(token)), merchant2);
        budgets = new AgentBudget(IERC20(address(token)));
        token.mint(agent, 100e6);
        token.mint(stranger, 100e6);

        vm.prank(owner);
        budgetId = budgets.createBudget(
            agent, TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp + 1 days, _payees(merchant)
        );
    }

    function _payees(address a) internal pure returns (address[] memory p) {
        p = new address[](1);
        p[0] = a;
    }

    function _quote(bytes32 invoiceId, address payer, uint256 amount, uint256 expiry)
        internal
        pure
        returns (SettleCheckout.Quote memory)
    {
        return SettleCheckout.Quote({invoiceId: invoiceId, payer: payer, amount: amount, expiry: expiry});
    }

    function _agentQuote(bytes32 invoiceId, uint256 amount) internal view returns (SettleCheckout.Quote memory) {
        return _quote(invoiceId, agent, amount, block.timestamp + 1 hours);
    }

    function _sign(SettleCheckout s, SettleCheckout.Quote memory q, uint256 key) internal view returns (bytes memory) {
        return QuoteSigning.signQuote(vm, key, s.DOMAIN_SEPARATOR(), q);
    }

    function _auth(SettleCheckout s, SettleCheckout.Quote memory q, uint256 key, uint256 value)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s_)
    {
        Signing.Auth memory a = Signing.Auth({
            from: q.payer,
            to: address(s),
            value: value,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: s.authorizationNonce(q)
        });
        return Signing.signReceive(vm, key, token.DOMAIN_SEPARATOR(), a);
    }

    /// The standard execution: merchant signs the quote, the agent signs the EIP-3009
    /// authorisation, a relayer submits. `signerKey`/`authValue` exist so negative
    /// tests can break exactly one thing.
    function _execute(
        uint256 id,
        SettleCheckout s,
        SettleCheckout.Quote memory q,
        uint256 merchantSigningKey,
        uint256 authKey,
        uint256 authValue
    ) internal {
        bytes memory sig = _sign(s, q, merchantSigningKey);
        (uint8 v, bytes32 r, bytes32 s_) = _auth(s, q, authKey, authValue);
        vm.prank(relayer);
        budgets.executePayment(id, s, q, sig, 0, q.expiry, v, r, s_);
    }

    function _executeDefault(bytes32 invoiceId, uint256 amount) internal {
        SettleCheckout.Quote memory q = _agentQuote(invoiceId, amount);
        _execute(budgetId, settle, q, merchantKey, agentKey, amount);
    }

    // ---------- creation and management ----------

    function test_createBudget_storesTermsAndEmits() public {
        vm.expectEmit(true, true, true, true, address(budgets));
        emit AgentBudget.BudgetCreated(2, owner, agent, 50e6, 5e6, block.timestamp + 2 days);
        vm.prank(owner);
        uint256 id = budgets.createBudget(agent, 50e6, 5e6, block.timestamp + 2 days, _payees(merchant2));

        assertEq(id, 2);
        AgentBudget.Budget memory b = budgets.budgetOf(id);
        assertEq(b.owner, owner);
        assertEq(b.agent, agent);
        assertEq(b.totalCap, 50e6);
        assertEq(b.perPaymentCap, 5e6);
        assertEq(b.spent, 0);
        assertEq(b.expiry, block.timestamp + 2 days);
        assertFalse(b.revoked);
        assertEq(budgets.remaining(id), 50e6);
        assertTrue(budgets.isPayeeAllowed(id, merchant2));
        assertFalse(budgets.isPayeeAllowed(id, merchant));
    }

    function test_createBudget_validation() public {
        vm.startPrank(owner);
        vm.expectRevert(AgentBudget.ZeroAddress.selector);
        budgets.createBudget(address(0), TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp + 1 days, _payees(merchant));
        vm.expectRevert(AgentBudget.InvalidCaps.selector);
        budgets.createBudget(agent, 0, PER_PAYMENT_CAP, block.timestamp + 1 days, _payees(merchant));
        vm.expectRevert(AgentBudget.InvalidCaps.selector);
        budgets.createBudget(agent, TOTAL_CAP, 0, block.timestamp + 1 days, _payees(merchant));
        vm.expectRevert(AgentBudget.InvalidCaps.selector);
        budgets.createBudget(agent, TOTAL_CAP, TOTAL_CAP + 1, block.timestamp + 1 days, _payees(merchant));
        vm.expectRevert(AgentBudget.InvalidExpiry.selector);
        budgets.createBudget(agent, TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp, _payees(merchant));
        vm.expectRevert(AgentBudget.ZeroAddress.selector);
        budgets.createBudget(agent, TOTAL_CAP, PER_PAYMENT_CAP, block.timestamp + 1 days, _payees(address(0)));
        vm.stopPrank();
    }

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(AgentBudget.ZeroAddress.selector);
        new AgentBudget(IERC20(address(0)));
    }

    function test_nonOwner_cannotManage() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.NotBudgetOwner.selector, budgetId, stranger));
        budgets.revokeBudget(budgetId);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.NotBudgetOwner.selector, budgetId, agent));
        budgets.addPayee(budgetId, merchant2);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.NotBudgetOwner.selector, budgetId, stranger));
        budgets.removePayee(budgetId, merchant);
    }

    function test_unknownBudget_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.BudgetNotFound.selector, 999));
        budgets.budgetOf(999);
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-unknown"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.BudgetNotFound.selector, 999));
        budgets.executePayment(999, settle, q, sig, 0, q.expiry, v, r, s);
    }

    // ---------- positive path ----------

    function test_executePayment_insideLimits_settlesGaslessly() public {
        bytes32 invoiceId = keccak256("inv-1");
        SettleCheckout.Quote memory q = _agentQuote(invoiceId, AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);

        vm.expectEmit(true, true, true, true, address(budgets));
        emit AgentBudget.AgentPayment(budgetId, agent, merchant, AMOUNT, invoiceId, settle.quoteHash(q));
        vm.prank(relayer); // the agent never sends a transaction and holds no gas token
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(token.balanceOf(merchant), AMOUNT);
        assertEq(token.balanceOf(agent), 100e6 - AMOUNT);
        // The gatekeeper holds nothing and settles nothing itself.
        assertEq(token.balanceOf(address(budgets)), 0);
        assertEq(token.balanceOf(address(settle)), 0);
        assertTrue(settle.isSettled(invoiceId, AMOUNT));
        assertEq(settle.settlementOf(invoiceId).payer, agent);
        assertEq(budgets.budgetOf(budgetId).spent, AMOUNT);
        assertEq(budgets.remaining(budgetId), TOTAL_CAP - AMOUNT);
        assertTrue(token.authorizationState(agent, settle.authorizationNonce(q)));
    }

    function test_executePayment_agentSubmitsDirectly() public {
        bytes32 invoiceId = keccak256("inv-direct");
        SettleCheckout.Quote memory q = _agentQuote(invoiceId, AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);

        vm.prank(agent);
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        assertTrue(settle.isSettled(invoiceId, AMOUNT));
        assertEq(budgets.budgetOf(budgetId).spent, AMOUNT);
    }

    function test_executePayment_spendingAccumulates() public {
        _executeDefault(keccak256("inv-a"), 3e6);
        _executeDefault(keccak256("inv-b"), 4e6);
        _executeDefault(keccak256("inv-c"), 1e6);

        assertEq(budgets.budgetOf(budgetId).spent, 8e6);
        assertEq(budgets.remaining(budgetId), TOTAL_CAP - 8e6);
        assertEq(token.balanceOf(merchant), 8e6);
        assertEq(token.balanceOf(agent), 100e6 - 8e6);
    }

    /// Amounts exactly at the caps are allowed: five payments of exactly the per
    /// payment cap spend exactly the total cap.
    function test_executePayment_exactCaps_succeed() public {
        for (uint256 i = 0; i < 5; i++) {
            _executeDefault(keccak256(abi.encodePacked("inv-cap-", i)), PER_PAYMENT_CAP);
        }
        assertEq(budgets.budgetOf(budgetId).spent, TOTAL_CAP);
        assertEq(budgets.remaining(budgetId), 0);
        assertEq(token.balanceOf(merchant), TOTAL_CAP);
    }

    function test_executePayment_secondMerchant_afterAddPayee() public {
        vm.prank(owner);
        budgets.addPayee(budgetId, merchant2);
        assertTrue(budgets.isPayeeAllowed(budgetId, merchant2));

        bytes32 invoiceId = keccak256("inv-m2");
        SettleCheckout.Quote memory q = _agentQuote(invoiceId, AMOUNT);
        _execute(budgetId, settle2, q, merchant2Key, agentKey, AMOUNT);

        assertEq(token.balanceOf(merchant2), AMOUNT);
        assertTrue(settle2.isSettled(invoiceId, AMOUNT));
        assertEq(budgets.budgetOf(budgetId).spent, AMOUNT);
    }

    // ---------- negative suite: each limit bites on its own ----------

    /// 5 tUSD8 is inside the 20 total cap, so only the 4 per payment cap can refuse it.
    function test_abovePerPaymentCap_reverts() public {
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-over-perpay"), 5e6);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, 5e6);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PerPaymentCapExceeded.selector, 5e6, PER_PAYMENT_CAP));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(merchant), 0);
        assertEq(token.balanceOf(agent), 100e6);
        assertFalse(settle.isSettled(q.invoiceId, 5e6));
    }

    /// A small budget where the per payment cap cannot be the blocker: after spending
    /// 4 of 5, a 2 tUSD8 payment fits the per payment cap but not what remains.
    function test_exceedsTotalBudget_reverts() public {
        vm.prank(owner);
        uint256 small = budgets.createBudget(agent, 5e6, 5e6, block.timestamp + 1 days, _payees(merchant));

        SettleCheckout.Quote memory q1 = _agentQuote(keccak256("inv-small-1"), 4e6);
        _execute(small, settle, q1, merchantKey, agentKey, 4e6);
        assertEq(budgets.remaining(small), 1e6);

        SettleCheckout.Quote memory q2 = _agentQuote(keccak256("inv-small-2"), 2e6);
        bytes memory sig = _sign(settle, q2, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q2, agentKey, 2e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.TotalBudgetExceeded.selector, 2e6, 1e6));
        budgets.executePayment(small, settle, q2, sig, 0, q2.expiry, v, r, s);

        assertEq(budgets.budgetOf(small).spent, 4e6);
        assertFalse(settle.isSettled(q2.invoiceId, 2e6));
        assertEq(token.balanceOf(merchant), 4e6);
    }

    /// merchant2's checkout is fully valid, its quote properly signed; the only
    /// problem is that merchant2 is not on this budget's allowlist.
    function test_payeeNotAllowlisted_reverts() public {
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-m2-blocked"), AMOUNT);
        bytes memory sig = _sign(settle2, q, merchant2Key);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle2, q, agentKey, AMOUNT);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PayeeNotAllowed.selector, merchant2));
        budgets.executePayment(budgetId, settle2, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(merchant2), 0);
        assertFalse(settle2.isSettled(q.invoiceId, AMOUNT));
    }

    function test_removePayee_blocksLaterPayments() public {
        vm.prank(owner);
        budgets.removePayee(budgetId, merchant);
        assertFalse(budgets.isPayeeAllowed(budgetId, merchant));

        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-removed"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PayeeNotAllowed.selector, merchant));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        assertEq(budgets.budgetOf(budgetId).spent, 0);
    }

    /// The quote and its authorisation stay valid for two days; the budget dies
    /// after one, and that alone refuses the payment.
    function test_afterBudgetExpiry_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("inv-late"), agent, AMOUNT, block.timestamp + 2 days);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);

        vm.warp(block.timestamp + 1 days); // exactly the budget expiry: already dead
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(AgentBudget.BudgetExpired.selector, budgetId, block.timestamp)
        );
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    function test_afterRevoke_reverts() public {
        vm.expectEmit(true, false, false, false, address(budgets));
        emit AgentBudget.BudgetRevoked(budgetId);
        vm.prank(owner);
        budgets.revokeBudget(budgetId);
        assertTrue(budgets.budgetOf(budgetId).revoked);

        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-revoked"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.BudgetRevokedError.selector, budgetId));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(merchant), 0);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    /// A quote naming the stranger as payer is a perfectly good SettleCheckout quote,
    /// and the stranger's own authorisation is valid too. The budget still refuses
    /// it: the payer is not the agent this budget names.
    function test_callerNotNamedAgent_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("inv-stranger"), stranger, AMOUNT, block.timestamp + 1 hours);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, strangerKey, AMOUNT);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PayerNotAgent.selector, stranger, agent));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        // A relayer submitting the same stranger quote is refused identically.
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AgentBudget.PayerNotAgent.selector, stranger, agent));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(stranger), 100e6);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    /// The quote names the agent, but the authorisation was signed by the stranger:
    /// the token itself rejects it, because only the named agent's signature can
    /// move the agent's money.
    function test_agentQuote_strangerAuthorization_reverts() public {
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-forged-auth"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, strangerKey, AMOUNT);

        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(agent), 100e6);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    /// Lowering the amount after the merchant signed breaks the quote signature;
    /// SettleCheckout's refusal propagates and no cap accounting sticks.
    function test_tamperedQuoteAmount_reverts() public {
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-tampered"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);
        q.amount = 2e6; // edited after signing, still inside every cap

        vm.prank(relayer);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertFalse(settle.isSettled(q.invoiceId, 2e6));
    }

    /// The agent's authorisation must match the quote exactly: an authorisation for
    /// a different amount is a different signed message, and the token rejects it.
    function test_authAmountMismatch_reverts() public {
        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-mismatch"), AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT - 1);

        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);
        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertFalse(settle.isSettled(q.invoiceId, AMOUNT));
    }

    /// merchant2 is allowlisted and the quote is presented through merchant2's own
    /// checkout, but it was signed by merchant, not merchant2: the payee does not
    /// match the signer, and the checkout refuses it.
    function test_quoteSignedByWrongMerchant_reverts() public {
        vm.prank(owner);
        budgets.addPayee(budgetId, merchant2);

        SettleCheckout.Quote memory q = _agentQuote(keccak256("inv-wrong-signer"), AMOUNT);
        bytes memory sig = _sign(settle2, q, merchantKey); // settle2's domain, wrong key
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle2, q, agentKey, AMOUNT);

        vm.prank(relayer);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        budgets.executePayment(budgetId, settle2, q, sig, 0, q.expiry, v, r, s);
        assertEq(budgets.budgetOf(budgetId).spent, 0);
        assertEq(token.balanceOf(merchant2), 0);
    }

    /// A settled quote cannot be executed twice; the second attempt reverts inside
    /// SettleCheckout and the cap accounting stays at one payment.
    function test_replayedQuote_revertsAndCountsOnce() public {
        bytes32 invoiceId = keccak256("inv-replay");
        _executeDefault(invoiceId, AMOUNT);

        SettleCheckout.Quote memory q = _agentQuote(invoiceId, AMOUNT);
        bytes memory sig = _sign(settle, q, merchantKey);
        (uint8 v, bytes32 r, bytes32 s) = _auth(settle, q, agentKey, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.AlreadySettled.selector, invoiceId));
        budgets.executePayment(budgetId, settle, q, sig, 0, q.expiry, v, r, s);

        assertEq(budgets.budgetOf(budgetId).spent, AMOUNT);
        assertEq(token.balanceOf(merchant), AMOUNT);
    }
}
