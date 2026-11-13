// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function load(address target, bytes32 slot) external view returns (bytes32);
    function writeFile(string calldata path, string calldata data) external;
    function toString(uint256 value) external pure returns (string memory);
    function toString(address value) external pure returns (string memory);
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function parseUint(string calldata value) external pure returns (uint256);
    function toString(bool value) external pure returns (string memory);
}

abstract contract Base {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    string internal constant USDC_HUMAN = "6";

    function u(string memory a, string memory b) internal pure returns (string memory) {
        return string.concat(a, b);
    }

    function u(string memory a, uint256 b) internal pure returns (string memory) {
        return string.concat(a, vm.toString(b));
    }

    function line(string memory key, uint256 value) internal pure returns (string memory) {
        return string.concat(key, "=", vm.toString(value), "\n");
    }

    function lineStr(string memory key, string memory value) internal pure returns (string memory) {
        return string.concat(key, "=", value, "\n");
    }

    function maskReason(bytes memory data) internal pure returns (string memory) {
        if (data.length < 4) return "raww";
        // Error(string) selector 0x08c379a0
        if (data.length >= 68 && bytes4(data) == 0x08c379a0) {
            bytes memory out = new bytes(data.length - 68);
            for (uint256 i = 0; i < out.length; i++) {
                out[i] = data[i + 68];
            }
            uint256 end = out.length;
            while (end > 0 && out[end - 1] == 0) {
                end--;
            }
            bytes memory trimmed = new bytes(end);
            for (uint256 i = 0; i < end; i++) {
                trimmed[i] = out[i];
            }
            return string(trimmed);
        }
        if (data.length >= 4) {
            bytes4 sel;
            assembly {
                sel := mload(add(data, 32))
            }
            return string.concat("custom ", _hex(sel));
        }
        return "empty";
    }

    function _hex(bytes4 v) internal pure returns (string memory) {
        bytes memory s = new bytes(8);
        bytes16 alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 4; i++) {
            uint8 b = uint8(v[i]);
            s[i * 2] = alphabet[b >> 4];
            s[i * 2 + 1] = alphabet[b & 0x0f];
        }
        return string(s);
    }
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IComet {
    function baseToken() external view returns (address);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function getUtilization() external view returns (uint256);
    function getSupplyRate(uint256 utilization) external view returns (uint64);
    function governor() external view returns (address);
    function pauseGuardian() external view returns (address);
    function borrowBalanceOf(address account) external view returns (uint256);
    function withdraw(address asset, uint256 amount) external;
    function pause(bool supplyPaused, bool transferPaused, bool withdrawPaused, bool absorbPaused, bool buyPaused)
        external;
    function isWithdrawPaused() external view returns (bool);
}

interface ITimelock {
    function delay() external view returns (uint256);
    function admin() external view returns (address);
}

interface IProxyAdmin {
    function owner() external view returns (address);
    function upgrade(address cometProxy, address newImplementation) external;
}
