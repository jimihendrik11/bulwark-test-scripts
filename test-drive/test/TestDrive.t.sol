// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, IERC20, IV3Pool, IV3Factory, PoolSwapper, Vm} from "./Common.sol";

/// @title TestDrive
/// @notice Brake Check and Key Check for a single ERC-20 token on a Robinhood Chain fork.
/// @dev Writes a raw JSON file; lights are assigned by script/test-drive-report.mjs using thresholds.json.
contract TestDriveTest is Base {
    address internal constant DEFAULT_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant DEFAULT_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    address internal token;
    address internal weth;
    address internal factory;
    address internal pool;
    uint24 internal poolFee;
    uint128 internal poolLiquidity;
    bool internal poolFound;

    string internal tokenName;
    string internal tokenSymbol;
    uint256 internal tokenDecimals;
    uint256 internal tokenSupply;

    string internal sizesJson;
    string internal delayedJson;
    bool internal anySellReverted;
    string internal firstSellRevert;

    address internal owner;
    uint256 internal ownerCodeSize;
    string internal ownerType;
    string internal powersJson;
    string internal attemptsJson;
    bool internal pausedValue;
    bool internal pausedKnown;

    PoolSwapper internal swapper;
    address internal testWallet;
    uint256 internal forkBlockNumber;

    function setUp() public {
        string memory rpc = vm.envOr("TEST_DRIVE_RPC", "https://rpc.mainnet.chain.robinhood.com");
        uint256 forkBlock = vm.envOr("TEST_DRIVE_BLOCK", uint256(0));
        forkBlockNumber = forkBlock;
        if (forkBlock == 0) {
            vm.createSelectFork(rpc);
        } else {
            vm.createSelectFork(rpc, forkBlock);
        }

        token = _envAddress("TEST_DRIVE_TOKEN", 0x39dBED3a2bd333467115dE45665cC57F813C4571);
        weth = _envAddress("TEST_DRIVE_WETH", DEFAULT_WETH);
        factory = _envAddress("TEST_DRIVE_FACTORY", DEFAULT_FACTORY);
        testWallet = address(uint160(uint256(keccak256(abi.encode(token, block.number, address(this))))));

        tokenName = _tryString(token, "name()");
        tokenSymbol = _tryString(token, "symbol()");
        tokenDecimals = _tryUint(token, "decimals()");
        tokenSupply = _tryUint(token, "totalSupply()");
    }

    function testDrive() public {
        _findPool();
        if (poolFound) {
            swapper = new PoolSwapper(pool, weth);
            _brakeSizes();
            _brakeDelayed();
            _keyCheck();
        }
        _writeJson();
    }

    // ---------------------------------------------------------------- discovery

    function _envAddress(string memory key, address fallbackValue) internal view returns (address) {
        string memory raw = vm.envOr(key, "");
        if (bytes(raw).length == 0) return fallbackValue;
        return _parseAddress(raw);
    }

    function _parseAddress(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        require(b.length == 42, "address length");
        uint160 result;
        for (uint256 i = 2; i < 42; i++) {
            result = result * 16 + uint160(_hexVal(b[i]));
        }
        return address(result);
    }

    function _hexVal(bytes1 c) internal pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 48 && v <= 57) return v - 48;
        if (v >= 97 && v <= 102) return v - 87;
        if (v >= 65 && v <= 70) return v - 55;
        revert("hex");
    }

    function _tryString(address target, string memory sig) internal view returns (string memory) {
        (bool ok, bytes memory ret) = target.staticcall(abi.encodeWithSignature(sig));
        if (!ok || ret.length < 64) return "";
        return abi.decode(ret, (string));
    }

    function _tryUint(address target, string memory sig) internal view returns (uint256) {
        (bool ok, bytes memory ret) = target.staticcall(abi.encodeWithSignature(sig));
        if (!ok || ret.length < 32) return 0;
        return abi.decode(ret, (uint256));
    }

    function _findPool() internal {
        uint24[4] memory fees = [uint24(10000), uint24(3000), uint24(500), uint24(100)];
        uint128 best;
        for (uint256 i = 0; i < fees.length; i++) {
            (bool ok, bytes memory ret) = factory.staticcall(
                abi.encodeWithSignature("getPool(address,address,uint24)", weth, token, fees[i])
            );
            if (!ok || ret.length < 32) continue;
            address candidate = abi.decode(ret, (address));
            if (candidate == address(0)) continue;
            (bool lok, bytes memory lret) = candidate.staticcall(abi.encodeWithSignature("liquidity()"));
            if (!lok || lret.length < 32) continue;
            uint128 liq = abi.decode(lret, (uint128));
            if (liq > best) {
                best = liq;
                pool = candidate;
                poolFee = fees[i];
                poolLiquidity = liq;
                poolFound = true;
            }
        }
    }

    // ---------------------------------------------------------------- brake

    function _brakeSizes() internal {
        uint256[3] memory amounts = [uint256(0.05 ether), uint256(0.5 ether), uint256(2 ether)];
        for (uint256 i = 0; i < amounts.length; i++) {
            string memory fragment = _runRoundTrip(amounts[i], false);
            if (i > 0) sizesJson = u(sizesJson, ",");
            sizesJson = u(sizesJson, fragment);
        }
    }

    function _brakeDelayed() internal {
        delayedJson = _runRoundTrip(0.5 ether, true);
    }

    function _runRoundTrip(uint256 amountIn, bool delayed) internal returns (string memory) {
        uint256 snap = vm.snapshot();
        _executeRoundTrip(amountIn, delayed);
        string memory fragment = _runJson();
        vm.revertTo(snap);
        return fragment;
    }

    struct Run {
        uint256 amountIn;
        uint256 tokenOut;
        uint256 wethBack;
        bool buyOk;
        bool sellOk;
        string buyErr;
        string sellErr;
        uint256 lossBps;
        uint256 extraBps;
    }

    Run internal run;

    function _executeRoundTrip(uint256 amountIn, bool delayed) internal {
        run = Run(amountIn, 0, 0, true, true, "", "", 0, 0);

        vm.deal(address(swapper), amountIn);
        swapper.wrap(amountIn);
        require(IERC20(weth).balanceOf(address(swapper)) == amountIn, "weth setup");
        try swapper.swapIn(weth, amountIn) returns (uint256 out) {
            run.tokenOut = out;
        } catch (bytes memory err) {
            run.buyOk = false;
            run.buyErr = maskReason(err);
        }

        if (run.buyOk && run.tokenOut > 0) {
            if (delayed) {
                vm.warp(block.timestamp + 3600);
            }
            try swapper.swapIn(token, run.tokenOut) returns (uint256 back) {
                run.wethBack = back;
            } catch (bytes memory err) {
                run.sellOk = false;
                run.sellErr = maskReason(err);
            }
        } else {
            run.sellOk = false;
            if (bytes(run.buyErr).length == 0) run.buyErr = "no token received";
        }

        if (!run.sellOk) {
            anySellReverted = true;
            if (bytes(firstSellRevert).length == 0) {
                firstSellRevert = bytes(run.sellErr).length > 0 ? run.sellErr : run.buyErr;
            }
        }

        if (run.buyOk && run.sellOk && amountIn > 0 && run.wethBack <= amountIn) {
            run.lossBps = ((amountIn - run.wethBack) * 10_000) / amountIn;
        }
        uint256 poolFeeBps = uint256(poolFee) / 100;
        if (run.lossBps > poolFeeBps * 2) {
            run.extraBps = run.lossBps - poolFeeBps * 2;
        }
    }

    function _runJson() internal view returns (string memory) {
        string memory fragment = "{\"amountInWeth\":\"";
        fragment = u(fragment, run.amountIn);
        fragment = u(fragment, "\",\"tokenOut\":\"");
        fragment = u(fragment, run.tokenOut);
        fragment = u(fragment, "\",\"wethBack\":\"");
        fragment = u(fragment, run.wethBack);
        fragment = u(fragment, "\",\"buyOk\":");
        fragment = u(fragment, run.buyOk ? "true" : "false");
        fragment = u(fragment, ",\"sellOk\":");
        fragment = u(fragment, run.sellOk ? "true" : "false");
        fragment = u(fragment, ",\"lossBps\":\"");
        fragment = u(fragment, run.lossBps);
        fragment = u(fragment, "\",\"extraLossBps\":\"");
        fragment = u(fragment, run.extraBps);
        fragment = u(fragment, "\",\"buyError\":\"");
        fragment = u(fragment, jsonStr(run.buyErr));
        fragment = u(fragment, "\",\"sellError\":\"");
        fragment = u(fragment, jsonStr(run.sellErr));
        fragment = u(fragment, "\"}");
        return fragment;
    }

    // ---------------------------------------------------------------- keys

    function _keyCheck() public {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSignature("owner()"));
        if (ok && ret.length >= 32) {
            owner = abi.decode(ret, (address));
        }
        if (owner == address(0)) {
            (bool gok, bytes memory gret) = token.staticcall(abi.encodeWithSignature("getOwner()"));
            if (gok && gret.length >= 32) owner = abi.decode(gret, (address));
        }
        if (owner == address(0)) {
            (bool aok, bytes memory aret) = token.staticcall(abi.encodeWithSignature("admin()"));
            if (aok && aret.length >= 32) owner = abi.decode(aret, (address));
        }
        if (owner == address(0)) {
            ownerType = "none";
        } else {
            ownerCodeSize = owner.code.length;
            if (ownerCodeSize == 0) {
                ownerType = "eoa";
            } else if (_hasSig(owner, "getThreshold()")) {
                ownerType = "multisig";
            } else if (_hasSig(owner, "delay()")) {
                ownerType = "timelock";
            } else {
                ownerType = "contract";
            }
        }

        (bool pok, bytes memory pret) = token.staticcall(abi.encodeWithSignature("paused()"));
        if (pok && pret.length >= 32) {
            pausedKnown = true;
            pausedValue = abi.decode(pret, (bool));
        }

        if (owner == address(0)) {
            powersJson = "";
            attemptsJson = "";
            return;
        }

        _attempt("mint", abi.encodeWithSignature("mint(address,uint256)", owner, uint256(1e18)));
        _attempt("pause", abi.encodeWithSignature("pause()"));
        _attempt("blacklist", abi.encodeWithSignature("blacklist(address)", testWallet));
        _attempt("setFee", abi.encodeWithSignature("setFee(uint256)", uint256(500)));
        _attempt("upgradeTo", abi.encodeWithSignature("upgradeTo(address)", address(0xdead)));
        _attempt("transferOwnership", abi.encodeWithSignature("transferOwnership(address)", testWallet));
    }

    function _hasSig(address target, string memory sig) internal view returns (bool) {
        (bool ok, bytes memory ret) = target.staticcall(abi.encodeWithSignature(sig));
        return ok && ret.length >= 32;
    }

    function _attempt(string memory name, bytes memory payload) internal {
        uint256 snap = vm.snapshot();
        vm.prank(owner);
        (bool ok, bytes memory ret) = token.call(payload);
        vm.revertTo(snap);
        string memory reason = ok ? "" : maskReason(ret);
        if (ok) {
            if (bytes(powersJson).length > 0) powersJson = u(powersJson, ",");
            powersJson = u(powersJson, string.concat("\"", name, "\""));
        }
        if (bytes(attemptsJson).length > 0) attemptsJson = u(attemptsJson, ",");
        attemptsJson = u(
            attemptsJson,
            string.concat(
                "{\"name\":\"", name, "\",\"ok\":", ok ? "true" : "false", ",\"error\":\"", jsonStr(reason), "\"}"
            )
        );
    }

    // ---------------------------------------------------------------- output

    function _writeJson() internal {
        string memory json = "{\"kind\":\"test_drive_raw\",\"chainId\":";
        json = u(json, block.chainid);
        json = u(json, ",\"block\":\"");
        json = u(json, forkBlockNumber > 0 ? forkBlockNumber : block.number);
        json = u(json, "\",\"evmBlockNumber\":\"");
        json = u(json, block.number);
        json = u(json, "\",\"timestamp\":");
        json = u(json, block.timestamp);
        json = u(json, ",\"token\":{\"address\":\"");
        json = u(json, vm.toString(token));
        json = u(json, "\",\"name\":\"");
        json = u(json, jsonStr(tokenName));
        json = u(json, "\",\"symbol\":\"");
        json = u(json, jsonStr(tokenSymbol));
        json = u(json, "\",\"decimals\":\"");
        json = u(json, tokenDecimals);
        json = u(json, "\",\"totalSupply\":\"");
        json = u(json, tokenSupply);
        json = u(json, "\"},\"pool\":{\"found\":");
        json = u(json, poolFound ? "true" : "false");
        json = u(json, ",\"address\":\"");
        json = u(json, vm.toString(pool));
        json = u(json, "\",\"fee\":\"");
        json = u(json, uint256(poolFee));
        json = u(json, "\",\"liquidity\":\"");
        json = u(json, uint256(poolLiquidity));
        json = u(json, "\"},\"brake\":{\"sizes\":[");
        json = u(json, sizesJson);
        json = u(json, "],\"delayed\":");
        json = u(json, bytes(delayedJson).length > 0 ? delayedJson : "null");
        json = u(json, ",\"sellReverted\":");
        json = u(json, anySellReverted ? "true" : "false");
        json = u(json, ",\"firstSellRevert\":\"");
        json = u(json, jsonStr(firstSellRevert));
        json = u(json, "\"},\"keys\":{\"owner\":\"");
        json = u(json, vm.toString(owner));
        json = u(json, "\",\"ownerType\":\"");
        json = u(json, ownerType);
        json = u(json, "\",\"ownerCodeSize\":\"");
        json = u(json, ownerCodeSize);
        json = u(json, "\",\"paused\":");
        json = u(json, pausedKnown ? (pausedValue ? "true" : "false") : "null");
        json = u(json, ",\"powers\":[");
        json = u(json, powersJson);
        json = u(json, "],\"attempts\":[");
        json = u(json, attemptsJson);
        json = u(json, "]}}");

        string memory outPath = vm.envOr("TEST_DRIVE_OUT", "results/td-raw.json");
        vm.writeFile(outPath, json);
    }
}
