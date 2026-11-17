// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {SettleCheckout} from "../src/SettleCheckout.sol";

/// @dev Builds merchant EIP-712 signatures over SettleCheckout quotes, the same way the
///      merchant's wallet or backend would.
library QuoteSigning {
    bytes32 internal constant QUOTE_TYPEHASH =
        keccak256("Quote(bytes32 invoiceId,address payer,uint256 amount,uint256 expiry)");

    function signQuote(Vm vm, uint256 pk, bytes32 domainSeparator, SettleCheckout.Quote memory q)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(QUOTE_TYPEHASH, q.invoiceId, q.payer, q.amount, q.expiry));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
