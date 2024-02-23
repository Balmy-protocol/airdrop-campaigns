import 'dotenv/config';
import "@nomicfoundation/hardhat-viem";
import '@nomicfoundation/hardhat-toolbox-viem';
import { HardhatUserConfig } from "hardhat/config";
import 'tsconfig-paths/register';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 100000,
          },
        },
      },
    ],
  },
  defaultNetwork: 'hardhat',
  paths: {
    sources: './solidity',
  },
};

export default config;
