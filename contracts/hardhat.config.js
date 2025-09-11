require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: '0.8.20',
	networks: {
		localhost: {
			url: process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545',
		},
		ganache: {
			url: process.env.GANACHE_RPC_URL || 'http://127.0.0.1:8545',
			chainId: 1337,
		},
	},
};
