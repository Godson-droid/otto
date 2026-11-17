// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SettleCheckout} from "../../src/SettleCheckout.sol";
import {Signing} from "../Signing.sol";
import {QuoteSigning} from "../QuoteSigning.sol";

interface ITUSD8 is IERC20 {
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address, bytes32) external view returns (bool);
}

/// @notice Runs SettleCheckout against the REAL tUSD8 on a local fork of Aevum testnet.
///         No funds needed: `deal` writes a balance into the fork only.
///         Run with: make test-fork (forge test --match-path 'test/fork/*' --fork-url aevum)
contract SettleForkTest is Test {
    ITUSD8 constant TUSD8 = ITUSD8(0x456569838f1d43009A91ebA4263147Afd7233483);

    address merchant;
    uint256 merchantKey;
    address buyer;
    uint256 buyerKey;
    SettleCheckout settle;

    uint256 constant PRICE = 5e6; // 5 tUSD8

    function setUp() public {
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        settle = new SettleCheckout(TUSD8, merchant);
        deal(address(TUSD8), buyer, 100e6);
    }

    function _quote(bytes32 invoiceId, uint256 amount, uint256 expiry)
        internal
        view
        returns (SettleCheckout.Quote memory)
    {
        return SettleCheckout.Quote({invoiceId: invoiceId, payer: buyer, amount: amount, expiry: expiry});
    }

    function _sign(SettleCheckout.Quote memory q) internal view returns (bytes memory) {
        return QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
    }

    function test_fork_standardPay_realTusd8() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-invoice-1"), PRICE, block.timestamp + 1 hours);

        vm.startPrank(buyer);
        TUSD8.approve(address(settle), PRICE);
        settle.pay(q, _sign(q));
        vm.stopPrank();

        assertEq(TUSD8.balanceOf(merchant), PRICE);
        assertEq(TUSD8.balanceOf(buyer), 100e6 - PRICE);
        assertTrue(settle.isSettled(q.invoiceId, PRICE));
        assertFalse(settle.isSettled(q.invoiceId, PRICE - 1));
        assertEq(settle.settlementOf(q.invoiceId).quoteHash, settle.quoteHash(q));
    }

    function test_fork_gaslessPayWithAuthorization_realTusd8() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-invoice-2"), PRICE, block.timestamp + 1 hours);
        bytes memory sig = _sign(q);
        uint256 deadline = block.timestamp + 1 hours;
        Signing.Auth memory a = Signing.Auth({
            from: buyer,
            to: address(settle),
            value: PRICE,
            validAfter: 0,
            validBefore: deadline,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(vm, buyerKey, TUSD8.DOMAIN_SEPARATOR(), a);

        vm.prank(makeAddr("relayer"));
        settle.payWithAuthorization(q, sig, 0, deadline, v, r, s);

        assertEq(TUSD8.balanceOf(merchant), PRICE);
        assertEq(TUSD8.balanceOf(buyer), 100e6 - PRICE);
        assertTrue(settle.isSettled(q.invoiceId, PRICE));
        assertTrue(TUSD8.authorizationState(buyer, settle.authorizationNonce(q)));
    }

    function test_fork_underpaymentAttempt_realTusd8_doesNotSettle() public {
        bytes32 invoiceId = keccak256("fork-invoice-3");
        SettleCheckout.Quote memory q = _quote(invoiceId, PRICE, block.timestamp + 1 hours);
        bytes memory sig = _sign(q);
        q.amount = 1; // the kit attack: rewrite the price down after signing

        vm.startPrank(buyer);
        TUSD8.approve(address(settle), 1);
        vm.expectRevert(SettleCheckout.InvalidQuoteSignature.selector);
        settle.pay(q, sig);
        vm.stopPrank();

        // And paying the merchant directly settles nothing.
        vm.prank(buyer);
        TUSD8.transfer(merchant, PRICE);
        assertEq(TUSD8.balanceOf(merchant), PRICE);
        assertFalse(settle.isSettled(invoiceId, PRICE));
        assertEq(settle.settlementOf(invoiceId).payer, address(0));
    }

    function test_fork_expiredQuote_realTusd8_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-invoice-4"), PRICE, block.timestamp + 1 hours);
        bytes memory sig = _sign(q);
        vm.warp(q.expiry);

        vm.startPrank(buyer);
        TUSD8.approve(address(settle), PRICE);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.QuoteExpired.selector, q.invoiceId, q.expiry));
        settle.pay(q, sig);
        vm.stopPrank();
        assertFalse(settle.isSettled(q.invoiceId, PRICE));
    }

    function test_fork_wrongPayer_realTusd8_reverts() public {
        SettleCheckout.Quote memory q = _quote(keccak256("fork-invoice-5"), PRICE, block.timestamp + 1 hours);
        bytes memory sig = _sign(q);
        address stranger = makeAddr("stranger");
        deal(address(TUSD8), stranger, 100e6);

        vm.startPrank(stranger);
        TUSD8.approve(address(settle), PRICE);
        vm.expectRevert(abi.encodeWithSelector(SettleCheckout.WrongPayer.selector, buyer, stranger));
        settle.pay(q, sig);
        vm.stopPrank();
        assertFalse(settle.isSettled(q.invoiceId, PRICE));
    }
}
