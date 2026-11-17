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

/// @notice Prints the signed parameters for the over cap payment of
///         script/ProofAgentBudget.s.sol (invoice "otto-budget-proof-2", 5 tUSD8
///         against a 4 tUSD8 per payment cap), so the attempt can be sent as a real
///         transaction with `cast send` and land on chain refused (status 0).
///         Foundry's script broadcaster will not send a transaction it knows will
///         revert, which is why this one step goes through cast. Read only: run
///         WITHOUT --broadcast against the fork RPC.
///         SETTLE=<address> forge script script/SignRefusalQuote.s.sol \
///           --rpc-url http://127.0.0.1:8555
contract SignRefusalQuote is Script {
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external view {
        require(block.chainid == 440050, "local fork only (chain 440050)");
        SettleCheckout settle = SettleCheckout(vm.envAddress("SETTLE"));
        uint256 merchantKey = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 agentKey = vm.deriveKey(ANVIL_MNEMONIC, 2);

        SettleCheckout.Quote memory q = SettleCheckout.Quote({
            invoiceId: keccak256("otto-budget-proof-2"),
            payer: vm.addr(agentKey),
            amount: 5e6,
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
