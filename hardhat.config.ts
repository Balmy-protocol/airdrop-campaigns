import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-ethers';
import { HardhatUserConfig } from 'hardhat/types';
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
