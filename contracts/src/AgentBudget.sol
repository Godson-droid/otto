// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SettleCheckout} from "./SettleCheckout.sol";

/// @title AgentBudget
/// @notice A spending mandate an owner grants to one named agent, enforced on chain.
///         The owner fixes a total budget cap, a per payment cap, a payee allowlist and
///         an expiry. The agent can then settle merchant signed SettleCheckout quotes
///         gaslessly, but only while every limit holds at once. The owner can revoke
///         the mandate at any moment, and after revocation nothing executes.
/// @dev Gatekeeper, not a vault: this contract never holds funds and never marks an
///      invoice paid. The money stays in the agent's wallet and moves only through
///      SettleCheckout's EIP-3009 route, where settlement truth lives (see
///      `SettleCheckout.isSettled`). This contract only decides whether a payment may
///      proceed and keeps the running total spent against the caps.
///
///      Submission is permissionless, exactly like phase 1: a relayer submits and pays
///      the gas, so the agent (the payer side) needs no gas token. Being "the named
///      agent" is proven cryptographically, not by msg.sender: the quote must name the
///      budget's agent as its payer, and the EIP-3009 authorisation that moves the
///      money must carry that same agent's signature over the quote hash. Anyone else
///      presenting a quote, or the agent's quote with their own authorisation, is
///      refused before any token moves.
contract AgentBudget {
    /// @notice One owner's mandate to one agent. `spent` is cap accounting only; it is
    ///         not a settlement record and says nothing about any single invoice.
    struct Budget {
        address owner;
        address agent;
        uint256 totalCap;
        uint256 perPaymentCap;
        uint256 spent;
        uint256 expiry;
        bool revoked;
    }

    /// @notice The token every budget is denominated in (tUSD8 on Aevum).
    IERC20 public immutable token;

    mapping(uint256 budgetId => Budget) private _budgets;
    mapping(uint256 budgetId => mapping(address payee => bool)) private _allowlist;
    /// @notice Next budget id. Ids start at 1; 0 is never a real budget.
    uint256 public nextBudgetId = 1;

    event BudgetCreated(
        uint256 indexed budgetId,
        address indexed owner,
        address indexed agent,
        uint256 totalCap,
        uint256 perPaymentCap,
        uint256 expiry
    );
    event PayeeAdded(uint256 indexed budgetId, address indexed payee);
    event PayeeRemoved(uint256 indexed budgetId, address indexed payee);
    event BudgetRevoked(uint256 indexed budgetId);
    /// @notice One auditable record per executed agent payment.
    event AgentPayment(
        uint256 indexed budgetId,
        address indexed agent,
        address indexed payee,
        uint256 amount,
        bytes32 invoiceId,
        bytes32 quoteHash
    );

    error BudgetNotFound(uint256 budgetId);
    error NotBudgetOwner(uint256 budgetId, address caller);
    error BudgetRevokedError(uint256 budgetId);
    error BudgetExpired(uint256 budgetId, uint256 expiry);
    error PayerNotAgent(address quotedPayer, address agent);
    error PayeeNotAllowed(address payee);
    error PerPaymentCapExceeded(uint256 amount, uint256 perPaymentCap);
    error TotalBudgetExceeded(uint256 amount, uint256 remaining);
    error WrongToken(address settleToken);
    error ZeroAddress();
    error InvalidCaps();
    error InvalidExpiry();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    /// @notice Create a budget for one named agent. The caller becomes the owner: only
    ///         the owner can manage the allowlist or revoke.
    /// @param agent The only payer whose quotes this budget will execute.
    /// @param totalCap Lifetime spend ceiling in tUSD8 (6 decimals).
    /// @param perPaymentCap Single payment ceiling; must be positive and no larger
    ///        than `totalCap`.
    /// @param expiry Unix timestamp. Payments execute only strictly before it.
    /// @param payees Merchants the agent may pay (the merchants of the SettleCheckout
    ///        contracts it will pay through). More can be added later.
    function createBudget(
        address agent,
        uint256 totalCap,
        uint256 perPaymentCap,
        uint256 expiry,
        address[] calldata payees
    ) external returns (uint256 budgetId) {
        if (agent == address(0)) revert ZeroAddress();
        if (totalCap == 0 || perPaymentCap == 0 || perPaymentCap > totalCap) revert InvalidCaps();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        budgetId = nextBudgetId++;
        _budgets[budgetId] = Budget({
            owner: msg.sender,
            agent: agent,
            totalCap: totalCap,
            perPaymentCap: perPaymentCap,
            spent: 0,
            expiry: expiry,
            revoked: false
        });
        for (uint256 i = 0; i < payees.length; i++) {
            if (payees[i] == address(0)) revert ZeroAddress();
            _allowlist[budgetId][payees[i]] = true;
            emit PayeeAdded(budgetId, payees[i]);
        }
        emit BudgetCreated(budgetId, msg.sender, agent, totalCap, perPaymentCap, expiry);
    }

    /// @notice Allow one more payee under an existing budget. Owner only.
    function addPayee(uint256 budgetId, address payee) external {
        _requireOwner(budgetId);
        if (payee == address(0)) revert ZeroAddress();
        _allowlist[budgetId][payee] = true;
        emit PayeeAdded(budgetId, payee);
    }

    /// @notice Remove a payee from a budget. Owner only.
    function removePayee(uint256 budgetId, address payee) external {
        _requireOwner(budgetId);
        _allowlist[budgetId][payee] = false;
        emit PayeeRemoved(budgetId, payee);
    }

    /// @notice Revoke a budget. Owner only, effective immediately and permanently:
    ///         after this, no payment under the budget can execute.
    function revokeBudget(uint256 budgetId) external {
        Budget storage b = _requireOwner(budgetId);
        b.revoked = true;
        emit BudgetRevoked(budgetId);
    }

    /// @notice Settle one merchant signed quote under a budget, gaslessly. Anyone may
    ///         submit (a relayer pays the gas); the payment itself is authorised by the
    ///         named agent's EIP-3009 signature, whose nonce is the quote hash.
    /// @param settle The SettleCheckout the quote belongs to. Its merchant is the
    ///        payee, and it must settle in this contract's token.
    /// @param quote The merchant signed quote. Its payer must be the budget's agent.
    /// @param signature The merchant's EIP-712 signature over `quote` (65 bytes).
    function executePayment(
        uint256 budgetId,
        SettleCheckout settle,
        SettleCheckout.Quote calldata quote,
        bytes calldata signature,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _checkAndAccount(budgetId, settle, quote);
        settle.payWithAuthorization(quote, signature, validAfter, validBefore, v, r, s);
    }

    /// @dev Every limit must hold at once, checked before any token can move. Cap
    ///      accounting is updated here, before the external call; if SettleCheckout
    ///      rejects the quote or the authorisation, the whole transaction reverts and
    ///      the accounting rolls back with it. Settlement itself is recorded only by
    ///      SettleCheckout, never here.
    function _checkAndAccount(uint256 budgetId, SettleCheckout settle, SettleCheckout.Quote calldata quote)
        internal
    {
        Budget storage b = _budgets[budgetId];
        if (b.owner == address(0)) revert BudgetNotFound(budgetId);
        if (b.revoked) revert BudgetRevokedError(budgetId);
        if (block.timestamp >= b.expiry) revert BudgetExpired(budgetId, b.expiry);

        // Only the named agent can be the payer of an executable quote, and only the
        // agent's own EIP-3009 signature (checked by the token inside SettleCheckout)
        // can move the funds. A quote naming anyone else is refused here.
        if (quote.payer != b.agent) revert PayerNotAgent(quote.payer, b.agent);
        if (address(settle.token()) != address(token)) revert WrongToken(address(settle.token()));

        // The payee of a SettleCheckout payment is always that contract's merchant:
        // it receives the funds and is the only signer whose quotes it accepts.
        address payee = settle.merchant();
        if (!_allowlist[budgetId][payee]) revert PayeeNotAllowed(payee);

        if (quote.amount > b.perPaymentCap) revert PerPaymentCapExceeded(quote.amount, b.perPaymentCap);
        uint256 remaining = b.totalCap - b.spent;
        if (quote.amount > remaining) revert TotalBudgetExceeded(quote.amount, remaining);

        b.spent += quote.amount;
        emit AgentPayment(budgetId, b.agent, payee, quote.amount, quote.invoiceId, settle.quoteHash(quote));
    }

    function budgetOf(uint256 budgetId) external view returns (Budget memory) {
        if (_budgets[budgetId].owner == address(0)) revert BudgetNotFound(budgetId);
        return _budgets[budgetId];
    }

    function isPayeeAllowed(uint256 budgetId, address payee) external view returns (bool) {
        return _allowlist[budgetId][payee];
    }

    /// @notice Spend left under the total cap.
    function remaining(uint256 budgetId) external view returns (uint256) {
        Budget storage b = _budgets[budgetId];
        if (b.owner == address(0)) revert BudgetNotFound(budgetId);
        return b.totalCap - b.spent;
    }

    function _requireOwner(uint256 budgetId) internal view returns (Budget storage b) {
        b = _budgets[budgetId];
        if (b.owner == address(0)) revert BudgetNotFound(budgetId);
        if (msg.sender != b.owner) revert NotBudgetOwner(budgetId, msg.sender);
    }
}
