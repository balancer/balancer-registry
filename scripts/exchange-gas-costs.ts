require('dotenv').config();
var moment = require('moment');
const axios = require('axios').default;
const Decimal = require('decimal.js');

export const BONE = new Decimal(10).pow(18);

// Returns all transactions for block range
export async function fetchTransactions(startBlock, endBlock) {
    const proxyAddr = `0x6317C5e82A06E1d8bf200d21F4510Ac2c038AC81`;
    console.log(`Fetching Txs For ${proxyAddr} for blocks: ${startBlock}-${endBlock}`);

    const URL = `https://api.etherscan.io/api?module=account&action=txlist&address=${proxyAddr}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${process.env.ETHERSCAN}`

    const response = await axios.get(URL);
    // console.log(response.data.status);
    // console.log(response.data.message);

    const data = await response.data.result;
    // console.log(data);
    // console.log(data.length);
    return data;
}

export async function getBlockForTime(timestamp){
  // const timestamp = `1596240000`;  // 01/08/2020
  // console.log(`timestamp: ${timestamp}`);
  const URL = `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${process.env.ETHERSCAN}`;

  const response = await axios.get(URL);
  // console.log(response.data.status);
  // console.log(response.data.message);

  const data = await response.data.result;
  // console.log(data);
  return data;
}

async function run() {
    console.log('Starting');
    const dateNow: any = moment();
    console.log(dateNow.format());
    const dateStart: any = dateNow.clone().subtract(30, 'days');
    console.log(dateStart.format());

    let startBlock = Number(await getBlockForTime(dateStart.unix()));
    let endBlock = Number(await getBlockForTime(dateNow.unix()));
    const midBlock = Math.round(startBlock + ((endBlock - startBlock) / 2));
    console.log(startBlock);
    console.log(midBlock);
    console.log(endBlock);
    /*
    let txs = await fetchTransactions(startBlock, midBlock);
    console.log(txs.length);
    const txsEnd = await fetchTransactions(midBlock, endBlock);
    console.log(txsEnd.length);
    */

    let txs: any[] = [];
    // endBlock = startBlock + 100;
    while(startBlock < endBlock){
        let endRange = startBlock + 15000;
        let txsRange = await fetchTransactions(startBlock, endRange);
        console.log(txsRange.length);
        txs = txs.concat(txsRange);
        startBlock = endRange + 1;
    }

    console.log(`${txs.length} transactions in period`);

    let totalGas = Decimal(0);
    let totalGasPrice = Decimal(0);
    let totalCostEth = Decimal(0);
    let gasPriceDist = {};
    txs.forEach(tx => {
        let gasUsed = Decimal(tx.gasUsed);
        totalGas = totalGas.plus(gasUsed);
        let gasPrice = Decimal(tx.gasPrice);
        totalGasPrice = totalGasPrice.plus(gasPrice);
        let ethCost = gasPrice.mul(gasUsed);
        totalCostEth = totalCostEth.plus(ethCost);
        console.log(`GasUsed: ${gasUsed}, GasPrice: ${gasPrice}, Eth Cost: ${ethCost}`);
        if(! gasPriceDist[tx.gasPrice])
          gasPriceDist[tx.gasPrice] = 1;
        else
          gasPriceDist[tx.gasPrice] += 1;
    });

    console.log(gasPriceDist);
    let avgGasPrice = totalGasPrice.div(txs.length);
    console.log(`Total Gas Used: ${totalGas.toString()}`);
    console.log(`Total Eth: ${totalCostEth.div(BONE).toString()}`);
    console.log(`Average Gas Price: ${avgGasPrice.toString()}`);
    // console.log(txs[txs.length-1]);
}

run();
