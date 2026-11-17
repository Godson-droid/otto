// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";
import {Signing} from "../test/Signing.sol";
import {QuoteSigning} from "../test/QuoteSigning.sol";

interface ITUSD8Domain {
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice Prints the signed parameters for the deliberate above cap agent
///         payment of script/ProofLive.s.sol (invoice 5 of the run: 1.00 tUSD8
///         against the budget's 0.75 per payment cap), so the attempt can be
///         sent as a real transaction with `cast send` and an explicit gas
///         limit and land on Aevum testnet refused (status 0,
///         PerPaymentCapExceeded). Foundry's script broadcaster will not send
///         a transaction it knows will revert, which is why this one step goes
///         through cast. Read only: run WITHOUT --broadcast.
///         SETTLE=<address> forge script script/SignRefusalLive.s.sol \
///           --rpc-url https://rpc-test.qday.info
contract SignRefusalLive is Script {
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant ABOVE_CAP_AMOUNT = 1_000_000; // 1.00, over the 0.75 per payment cap

    function run() external view {
        require(block.chainid == 44005, "Aevum testnet only (chain 44005)");
        SettleCheckout settle = SettleCheckout(vm.envAddress("SETTLE"));
        uint256 merchantKey = vm.envUint("MERCHANT_PRIVATE_KEY");
        uint256 agentKey = vm.envUint("AGENT_PRIVATE_KEY");
        string memory tag = vm.envOr("RUN_TAG", string("live1"));

        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256(abi.encodePacked("otto-", tag, "-invoice-5")),
            payer: vm.addr(agentKey),
            amount: ABOVE_CAP_AMOUNT,
            expiry: block.timestamp + 1 hours
        });
        bytes memory sig = QuoteSigning.signQuote(vm, merchantKey, settle.DOMAIN_SEPARATOR(), q);
        Signing.Auth memory a = Signing.Auth({
            from: q.payer,
            to: address(settle),
            value: q.amount,
            validAfter: 0,
            validBefore: q.expiry,
            nonce: settle.authorizationNonce(q)
        });
        (uint8 v, bytes32 r, bytes32 s) =
            Signing.signReceive(vm, agentKey, ITUSD8Domain(TUSD8_ADDR).DOMAIN_SEPARATOR(), a);

        console.log("INVOICE", vm.toString(q.invoiceId));
        console.log("PAYER", q.payer);
        console.log("AMOUNT", q.amount);
        console.log("EXPIRY", q.expiry);
        console.log("SIG", vm.toString(sig));
        console.log("V", v);
        console.log("R", vm.toString(r));
        console.log("S", vm.toString(s));
    }
}
