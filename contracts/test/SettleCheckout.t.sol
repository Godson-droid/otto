// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {Signing} from "./Signing.sol";
import {QuoteSigning} from "./QuoteSigning.sol";

/// @notice Unit tests for the signed-quote checkout. The negative suite is the point:
///         every attack the starter kit Checkout allows (pay a dust amount to mark an
///         order paid, pay someone else's order, replay, guess the next order id) must
///         fail here.
contract SettleCheckoutTest is Test {
    MockUSD8 token;
    SettleCheckout settle;

    address merchant;
    uint256 merchantKey;
    address buyer;
    uint256 buyerKey;
    address stranger;
    uint256 strangerKey;
    address relayer = makeAddr("relayer");

    bytes32 constant INVOICE = keccak256("invoice-0001");
    uint256 constant PRICE = 5e6; // 5 tUSD8

    function setUp() public {
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        (stranger, strangerKey) = makeAddrAndKey("stranger");
        token = new MockUSD8();
        settle = new SettleCheckout(IERC20(address(token)), merchant);
        token.mint(buyer, 100e6);
        token.mint(stranger, 100e6);
    }

    function _quote(bytes32 invoiceId, address payer, uint256 amount, uint256 expiry)
        internal
        pure
        returns (SettleCheckout.Quote memory)
    {
        return SettleCheckout.Quote({invoiceId: invoiceId, payer: payer, amount: amount, expiry: expiry});
    }

    function _defaultQuote() internal view returns (SettleCheckout.Quote memory) {
        return _quote(INVOICE, buyer, PRICE, block.timestamp + 1 hours);
    }

    function _sign(SettleCheckout.Quote memory q) internal view returns (bytes memory) {
        return QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
    }

    function _signAuth(SettleCheckout.Quote memory q, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        Signing.Auth memory a = Signing.Auth({
            from: q.payer,
            to: address(settle),
            value: q.amount,
            validAfter: 0,
            validBefore: validBefore,
            nonce: settle.authorizationNonce(q)
        });
        return Signing.signReceive(vm, buyerKey, token.DOMAIN_SEPARATOR(), a);
    }

    // ---------- happy paths ----------

    function test_pay_settlesExactAmount() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        vm.expectEmit(true, true, false, true, address(settle));
        emit SettleCheckout.InvoicePaid(INVOICE, buyer, PRICE, settle.quoteHash(q));
        settle.pay(q, sig);
        vm.stopPrank();

        assertEq(token.balanceOf(merchant), PRICE);
        assertEq(token.balanceOf(address(settle)), 0);
        assertEq(token.balanceOf(buyer), 100e6 - PRICE);
        SettleCheckout.Settlement memory st = settle.settlementOf(INVOICE);
        assertEq(st.payer, buyer);
        assertEq(st.amount, PRICE);
        assertEq(st.paidAt, block.timestamp);
        assertEq(st.quoteHash, settle.quoteHash(q));
    }

    function test_isSettled_isAmountVerified() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        settle.pay(q, _sign(q));
        vm.stopPrank();

        assertTrue(settle.isSettled(INVOICE, PRICE));
        assertFalse(settle.isSettled(INVOICE, PRICE - 1));
        assertFalse(settle.isSettled(INVOICE, PRICE + 1));
        assertFalse(settle.isSettled(INVOICE, 1));
        assertFalse(settle.isSettled(keccak256("never-issued"), PRICE));
    }

    function test_payWithAuthorization_gasless_relayerSubmits() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(q, deadline);

        vm.prank(relayer); // the buyer never sends a transaction and holds no gas token
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);

        assertEq(token.balanceOf(merchant), PRICE);
        assertEq(token.balanceOf(buyer), 100e6 - PRICE);
        assertEq(token.balanceOf(address(settle)), 0);
        assertTrue(settle.isSettled(INVOICE, PRICE));
        assertEq(settle.settlementOf(INVOICE).payer, buyer);
        assertTrue(token.authorizationState(buyer, settle.authorizationNonce(q)));
    }

    function test_distinctInvoices_settleIndependently() public {
        bytes32 other = keccak256("invoice-0002");
        SettleCheckout.Quote memory q1 = _defaultQuote();
        SettleCheckout.Quote memory q2 = _quote(other, stranger, 2e6, block.timestamp + 1 hours);

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        settle.pay(q1, _sign(q1));
        vm.stopPrank();

        vm.startPrank(stranger);
        token.approve(address(settle), 2e6);
        settle.pay(q2, _sign(q2));
        vm.stopPrank();

        assertEq(token.balanceOf(merchant), PRICE + 2e6);
        assertTrue(settle.isSettled(INVOICE, PRICE));
        assertTrue(settle.isSettled(other, 2e6));
    }

    function testFuzz_pay_exactQuotedAmount(bytes32 invoiceId, uint256 amount) public {
        amount = bound(amount, 1, 100e6);
        SettleCheckout.Quote memory q = _quote(invoiceId, buyer, amount, block.timestamp + 1 hours);
        vm.startPrank(buyer);
        token.approve(address(settle), amount);
        settle.pay(q, _sign(q));
        vm.stopPrank();
        assertEq(token.balanceOf(merchant), amount);
        assertEq(settle.settlementOf(invoiceId).amount, amount);
        assertTrue(settle.isSettled(invoiceId, amount));
    }

    // ---------- negative suite: the kit flaw is dead ----------

    /// The kit attack: settle an invoice for less than its price. Here the amount lives
    /// inside the merchant's signature, so lowering it breaks the signature.
    function test_underpayment_tamperedAmount_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        q.amount = 1; // attacker edits the quote down to 0.000001 tUSD8 after signing

        vm.startPrank(buyer);
        token.approve(address(settle), 1);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(q, sig);
        vm.stopPrank();

        assertFalse(settle.isSettled(INVOICE, 1));
        assertEq(settle.settlementOf(INVOICE).payer, address(0));
        assertEq(token.balanceOf(merchant), 0);
    }

    /// Approving less than the quote cannot partially settle anything either.
    function test_underpayment_insufficientApproval_doesNotSettle() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE - 1);
        vm.expectRevert();
        settle.pay(q, sig);
        assertFalse(settle.isSettled(INVOICE, PRICE));
        assertEq(token.balanceOf(merchant), 0);

        // The failed attempt leaves no state behind: the real payment still works.
        token.approve(address(settle), PRICE);
        settle.pay(q, sig);
        vm.stopPrank();
        assertTrue(settle.isSettled(INVOICE, PRICE));
    }

    /// Sending the merchant money directly is not a settlement. Status comes from the
    /// contract's amount-verified record, never from a balance or a bare transfer.
    function test_directTransfer_doesNotSettle() public {
        vm.prank(buyer);
        token.transfer(merchant, PRICE);

        assertEq(token.balanceOf(merchant), PRICE);
        assertFalse(settle.isSettled(INVOICE, PRICE));
        assertEq(settle.settlementOf(INVOICE).payer, address(0));
    }

    function test_wrongPayer_standard_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote(); // names buyer as the payer
        bytes memory sig = _sign(q);

        vm.startPrank(stranger);
        token.approve(address(settle), PRICE);
        vm.expectRevert(
            abi.encodeWithSelector(SettleCheckout.WrongPayer.selector, buyer, stranger)
        );
        settle.pay(q, sig);
        vm.stopPrank();

        assertFalse(settle.isSettled(INVOICE, PRICE));
        assertEq(token.balanceOf(merchant), 0);
    }

    function test_wrongPayer_gasless_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote(); // names buyer as the payer
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;

        // The stranger signs their own EIP-3009 authorisation and a relayer submits it
        // against the buyer's quote: the contract only accepts the quoted payer's
        // authorisation (nonce and from are bound to the quote), so this fails.
        Signing.Auth memory a = Signing.Auth({
            from: stranger,
            to: address(settle),
            value: PRICE,
            validAfter: 0,
            validBefore: deadline,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, strangerKey, token.DOMAIN_SEPARATOR(), a);

        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);
        assertFalse(settle.isSettled(INVOICE, PRICE));
    }

    function test_expiredQuote_standard_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        vm.warp(q.expiry); // at expiry the quote is already dead

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.QuoteExpired.selector, INVOICE, q.expiry));
        settle.pay(q, sig);
        vm.stopPrank();
        assertFalse(settle.isSettled(INVOICE, PRICE));
    }

    function test_expiredQuote_gasless_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 2 hours; // the 3009 window is still open...
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(q, deadline);
        vm.warp(q.expiry); // ...but the quote itself has expired

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.QuoteExpired.selector, INVOICE, q.expiry));
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);
        assertFalse(settle.isSettled(INVOICE, PRICE));
    }

    function test_replayedQuote_standard_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);

        vm.startPrank(buyer);
        token.approve(address(settle), 2 * PRICE);
        settle.pay(q, sig);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.AlreadySettled.selector, INVOICE));
        settle.pay(q, sig);
        vm.stopPrank();
        assertEq(token.balanceOf(merchant), PRICE); // paid exactly once
    }

    function test_replayedQuote_gaslessAfterStandard_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(q, deadline);

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        settle.pay(q, sig);
        vm.stopPrank();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.AlreadySettled.selector, INVOICE));
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);
        assertEq(token.balanceOf(merchant), PRICE);
    }

    function test_replayedAuthorization_gasless_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(q, deadline);

        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.AlreadySettled.selector, INVOICE));
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);
        assertEq(token.balanceOf(merchant), PRICE);
    }

    /// Invoice ids can be plain sequential numbers: guessing the next one buys a stranger
    /// nothing, because settlement needs the merchant's signature naming them as payer.
    function test_sequentialInvoiceId_strangerCannotClaim() public {
        bytes32 sequential = bytes32(uint256(1));
        SettleCheckout.Quote memory forged =
            _quote(sequential, stranger, PRICE, block.timestamp + 1 hours);
        bytes memory forgedSig = QuoteSigning.signQuote(vm, strangerKey, settle.DOMAIN_SEPARATOR(), forged);

        vm.startPrank(stranger);
        token.approve(address(settle), PRICE);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(forged, forgedSig);
        vm.stopPrank();

        // A quote signed by the payer (not the merchant) is worthless too.
        bytes memory buyerSig = QuoteSigning.signQuote(vm, buyerKey, settle.DOMAIN_SEPARATOR(), forged);
        vm.prank(stranger);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(forged, buyerSig);

        assertFalse(settle.isSettled(sequential, PRICE));
        assertEq(token.balanceOf(merchant), 0);
    }

    function test_tamperedPayer_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        q.payer = stranger; // reroute the quote to a different payer after signing

        vm.startPrank(stranger);
        token.approve(address(settle), PRICE);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(q, sig);
        vm.stopPrank();
    }

    function test_tamperedExpiry_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        q.expiry = block.timestamp + 30 days; // extend the deadline after signing

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(q, sig);
        vm.stopPrank();
    }

    function test_tamperedInvoiceId_reverts() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        q.invoiceId = keccak256("invoice-9999"); // point the quote at another invoice

        vm.startPrank(buyer);
        token.approve(address(settle), PRICE);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(q, sig);
        vm.stopPrank();
        assertFalse(settle.isSettled(keccak256("invoice-9999"), PRICE));
    }

    function test_zeroAmountQuote_reverts() public {
        SettleCheckout.Quote memory q = _quote(INVOICE, buyer, 0, block.timestamp + 1 hours);
        bytes memory sig = _sign(q);
        vm.prank(buyer);
        vm.expectRevert(SettleCheckout.ZeroAmount.selector);
        settle.pay(q, sig);
    }

    function test_payWithAuthorization_signatureBoundToQuote() public {
        SettleCheckout.Quote memory q = _defaultQuote();
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(q, deadline);

        // Same EIP-3009 authorisation, but a different (also merchant-signed) quote:
        // the nonce is the first quote's hash, so the token rejects it.
        SettleCheckout.Quote memory other =
            _quote(keccak256("invoice-0002"), buyer, PRICE, block.timestamp + 1 hours);
        bytes memory otherSig = _sign(other);
        vm.prank(relayer);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        settle.payWithAuthorization(other, otherSig, 0, deadline, v, r, s);
        assertFalse(settle.isSettled(other.invoiceId, PRICE));
        // Silence the unused-variable warning for sig: it belongs to the first quote,
        // which stays unpaid in this test by design.
        assertEq(sig.length, 65);
    }

    function test_constructor_rejectsZeroAddress() public {
        vm.expectRevert(SettleCheckout.ZeroAddress.selector);
        new SettleCheckout(IERC20(address(0)), merchant);
        vm.expectRevert(SettleCheckout.ZeroAddress.selector);
        new SettleCheckout(IERC20(address(token)), address(0));
    }
}
