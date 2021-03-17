require("@nomiclabs/hardhat-ethers");
require('dotenv').config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      { version: '0.7.3' },
      { version: '0.6.12' },
      { version: '0.5.16' }
    ]
  },
  defaultNetwork: 'local',
  networks: {
    fork: {
      chainId: 1,
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_TOKEN,
        blockNumber: 11902066 - 1,
      }
    },
    mainnet: {
      url: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_TOKEN,
      chainId: 1,
    },
    local: {
      url: 'http://localhost:8545',
      timeout: 60000,
    }
  }
};
