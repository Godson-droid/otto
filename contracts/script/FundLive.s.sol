// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Funds Otto's live demo roles from the deployer wallet on Aevum testnet
///         (chain 44005). The deployer was funded once by the Discord faucet
///         (1 tQDAY + 5 tUSD8); this script spreads a working float from it:
///           payer   0.1 tQDAY (gas for approve + pay) and 2.50 tUSD8
///           agent   1.50 tUSD8 (gasless by design, needs no tQDAY)
///           relayer 0.1 tQDAY (gas for submitting the gasless flows)
///         The merchant only signs quotes off chain and receives payments, so it
///         needs no funding at all. Keys and addresses come from the environment
///         (otto/.env and otto/.env.live, both gitignored); nothing is printed
///         except addresses and amounts.
///         DEPLOYER_PRIVATE_KEY, PAYER_ADDRESS, AGENT_ADDRESS, RELAYER_ADDRESS
///         forge script script/FundLive.s.sol --rpc-url https://rpc-test.qday.info \
///           --broadcast --legacy
contract FundLive is Script {
    address constant TUSD8_ADDR = 0x456569838f1d43009A91ebA4263147Afd7233483;

    uint256 constant PAYER_GAS = 0.1 ether;
    uint256 constant RELAYER_GAS = 0.1 ether;
    uint256 constant PAYER_TUSD8 = 2_500_000; // 2.50
    uint256 constant AGENT_TUSD8 = 1_500_000; // 1.50

    function run() external {
        require(block.chainid == 44005, "Aevum testnet only (chain 44005)");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address payer = vm.envAddress("PAYER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        IERC20 tusd8 = IERC20(TUSD8_ADDR);

        console.log("deployer tQDAY before:", deployer.balance);
        console.log("deployer tUSD8 before:", tusd8.balanceOf(deployer));

        vm.startBroadcast(deployerKey);
        payable(payer).transfer(PAYER_GAS);
        payable(relayer).transfer(RELAYER_GAS);
        tusd8.transfer(payer, PAYER_TUSD8);
        tusd8.transfer(agent, AGENT_TUSD8);
        vm.stopBroadcast();

        console.log("payer tQDAY:  ", payer.balance);
        console.log("payer tUSD8:  ", tusd8.balanceOf(payer));
        console.log("agent tUSD8:  ", tusd8.balanceOf(agent));
        console.log("relayer tQDAY:", relayer.balance);
        console.log("deployer tUSD8 after:", tusd8.balanceOf(deployer));
    }
}
