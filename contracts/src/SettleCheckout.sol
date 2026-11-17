// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice EIP-3009 (USDC-style) signed transfers. tUSD8 on Aevum implements this.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title SettleCheckout
/// @notice Invoice checkout for Otto. An invoice can only be settled against a quote the
///         merchant signed: the quote fixes the invoice id, the exact amount, the one payer
///         allowed to pay it, and an expiry. There is no way to pay an arbitrary amount
///         toward an invoice, so the starter kit flaw (pay 1 unit, mark the order paid,
///         block the real buyer) does not exist here.
/// @dev Two ways to pay, both verified against the same signed quote:
///      1. `pay`: the quoted payer approves this contract, then calls `pay` (buyer pays gas).
///      2. `payWithAuthorization`: the quoted payer signs an EIP-3009 authorisation whose
///         nonce is the quote hash; anyone (a relayer, the merchant) submits it and the
///         payer needs no native gas.
///      Paid status is amount-verified by construction: `isSettled` only returns true for
///      the exact settled amount, and a bare token transfer to the merchant settles nothing.
contract SettleCheckout is EIP712 {
    using SafeERC20 for IERC20;

    /// @notice A merchant-signed price quote for one invoice.
    /// @param invoiceId Unique invoice id. Generate it randomly (unguessable) in the app.
    /// @param payer The only address allowed to settle this invoice.
    /// @param amount The exact tUSD8 amount (6 decimals) that settles the invoice.
    /// @param expiry Unix timestamp. The quote can only be paid strictly before it.
    struct Quote {
        bytes32 invoiceId;
        address payer;
        uint256 amount;
        uint256 expiry;
    }

    struct Settlement {
        address payer;
        uint256 amount;
        uint64 paidAt;
        bytes32 quoteHash;
    }

    bytes32 public constant QUOTE_TYPEHASH =
        keccak256("Quote(bytes32 invoiceId,address payer,uint256 amount,uint256 expiry)");

    IERC20 public immutable token;
    /// @notice Receives every payment, and the only signer whose quotes are accepted.
    address public immutable merchant;

    mapping(bytes32 invoiceId => Settlement) private _settlements;

    event InvoicePaid(bytes32 indexed invoiceId, address indexed payer, uint256 amount, bytes32 quoteHash);

    error AlreadySettled(bytes32 invoiceId);
    error QuoteExpired(bytes32 invoiceId, uint256 expiry);
    error InvalidQuoteSignature();
    error WrongPayer(address quotedPayer, address actualPayer);
    error ZeroAmount();
    error ZeroAddress();

    constructor(IERC20 token_, address merchant_) EIP712("SettleCheckout", "1") {
        if (address(token_) == address(0) || merchant_ == address(0)) revert ZeroAddress();
        token = token_;
        merchant = merchant_;
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The EIP-712 hash of a quote under this contract's domain. Also used as the
    ///         EIP-3009 nonce, which binds a gasless authorisation to exactly this quote.
    function quoteHash(Quote memory quote) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(QUOTE_TYPEHASH, quote.invoiceId, quote.payer, quote.amount, quote.expiry))
        );
    }

    /// @notice The EIP-3009 nonce a payer must sign to settle `quote` gaslessly.
    function authorizationNonce(Quote memory quote) public view returns (bytes32) {
        return quoteHash(quote);
    }

    /// @notice Settle an invoice by paying its signed quote. Caller must be the quoted payer
    ///         and must have approved this contract for the exact quoted amount.
    /// @param signature The merchant's EIP-712 signature over `quote` (65 bytes, r|s|v).
    function pay(Quote calldata quote, bytes calldata signature) external {
        bytes32 qh = _verifyQuote(quote, signature);
        if (quote.payer != msg.sender) revert WrongPayer(quote.payer, msg.sender);
        _settle(quote, qh);
        token.safeTransferFrom(msg.sender, merchant, quote.amount);
    }

    /// @notice Settle an invoice gaslessly. The quoted payer signs an EIP-3009
    ///         `ReceiveWithAuthorization` (to = this contract, value = the quoted amount,
    ///         nonce = `authorizationNonce(quote)`); anyone may submit it.
    /// @param signature The merchant's EIP-712 signature over `quote` (65 bytes, r|s|v).
    function payWithAuthorization(
        Quote calldata quote,
        bytes calldata signature,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 qh = _verifyQuote(quote, signature);
        _settle(quote, qh);
        IERC3009(address(token)).receiveWithAuthorization(
            quote.payer, address(this), quote.amount, validAfter, validBefore, qh, v, r, s
        );
        token.safeTransfer(merchant, quote.amount);
    }

    function settlementOf(bytes32 invoiceId) external view returns (Settlement memory) {
        return _settlements[invoiceId];
    }

    /// @notice Amount-verified paid status: true only if `invoiceId` was settled for
    ///         exactly `amount`. There is deliberately no amount-free isPaid.
    function isSettled(bytes32 invoiceId, uint256 amount) external view returns (bool) {
        Settlement storage st = _settlements[invoiceId];
        return st.payer != address(0) && st.amount == amount;
    }

    function _verifyQuote(Quote calldata quote, bytes calldata signature) internal view returns (bytes32 qh) {
        if (quote.amount == 0) revert ZeroAmount();
        if (block.timestamp >= quote.expiry) revert QuoteExpired(quote.invoiceId, quote.expiry);
        qh = quoteHash(quote);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(qh, signature);
        if (err != ECDSA.RecoverError.NoError || signer != merchant) revert InvalidQuoteSignature();
    }

    function _settle(Quote calldata quote, bytes32 qh) internal {
        if (_settlements[quote.invoiceId].payer != address(0)) revert AlreadySettled(quote.invoiceId);
        _settlements[quote.invoiceId] =
            Settlement({payer: quote.payer, amount: quote.amount, paidAt: uint64(block.timestamp), quoteHash: qh});
        emit InvoicePaid(quote.invoiceId, quote.payer, quote.amount, qh);
    }
}
