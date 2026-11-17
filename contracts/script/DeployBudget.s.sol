// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentBudget} from "../src/AgentBudget.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

/// @notice Deploys AgentBudget, bound to the payment token.
///   - Aevum testnet and `make fork`: uses the real tUSD8.
///   - `make anvil` (chain 31337) only: deploys MockUSD8 first.
///   - Anywhere else it stops, rather than bind budgets to a token anyone can mint.
contract DeployBudget is Script {
    address constant AEVUM_TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant ANVIL_CHAIN = 31337;

    function run() external returns (AgentBudget budgets, address token) {
        vm.startBroadcast();
        if (AEVUM_TUSD8.code.length > 0) {
            token = AEVUM_TUSD8;
        } else {
            require(block.chainid == ANVIL_CHAIN, "tUSD8 not found on this chain. Check the RPC (Aevum testnet is 44005).");
            token = address(new MockUSD8());
        }
        budgets = new AgentBudget(IERC20(token));
        vm.stopBroadcast();

        console.log("chainId     ", block.chainid);
        console.log("token       ", token);
        console.log("AgentBudget ", address(budgets));
    }
}
