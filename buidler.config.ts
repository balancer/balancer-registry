import { BuidlerConfig, task, usePlugin } from "@nomiclabs/buidler/config";
require('dotenv').config();

usePlugin("@nomiclabs/buidler-waffle");
usePlugin("buidler-gas-reporter");

// This is a sample Buidler task. To learn how to create your own go to
// https://buidler.dev/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, bre) => {
  const accounts = await bre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.getAddress());
  }
});

const config: BuidlerConfig = {
  solc: {
    version: "0.5.12",
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  networks: {
    buidlerevm: {
      blockGasLimit: 20000000,
      accounts: [
        { privateKey: '0x2f0a13c9ca247b719738e9275b9cf16fbe49fa2e31e09ece0a190e23481e63e3', balance: '1000000000000000000000000000000' },
        { privateKey: '0x56d6ec847fd896d97961ec83ac0fddb9f40ad0f72f77704f2d14051a9ae81aa0', balance: '1000000000000000000000000000000' }
      ]
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA}`,
      accounts: [`${process.env.KEYKOVAN}`],
      gasPrice: 70000000000
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA}`,
      accounts: [`${process.env.KEYRINKEBY}`],
      gasPrice: 70000000000
    },
    main: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA}`,
      accounts: [`${process.env.KEYMAIN}`],
      gasPrice: 55000000000
    }
  },
};

export default config;
