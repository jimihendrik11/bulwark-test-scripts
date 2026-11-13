// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface Vm {
    function createSelectFork(string calldata url) external returns (uint256);
    function createSelectFork(string calldata url, uint256 blockNumber) external returns (uint256);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function roll(uint256 blockNumber) external;
    function deal(address account, uint256 amount) external;
    function store(address target, bytes32 slot, bytes32 value) external;
    function snapshot() external returns (uint256);
    function revertTo(uint256 id) external returns (bool);
    function writeFile(string calldata path, string calldata data) external;
    function toString(uint256 value) external pure returns (string memory);
    function toString(address value) external pure returns (string memory);
    function toString(bool value) external pure returns (string memory);
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function parseUint(string calldata value) external pure returns (uint256);
}

abstract contract Base {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function u(string memory a, string memory b) internal pure returns (string memory) {
        return string.concat(a, b);
    }

    function u(string memory a, uint256 b) internal pure returns (string memory) {
        return string.concat(a, vm.toString(b));
    }

    function num(uint256 v) internal pure returns (string memory) {
        return vm.toString(v);
    }

    function jsonStr(string memory value) internal pure returns (string memory) {
        bytes memory inBytes = bytes(value);
        bytes memory out = new bytes(inBytes.length);
        uint256 j;
        for (uint256 i = 0; i < inBytes.length; i++) {
            bytes1 c = inBytes[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (uint8(c) < 0x20) {
                continue;
            } else {
                out[j++] = c;
            }
        }
        bytes memory trimmed = new bytes(j);
        for (uint256 i = 0; i < j; i++) {
            trimmed[i] = out[i];
        }
        return string(trimmed);
    }

    function maskReason(bytes memory data) internal pure returns (string memory) {
        if (data.length < 4) return "empty";
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
        bytes4 sel;
        assembly {
            sel := mload(add(data, 32))
        }
        return string.concat("custom ", _hex(sel));
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
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

interface IV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

interface IV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IWETH is IERC20 {
    function deposit() external payable;
}

/// @dev Swaps directly against a Uniswap v3 pool, so no external router is required.
contract PoolSwapper {
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    address public immutable pool;
    address public immutable token0;
    address public immutable token1;
    address public immutable weth;

    constructor(address poolAddress, address wethAddress) {
        pool = poolAddress;
        token0 = IV3Pool(poolAddress).token0();
        token1 = IV3Pool(poolAddress).token1();
        weth = wethAddress;
    }

    function wrap(uint256 amount) external {
        IWETH(weth).deposit{value: amount}();
    }

    function swapIn(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        bool zeroForOne = tokenIn == token0;
        (int256 amount0, int256 amount1) = IV3Pool(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn)
        );
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        require(msg.sender == pool, "callback only");
        address tokenIn = abi.decode(data, (address));
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        require(IERC20(tokenIn).transfer(msg.sender, owed), "pay failed");
    }

    receive() external payable {}
}
