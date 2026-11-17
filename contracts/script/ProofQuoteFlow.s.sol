// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";
import {Signing} from "../test/Signing.sol";
import {QuoteSigning} from "../test/QuoteSigning.sol";

interface ITUSD8View is IERC20 {
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice End-to-end proof of Otto's signed quote flow against a running `make fork`
///         node (chain 440050, real tUSD8 state, real transactions). Uses anvil's public
///         test accounts 1 (merchant), 2 (buyer) and 3 (relayer). LOCAL FORK ONLY: these
///         keys are public and the balances are fork-only.
///         Before running: deploy with script/DeploySettle.s.sol and fund the buyer
///         (`make deal TO=<buyer>`), then:
///         SETTLE=<address> forge script script/ProofQuoteFlow.s.sol \
///           --rpc-url http://127.0.0.1:8555 --broadcast
contract ProofQuoteFlow is Script {
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external {
        require(block.chainid == 440050, "local fork only (chain 440050)");
        SettleCheckout settle = SettleCheckout(vm.envAddress("SETTLE"));
        uint256 merchantKey = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 buyerKey = vm.deriveKey(ANVIL_MNEMONIC, 2);
        uint256 relayerKey = vm.deriveKey(ANVIL_MNEMONIC, 3);
        uint256 expiry = block.timestamp + 1 hours;

        _payStandard(settle, merchantKey, buyerKey, expiry);
        _payGasless(settle, merchantKey, buyerKey, relayerKey, expiry);

        ITUSD8View tusd8 = ITUSD8View(TUSD8_ADDR);
        console.log("merchant tUSD8 balance:", tusd8.balanceOf(settle.merchant()));
        console.log("buyer tUSD8 balance:   ", tusd8.balanceOf(vm.addr(buyerKey)));
    }

    /// Invoice 1, standard path: the merchant signs the quote off-chain; the buyer
    /// approves and pays exactly the quoted amount.
    function _payStandard(SettleCheckout settle, uint256 merchantKey, uint256 buyerKey, uint256 expiry)
        internal
    {
        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256("otto-fork-invoice-1"),
            payer: vm.addr(buyerKey),
            amount: 5e6,
            expiry: expiry
        });
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        vm.startBroadcast(buyerKey);
        ITUSD8View(TUSD8_ADDR).approve(address(settle), q.amount);
        settle.pay(q, sig);
        vm.stopBroadcast();
        console.log("invoice 1 settled (standard):", settle.isSettled(q.invoiceId, q.amount));
    }

    /// Invoice 2, gasless path: the buyer additionally signs an EIP-3009 authorisation
    /// whose nonce is the quote hash; the relayer submits and pays the gas.
    function _payGasless(
        SettleCheckout settle,
        uint256 merchantKey,
        uint256 buyerKey,
        uint256 relayerKey,
        uint256 expiry
    ) internal {
        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256("otto-fork-invoice-2"),
            payer: vm.addr(buyerKey),
            amount: 3e6,
            expiry: expiry
        });
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: q.payer,
            to: address(settle),
            value: q.amount,
            validAfter: 0,
            validBefore: expiry,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) =
            Signing.signReceive(vm, buyerKey, ITUSD8View(TUSD8_ADDR).DOMAIN_SEPARATOR(), a);
        vm.startBroadcast(relayerKey);
        settle.payWithAuthorization(q, sig, 0, expiry, v, r, s);
        vm.stopBroadcast();
        console.log("invoice 2 settled (gasless):", settle.isSettled(q.invoiceId, q.amount));
    }
}
