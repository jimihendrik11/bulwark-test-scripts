// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface Vm {
    function createSelectFork(string calldata url, uint256 blockNumber) external;
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function addr(uint256 privateKey) external view returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
}

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IOffRamp {
    function execute(bytes calldata encodedMessage, address[] calldata ccvs, bytes[] calldata verifierResults, uint32 gasLimitOverride) external;
    function getCCVsForMessage(bytes calldata encodedMessage) external view returns (address[] memory requiredCCVs, address[] memory optionalCCVs, uint8 threshold);
    function getExecutionState(bytes32 messageId) external view returns (uint8);
}

interface IVerifier {
    struct SignatureConfig {
        uint64 sourceChainSelector;
        uint8 threshold;
        address[] signers;
    }

    function applySignatureConfigs(uint64[] calldata sourceChainSelectorsToRemove, SignatureConfig[] calldata signatureConfigs) external;
    function getSignatureConfig(uint64 sourceChainSelector) external view returns (address[] memory, uint8);
    function versionTag() external view returns (bytes4);
}

abstract contract Base {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool value, string memory reason) internal pure {
        if (!value) revert(reason);
    }

    function assertEq(uint256 a, uint256 b, string memory reason) internal pure {
        if (a != b) revert(reason);
    }
}

contract CcipDynamicTest is Base {
    uint64 constant ETHEREUM = 5009297550715157269;
    uint64 constant BASE = 15971525489660198786;

    address constant OFFRAMP = 0x408428bca0e24A25ac8baAc1b70f64AF257717c3;
    address constant VERIFIER = 0x7BcE1A3297604CAFa601f05799b6Ed98e8c01B7F;
    address constant TIMELOCK = 0x44835bBBA9D40DEDa9b64858095EcFB2693c9449;
    address constant DEFAULT_RESOLVER = 0x2CaAfd3B4Cf606220580c885Bd2B448FB93dC03b;
    address constant LBTC_CCV = 0xd314336866369adf98EDC14F95Ed05eD87CC74A8;
    address constant RSETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;
    address constant RSETH_POOL = 0x55e5a21B4cCC7FA502434ab1109D4EDe0397AB25;
    address constant LBTC = 0x8236a87084f8B84306f72007F36F2618A5634494;
    address constant RECEIVER = address(0xBEEF);

    uint256 constant FORK_BLOCK = 26419147;

    struct TokenMsg {
        uint64 sourceChain;
        address sourceOnRamp;
        uint64 messageNumber;
        uint256 amount;
        bytes4 finality;
        address destToken;
        address sourceToken;
        address sourcePool;
        address receiver;
    }

    function setUp() public {
        vm.createSelectFork(vm.envOr("FORK_RPC", "https://mainnet.gateway.tenderly.co"), FORK_BLOCK);
    }

    function _keys() internal view returns (uint256[9] memory keys, address[9] memory addrs) {
        for (uint256 i = 0; i < 9; i++) keys[i] = 0x1001 + i;
        for (uint256 i = 0; i < 9; i++) addrs[i] = vm.addr(keys[i]);
        for (uint256 i = 0; i < 9; i++) {
            for (uint256 j = i + 1; j < 9; j++) {
                if (addrs[j] < addrs[i]) {
                    (addrs[i], addrs[j]) = (addrs[j], addrs[i]);
                    (keys[i], keys[j]) = (keys[j], keys[i]);
                }
            }
        }
    }

    function _setSigners(uint64 selector) internal {
        (, address[9] memory addrs) = _keys();
        address[] memory list = new address[](9);
        for (uint256 i = 0; i < 9; i++) list[i] = addrs[i];
        uint64[] memory none = new uint64[](0);
        IVerifier.SignatureConfig[] memory cfgs = new IVerifier.SignatureConfig[](1);
        cfgs[0] = IVerifier.SignatureConfig(selector, 9, list);
        vm.prank(TIMELOCK);
        IVerifier(VERIFIER).applySignatureConfigs(none, cfgs);
    }

    function _encode(TokenMsg memory m) internal pure returns (bytes memory) {
        bytes memory onRamp = abi.encode(m.sourceOnRamp);
        bytes memory offRamp = abi.encodePacked(OFFRAMP);
        bytes memory sender = abi.encode(m.sourceOnRamp);
        bytes memory receiver = abi.encodePacked(m.receiver);
        bytes memory sourcePool = abi.encode(m.sourcePool);
        bytes memory sourceToken = abi.encode(m.sourceToken);
        bytes memory destToken = abi.encodePacked(m.destToken);
        bytes memory tokenReceiver = abi.encodePacked(m.receiver);

        bytes memory transfer = abi.encodePacked(
            uint8(1),
            m.amount,
            uint8(sourcePool.length),
            sourcePool,
            uint8(sourceToken.length),
            sourceToken,
            uint8(destToken.length),
            destToken,
            uint8(tokenReceiver.length),
            tokenReceiver,
            uint16(0)
        );

        return abi.encodePacked(
            uint8(1),
            m.sourceChain,
            ETHEREUM,
            m.messageNumber,
            uint32(0),
            uint32(0),
            m.finality,
            bytes32(0),
            uint8(onRamp.length),
            onRamp,
            uint8(offRamp.length),
            offRamp,
            uint8(sender.length),
            sender,
            uint8(receiver.length),
            receiver,
            uint16(0),
            uint16(transfer.length),
            transfer,
            uint16(0)
        );
    }

    function _signatures(uint8 count, bytes32 messageId, bytes4 tag) internal returns (bytes memory) {
        (uint256[9] memory keys, ) = _keys();
        bytes32 digest = keccak256(abi.encodePacked(tag, messageId));
        bytes memory out;
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        for (uint256 i = 0; i < count; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], digest);
            if (v == 28) s = bytes32(n - uint256(s));
            out = abi.encodePacked(out, r, s);
        }
        return out;
    }

    function _run(TokenMsg memory m, uint8 sigCount, bool omitMandatory) internal returns (bytes32 id) {
        _setSigners(m.sourceChain);
        bytes memory encoded = _encode(m);
        id = keccak256(encoded);
        (address[] memory required, , ) = IOffRamp(OFFRAMP).getCCVsForMessage(encoded);
        bytes4 tag = IVerifier(VERIFIER).versionTag();
        bytes memory sigs = _signatures(sigCount, id, tag);
        bytes memory result = abi.encodePacked(tag, uint16(sigs.length), sigs);

        address[] memory ccvs;
        bytes[] memory results;
        if (omitMandatory) {
            ccvs = new address[](1);
            results = new bytes[](1);
            ccvs[0] = DEFAULT_RESOLVER;
            results[0] = result;
        } else {
            ccvs = required;
            results = new bytes[](required.length);
            for (uint256 i = 0; i < required.length; i++) results[i] = result;
        }

        (bool ok, ) = OFFRAMP.call(abi.encodeWithSelector(IOffRamp.execute.selector, encoded, ccvs, results, uint32(0)));
        assertTrue(ok, "execute call failed");
    }

    function _rseth(uint64 number, uint256 amount, bytes4 finality) internal pure returns (TokenMsg memory) {
        return TokenMsg(BASE, 0xF75bf16b03aaE98677926F0987F195A2153996B9, number, amount, finality, RSETH, 0xe2110d5a2722ABd8c8002646C645Af15f5E9Db1F, 0xAaDF0BF985307B6830EAF68Da6b4313A2A60fA61, RECEIVER);
    }

    function _lbtc(uint64 number, uint256 amount) internal pure returns (TokenMsg memory) {
        return TokenMsg(BASE, 0xF75bf16b03aaE98677926F0987F195A2153996B9, number, amount, bytes4(0), LBTC, 0xecAc9C5F704e954931349Da37F60E39f515c11c1, 0xcFEAc622BC6464acC759ACd9741a6D78F8b0d3Cd, RECEIVER);
    }

    function testFrontalDrainBelowThreshold() public {
        uint256 before = IERC20(RSETH).balanceOf(RECEIVER);
        bytes32 id = _run(_rseth(920001, 1 ether, bytes4(0)), 8, false);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(id), 3, "below threshold must be FAILURE");
        assertEq(IERC20(RSETH).balanceOf(RECEIVER), before, "no release below threshold");
    }

    function testFrontalDrainAtThreshold() public {
        uint256 before = IERC20(RSETH).balanceOf(RECEIVER);
        bytes32 id = _run(_rseth(920002, 1 ether, bytes4(0)), 9, false);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(id), 2, "at threshold must be SUCCESS");
        assertEq(IERC20(RSETH).balanceOf(RECEIVER), before + 1 ether, "one rsETH released");
    }

    function testRolloverRateLimit() public {
        bytes32 first = _run(_rseth(920003, 300 ether, bytes4(0)), 9, false);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(first), 2, "first 300 rsETH must pass");
        bytes32 second = _run(_rseth(920004, 1 ether, bytes4(0)), 9, false);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(second), 3, "second release must hit the bucket");
    }

    function testFastLaneBeforeFinality() public {
        uint256 before = IERC20(RSETH).balanceOf(RECEIVER);
        bytes32 id = _run(_rseth(920005, 1 ether, bytes4(0x00000001)), 9, false);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(id), 2, "legacy pool accepts finality=1");
        assertEq(IERC20(RSETH).balanceOf(RECEIVER), before + 1 ether, "pre-finality release observed");
    }

    function testLbtcWithoutMandatoryCcv() public {
        bytes32 id = _run(_lbtc(920006, 1e8), 9, true);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(id), 3, "mandatory CCV must block");
    }

    function testPoleThresholdChange() public {
        _setSigners(BASE);
        (, uint8 threshold) = IVerifier(VERIFIER).getSignatureConfig(BASE);
        assertEq(threshold, 9, "initial threshold");
        (, address[9] memory addrs) = _keys();
        address[] memory one = new address[](1);
        one[0] = addrs[0];
        uint64[] memory none = new uint64[](0);
        IVerifier.SignatureConfig[] memory cfgs = new IVerifier.SignatureConfig[](1);
        cfgs[0] = IVerifier.SignatureConfig(BASE, 1, one);
        vm.prank(TIMELOCK);
        IVerifier(VERIFIER).applySignatureConfigs(none, cfgs);
        (, uint8 afterThreshold) = IVerifier(VERIFIER).getSignatureConfig(BASE);
        assertEq(afterThreshold, 1, "threshold lowered");
    }

    function testRearImpactLiquidity() public {
        uint256 supply = IERC20(RSETH).totalSupply();
        uint256 locked = IERC20(RSETH).balanceOf(RSETH_POOL);
        assertTrue(locked < (supply * 30) / 100, "locked below 30% supply");
        uint256 daysToDrain = locked / (4 * 300 ether);
        assertEq(daysToDrain, 10, "ten days at four routes");
    }

    function testSideImpactMandatoryCcvPresent() public {
        bytes32 id = _run(_lbtc(920007, 1e8), 9, true);
        assertEq(IOffRamp(OFFRAMP).getExecutionState(id), 3, "committee alone cannot release LBTC");
    }
}

