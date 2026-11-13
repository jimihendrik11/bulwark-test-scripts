// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Common.sol";

contract ReplacementImplementation {
    function sweep(address token, address to) external {
        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }
}

/// @notice Pole Test on Compound V3 Comet USDC: what a single privileged key can do to user funds.
contract PoleTestTest is Base {
    IComet internal constant COMET = IComet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20 internal constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
    bytes32 internal constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address internal constant LARGEST_SUPPLIER = 0x7f714b13249BeD8fdE2ef3FBDfB18Ed525544B03;
    address internal constant CONFIGURATOR = 0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3;

    function testPole() external {
        uint256 forkBlock = block.number;
        address governor = COMET.governor();
        address guardian = COMET.pauseGuardian();
        address proxyAdmin = address(uint160(uint256(vm.load(address(COMET), ADMIN_SLOT))));
        address implementation = address(uint160(uint256(vm.load(address(COMET), IMPL_SLOT))));
        address proxyAdminOwner = IProxyAdmin(proxyAdmin).owner();
        address timelockAdmin = ITimelock(governor).admin();
        uint256 timelockDelay = ITimelock(governor).delay();

        vm.prank(guardian);
        COMET.pause(true, true, true, true, true);
        bool paused = COMET.isWithdrawPaused();

        bool withdrewDuringPause;
        string memory pauseReason = "";
        vm.prank(LARGEST_SUPPLIER);
        try COMET.withdraw(address(USDC), 1e6) {
            withdrewDuringPause = true;
        } catch (bytes memory err) {
            pauseReason = maskReason(err);
        }

        vm.prank(guardian);
        COMET.pause(false, false, false, false, false);
        bool resumed;
        vm.prank(LARGEST_SUPPLIER);
        try COMET.withdraw(address(USDC), 1e6) {
            resumed = true;
        } catch {
            resumed = false;
        }

        uint256 cashBefore = USDC.balanceOf(address(COMET));
        address sink = address(0x000000000000000000000000000000000000bEEF);
        bool upgradeAllowed;
        string memory upgradeReason = "";
        uint256 moved;
        ReplacementImplementation replacement = new ReplacementImplementation();
        vm.prank(governor);
        try IProxyAdmin(proxyAdmin).upgrade(address(COMET), address(replacement)) {
            upgradeAllowed = true;
            ReplacementImplementation(address(COMET)).sweep(address(USDC), sink);
            moved = USDC.balanceOf(sink);
        } catch (bytes memory err) {
            upgradeReason = maskReason(err);
        }

        string memory out = line("fork_block", forkBlock);
        out = u(out, lineStr("governor", vm.toString(governor)));
        out = u(out, lineStr("pause_guardian", vm.toString(guardian)));
        out = u(out, lineStr("proxy_admin", vm.toString(proxyAdmin)));
        out = u(out, lineStr("proxy_admin_owner", vm.toString(proxyAdminOwner)));
        out = u(out, lineStr("implementation", vm.toString(implementation)));
        out = u(out, lineStr("timelock_admin", vm.toString(timelockAdmin)));
        out = u(out, lineStr("configurator", vm.toString(CONFIGURATOR)));
        out = u(out, lineStr("configurator_governor", vm.toString(IConfigurator(CONFIGURATOR).governor())));
        out = u(out, line("configurator_code", CONFIGURATOR.code.length));
        out = u(out, line("timelock_delay", timelockDelay));
        out = u(out, line("governor_code", governor.code.length));
        out = u(out, line("pause_guardian_code", guardian.code.length));
        out = u(out, line("proxy_admin_code", proxyAdmin.code.length));
        out = u(out, line("implementation_code", implementation.code.length));
        out = u(out, line("timelock_admin_code", timelockAdmin.code.length));
        out = u(out, lineStr("withdraw_paused", vm.toString(paused)));
        out = u(out, lineStr("withdraw_during_pause", vm.toString(withdrewDuringPause)));
        out = u(out, lineStr("pause_reason", pauseReason));
        out = u(out, lineStr("withdraw_after_unpause", vm.toString(resumed)));
        out = u(out, lineStr("upgrade_allowed", vm.toString(upgradeAllowed)));
        out = u(out, lineStr("upgrade_reason", upgradeReason));
        out = u(out, line("cash_before_upgrade", cashBefore));
        out = u(out, line("upgrade_moved", moved));

        vm.writeFile("out/CR-1029-pole.txt", out);
    }
}
