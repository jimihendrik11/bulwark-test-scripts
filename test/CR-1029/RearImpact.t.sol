// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Common.sol";

/// @notice Rear Impact on Compound V3 Comet USDC: 30 percent of supplied USDC is withdrawn at once.
contract RearImpactTest is Base {
    IComet internal constant COMET = IComet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20 internal constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    struct Metrics {
        uint256 forkBlock;
        uint256 totalSupply;
        uint256 cashBefore;
        uint256 utilizationBefore;
        uint256 demand;
        uint256 requested;
        uint256 fulfilled;
        uint256 utilizationAfter;
        uint256 supplyRateAfter;
        uint256 firstRevertIndex;
        uint256 firstRevertRequested;
        uint256 firstRevertFulfilled;
        uint256 cashAfterFirstDay;
        uint256 afterDayAdditional;
        uint256 afterDaySuccesses;
        uint256 attempts;
        uint256 successes;
        uint256 supplierCount;
        string firstRevertReason;
    }

    address[] internal suppliers;
    address[] internal failedWho;
    uint256[] internal failedAmount;

    constructor() {
        suppliers.push(0x7f714b13249BeD8fdE2ef3FBDfB18Ed525544B03);
        suppliers.push(0xB9E62Cb9b4cE8ec13c886FaE67369Da417EE2714);
        suppliers.push(0xC9dA44904AD04019676319598CFbB9dABd69817E);
    }

    function testRearImpact() external {
        Metrics memory m;
        m.forkBlock = block.number;
        m.totalSupply = COMET.totalSupply();
        m.cashBefore = USDC.balanceOf(address(COMET));
        m.utilizationBefore = COMET.getUtilization();
        m.demand = (m.totalSupply * 30) / 100;
        m.supplierCount = suppliers.length;

        _firstWave(m);
        m.utilizationAfter = COMET.getUtilization();
        m.supplyRateAfter = COMET.getSupplyRate(uint256(m.utilizationAfter));
        m.cashAfterFirstDay = USDC.balanceOf(address(COMET));

        vm.warp(block.timestamp + 24 hours);
        _secondWave(m);

        _write(m);
    }

    function _firstWave(Metrics memory m) internal {
        for (uint256 i = 0; i < suppliers.length; i++) {
            if (m.requested >= m.demand) return;
            uint256 amount = _amount(suppliers[i], m.demand - m.requested);
            if (amount == 0) continue;
            m.requested += amount;
            m.attempts += 1;
            vm.prank(suppliers[i]);
            try COMET.withdraw(address(USDC), amount) {
                m.fulfilled += amount;
                m.successes += 1;
            } catch (bytes memory err) {
                if (m.firstRevertIndex == 0) {
                    m.firstRevertIndex = i + 1;
                    m.firstRevertReason = maskReason(err);
                    m.firstRevertRequested = amount;
                    m.firstRevertFulfilled = m.fulfilled;
                }
                failedWho.push(suppliers[i]);
                failedAmount.push(amount);
            }
        }
    }

    function _secondWave(Metrics memory m) internal {
        for (uint256 i = 0; i < failedWho.length; i++) {
            uint256 amount = _amount(failedWho[i], failedAmount[i]);
            if (amount == 0) continue;
            vm.prank(failedWho[i]);
            try COMET.withdraw(address(USDC), amount) {
                m.afterDayAdditional += amount;
                m.afterDaySuccesses += 1;
            } catch {}
        }
    }

    function _amount(address who, uint256 remaining) internal view returns (uint256) {
        uint256 bal = COMET.balanceOf(who);
        if (bal == 0) return 0;
        return bal < remaining ? bal : remaining;
    }

    function _write(Metrics memory m) internal {
        string memory out = line("fork_block", m.forkBlock);
        out = u(out, line("total_supply", m.totalSupply));
        out = u(out, line("cash_before", m.cashBefore));
        out = u(out, line("utilization_before", m.utilizationBefore));
        out = u(out, line("demand", m.demand));
        out = u(out, line("requested", m.requested));
        out = u(out, line("fulfilled", m.fulfilled));
        out = u(out, line("utilization_after", m.utilizationAfter));
        out = u(out, line("supply_rate_after", m.supplyRateAfter));
        out = u(out, line("first_revert_index", m.firstRevertIndex));
        out = u(out, lineStr("first_revert_reason", m.firstRevertReason));
        out = u(out, line("first_revert_requested", m.firstRevertRequested));
        out = u(out, line("first_revert_fulfilled", m.firstRevertFulfilled));
        out = u(out, line("cash_after_first_day", m.cashAfterFirstDay));
        out = u(out, line("after_24h_additional", m.afterDayAdditional));
        out = u(out, line("after_24h_successes", m.afterDaySuccesses));
        out = u(out, line("attempts", m.attempts));
        out = u(out, line("successes", m.successes));
        out = u(out, line("suppliers", m.supplierCount));
        vm.writeFile("out/CR-1029-rear.txt", out);
    }
}
