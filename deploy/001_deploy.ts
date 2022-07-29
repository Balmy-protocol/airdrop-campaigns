import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { shouldVerifyContract } from '../utils/deploy';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { MultipleExpirableAirdrops__factory } from '@typechained';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { governor, deployer } = await hre.getNamedAccounts();

  const OP_TOKEN_ADDRESS = '0x4200000000000000000000000000000000000042';

  const deploy = await deployThroughDeterministicFactory({
    deployer,
    name: 'MultipleExpirableAirdrops',
    salt: 'MF-MultipleExpirableAirdrops-V1',
    contract: 'solidity/contracts/MultipleExpirableAirdrops.sol:MultipleExpirableAirdrops',
    bytecode: MultipleExpirableAirdrops__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address'],
      values: [governor, OP_TOKEN_ADDRESS],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 8_000_000,
    },
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: deploy.args,
    });
  }
};
deployFunction.dependencies = [];
deployFunction.tags = ['Greeter'];
export default deployFunction;
