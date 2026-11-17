import { parseAbi, type Address } from "viem";

/** tUSD8 on Aevum testnet: a USDC-style token (FiatTokenV2) with 6 decimals, EIP-2612 and EIP-3009. */
export const TUSD8_ADDRESS: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
export const TUSD8_DECIMALS = 6;

/** EIP-712 domain of tUSD8. MockUSD8 (local) uses the same name and version. */
export function tusd8Domain(chainId: number, verifyingContract: Address) {
  return { name: "tUSD8", version: "2", chainId, verifyingContract } as const;
}

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export const eip3009Abi = parseAbi([
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

/** ERC-8004 style identity registry found on Aevum testnet (Confirmation of Payee). */
export const IDENTITY_REGISTRY_ADDRESS: Address = "0xF45E7f39Caba1d2055f613970575a7e7069636Be";

export const identityRegistryAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

/** ABI of contracts/src/SettleCheckout.sol (Otto: merchant signed quotes). */
export const settleCheckoutAbi = parseAbi([
  "function token() view returns (address)",
  "function merchant() view returns (address)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function quoteHash((bytes32 invoiceId, address payer, uint256 amount, uint256 expiry) quote) view returns (bytes32)",
  "function authorizationNonce((bytes32 invoiceId, address payer, uint256 amount, uint256 expiry) quote) view returns (bytes32)",
  "function pay((bytes32 invoiceId, address payer, uint256 amount, uint256 expiry) quote, bytes signature)",
  "function payWithAuthorization((bytes32 invoiceId, address payer, uint256 amount, uint256 expiry) quote, bytes signature, uint256 validAfter, uint256 validBefore, uint8 v, bytes32 r, bytes32 s)",
  "function settlementOf(bytes32 invoiceId) view returns ((address payer, uint256 amount, uint64 paidAt, bytes32 quoteHash))",
  "function isSettled(bytes32 invoiceId, uint256 amount) view returns (bool)",
  "event InvoicePaid(bytes32 indexed invoiceId, address indexed payer, uint256 amount, bytes32 quoteHash)",
  "error AlreadySettled(bytes32 invoiceId)",
  "error QuoteExpired(bytes32 invoiceId, uint256 expiry)",
  "error InvalidQuoteSignature()",
  "error WrongPayer(address quotedPayer, address actualPayer)",
  "error ZeroAmount()",
  "error ZeroAddress()",
]);

/** ABI of contracts/src/AgentBudget.sol (Otto: capped agent payment mandates). */
export const agentBudgetAbi = parseAbi([
  "function token() view returns (address)",
  "function nextBudgetId() view returns (uint256)",
  "function createBudget(address agent, uint256 totalCap, uint256 perPaymentCap, uint256 expiry, address[] payees) returns (uint256 budgetId)",
  "function addPayee(uint256 budgetId, address payee)",
  "function removePayee(uint256 budgetId, address payee)",
  "function revokeBudget(uint256 budgetId)",
  "function executePayment(uint256 budgetId, address settle, (bytes32 invoiceId, address payer, uint256 amount, uint256 expiry) quote, bytes signature, uint256 validAfter, uint256 validBefore, uint8 v, bytes32 r, bytes32 s)",
  "function budgetOf(uint256 budgetId) view returns ((address owner, address agent, uint256 totalCap, uint256 perPaymentCap, uint256 spent, uint256 expiry, bool revoked))",
  "function isPayeeAllowed(uint256 budgetId, address payee) view returns (bool)",
  "function remaining(uint256 budgetId) view returns (uint256)",
  "event BudgetCreated(uint256 indexed budgetId, address indexed owner, address indexed agent, uint256 totalCap, uint256 perPaymentCap, uint256 expiry)",
  "event PayeeAdded(uint256 indexed budgetId, address indexed payee)",
  "event PayeeRemoved(uint256 indexed budgetId, address indexed payee)",
  "event BudgetRevoked(uint256 indexed budgetId)",
  "event AgentPayment(uint256 indexed budgetId, address indexed agent, address indexed payee, uint256 amount, bytes32 invoiceId, bytes32 quoteHash)",
  "error BudgetNotFound(uint256 budgetId)",
  "error NotBudgetOwner(uint256 budgetId, address caller)",
  "error BudgetRevokedError(uint256 budgetId)",
  "error BudgetExpired(uint256 budgetId, uint256 expiry)",
  "error PayerNotAgent(address quotedPayer, address agent)",
  "error PayeeNotAllowed(address payee)",
  "error PerPaymentCapExceeded(uint256 amount, uint256 perPaymentCap)",
  "error TotalBudgetExceeded(uint256 amount, uint256 remaining)",
  "error WrongToken(address settleToken)",
  "error ZeroAddress()",
  "error InvalidCaps()",
  "error InvalidExpiry()",
]);

/** ABI of contracts/src/Checkout.sol. */
export const checkoutAbi = parseAbi([
  "function token() view returns (address)",
  "function merchant() view returns (address)",
  "function pay(bytes32 orderId, uint256 amount)",
  "function payWithAuthorization(bytes32 orderId, address from, uint256 amount, uint256 validAfter, uint256 validBefore, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationNonce(bytes32 orderId) view returns (bytes32)",
  "function isPaid(bytes32 orderId) view returns (bool)",
  "function paymentOf(bytes32 orderId) view returns ((address payer, uint64 paidAt, uint256 amount))",
  "event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount)",
  "error AlreadyPaid(bytes32 orderId)",
  "error ZeroAmount()",
  "error ZeroAddress()",
]);
