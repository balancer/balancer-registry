require('dotenv').config();
import fetch from 'isomorphic-fetch';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
    filterPoolsWithTokensDirect,
    filterAllPools,
    getAllPoolDataOnChain
} from '@balancer-labs/sor';
import * as ethers from 'ethers';
import { Decimal } from 'decimal.js';

const MAINNET = true;
const NO_POOLS = 3;
let PROVIDER: string, WALLET_KEY: string, SUBGRAPH_URL: string, REGISTRY: string;
if(MAINNET){
  PROVIDER = `https://mainnet.infura.io/v3/${process.env.INFURA}`;
  WALLET_KEY = `${process.env.KEYMAIN}`;
  SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer';
  REGISTRY = '0x373610EC3949a13586121b642d8c03e34A926cAa';
}else{
  PROVIDER = `https://kovan.infura.io/v3/${process.env.INFURA}`;
  WALLET_KEY = `${process.env.KEYKOVAN}`;
  SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-kovan';
  REGISTRY = '0x373610EC3949a13586121b642d8c03e34A926cAa'; // KOVAN
}

// Pairs from top 50 pools
let pairArray: Pair[];
pairArray = [
  /*
  {token1: '0xe2f2a5c287993345a840db3b0845fbc70f5935a5', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0xe2f2a5c287993345a840db3b0845fbc70f5935a5', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x80fb784b7ed66730e8b1dbd9820afd29931aab03', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xba100000625a3754423978a60c9317c58a424e3d', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x1985365e9f78359a9b6ad760e32412f4a445e862', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', token2: '0x6b175474e89094c44da98b954eedeac495271d0f'},
  {token1: '0x6b175474e89094c44da98b954eedeac495271d0f', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x81ab848898b5ffd3354dbbefb333d5d183eedcb5', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xb4efd85c19999d84251304bda99e90b92300bd93', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x514910771af9ca656af840dff83e8264ecf986ca', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x408e41876cccdc0f92210600ef50372656052a38', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x57ab1ec28d129707052df4df418d58a2d46d5f51', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0x93ed3fbe21207ec2e8f2d3c3de6e058cb73bc04d', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'}
  */
  {token1: '0xba100000625a3754423978a60c9317c58a424e3d', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xa1d0e215a23d7030842fc67ce582a6afa3ccab83', token2: '0x6b175474e89094c44da98b954eedeac495271d0f'},
  {token1: '0xe2f2a5c287993345a840db3b0845fbc70f5935a5', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xe2f2a5c287993345a840db3b0845fbc70f5935a5', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0x80fb784b7ed66730e8b1dbd9820afd29931aab03', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x0d438f3b5175bebc262bf23753c1e53d03432bde', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', token2: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  {token1: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x6b175474e89094c44da98b954eedeac495271d0f', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x45f24baeef268bb6d63aee5129015d69702bcdfa', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x408e41876cccdc0f92210600ef50372656052a38', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x56d811088235f11c8920698a204a5010a788f4b3', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x476c5e26a75bd202a9683ffd34359c0cc15be0ff', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x93ed3fbe21207ec2e8f2d3c3de6e058cb73bc04d', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'},
  {token1: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb', token2: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'}
];
/* KOVAN TEST
pairArray = [
  {token1: '0x7bd221ae7487632b31915af1b567e23eb4700331', token2: '0x76842171b7e340c0ba9b1609706ba0882ca20f33'},
  {token1: '0xd0A1E359811322d97991E03f863a0C30C2cF029C', token2: '0x1528F3FCc26d13F7079325Fb78D9442607781c8C'}, // WETH/DAI
  {token1: '0xd0A1E359811322d97991E03f863a0C30C2cF029C', token2: '0xef13C0c8abcaf5767160018d268f9697aE4f5375'} // WETH/MKR
]
*/

let totalGas = Number(0);

interface HashTable<T> {
    [key: string]: T;
}

interface PoolList {
    [index: string]: any;
}

interface PoolLiq {
    address: string;
    liq: Decimal;
}

interface PairLiq {
    token1: string;
    token2: string;
    poolsLiq: PoolLiq[];
    topLiq: string[];
    totalLiq: Decimal;
}

interface Pair {
    token1: string;
    token2: string;
}

// Returns all public & active pools
export async function getAllActivePools() {
    const query = `
      {
          pools (first: 1000, where: {publicSwap: true, active: true}) {
            id
            swapFee
            totalWeight
            publicSwap
            tokens {
              id
              address
              balance
              decimals
              symbol
              denormWeight
            }
            tokensList
          }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
        }),
    });

    const { data } = await response.json();
    return data;
}

export function calculateLiquidity(
  PoolTotalWeight: string,
  Token1DenormWeight: string,
  Token2DenormWeight: string,
  Token2Balance: string
): Decimal {
    const t1w = new Decimal(Token1DenormWeight);
    const totalw = new Decimal(PoolTotalWeight);
    const t2w = new Decimal(Token2DenormWeight);
    const t2b = new Decimal(Token2Balance);

    const w1norm = t1w.div(totalw);
    const w2norm = t2w.div(totalw);

    const num = t2b.mul(w1norm);
    const den = w1norm.plus(w2norm);
    return num.div(den);
}

function isPairPoolsCurrent(NewPools: string[], OnChainPools: string[]){
    // console.log(NewPools);
    // console.log(OnChainPools);
    if(NewPools.length === 0)
        return true;

    if(NewPools.length > 0 && OnChainPools.length === 0)
        return false;

    if(NewPools.length > OnChainPools.length)
        return false;

    if(NewPools.length <= OnChainPools.length){     // !!!!!!! TODO: Should we remove on-chain pools if less?
      NewPools.forEach((pool:string, i: number) => {
        if(pool.toLowerCase() !== OnChainPools[i].toLowerCase()){
          return false;
        }
      })
    }

    return true;
}

// Compares on-chain top 3 pools with current list. Update and sort if different.
async function updateOnChainPools(Pools: string[], Token1: string, Token2: string, estimate=false) {
    const artifact = require('./artifacts/BRegistry.json');

    let provider = new ethers.providers.JsonRpcProvider(PROVIDER);
    let wallet = new ethers.Wallet(WALLET_KEY, provider);
    const registry = new ethers.Contract(REGISTRY, artifact.abi, provider);

    let contractWithSigner = registry.connect(wallet);
    let onChainPools = await registry.getBestPoolsWithLimit(Token1, Token2, 3);

    let poolCheck = isPairPoolsCurrent(Pools, onChainPools);
    console.log(`Is Current: ${poolCheck}`);

    if(poolCheck && !estimate){
      console.log(`On-chain List Already Up To Date:`);
      console.table(onChainPools);
      return;
    }

    if(!estimate){
      let tx = await contractWithSigner.addPools(Pools, Token1, Token2, {
        gasPrice: 0
        // gasPrice: 70000000000
      });
      console.log(`Waiting For AddPools Tx: ${tx.hash}`);
      await tx.wait();

      tx = await contractWithSigner.sortPools([Token1, Token2], 3, {
        // gasPrice: 70000000000
        gasPrice: 0
      });
      console.log(`Waiting For Sort Tx: ${tx.hash}`);
      await tx.wait();

      onChainPools = await registry.getBestPoolsWithLimit(Token1, Token2, 3);
      console.log(`Pools Updated, On-chain List:`);
      console.table(onChainPools);
    }else{
      let estimate = await contractWithSigner.estimateGas.addPools(Pools, Token1, Token2);
      console.log(`Add pools gasEstimate: ${estimate}`);
      totalGas += Number(estimate);
      estimate = await contractWithSigner.estimateGas.sortPools([Token1, Token2], 3);
      console.log(`Sort pools gasEstimate: ${estimate}`);
      totalGas += Number(estimate);
    }
}

// This gets all tokens for pools - Not used.
function getTokenList(Pools: any): string[]{
    let tokens: string[] = [];
    let seen: HashTable<boolean> = {};

    Pools.pools.forEach((pool:any) => {
      pool.tokensList.forEach((token: string) => {
        if(seen[token] !== true){
          seen[token] = true;
          tokens.push(token);
          // console.log(token);
        }
      })
    })

    let noTokens = tokens.length;
    let combinations = (noTokens*(noTokens-1))/2;
    console.log(`${noTokens} tokens give ${combinations} combinations.`);
    return tokens;
}

function getPairLiquidity(directPools: PoolList, Token1: string, Token2: string): PairLiq{
    let poolLiq: PoolLiq[] = [];
    let totalPoolLiqudity: Decimal = new Decimal(0);

    Object.keys(directPools).forEach((key: string) => {
      let pool = directPools[key];
      const token1 = pool.tokens.find((t: any) => t.address === Token1);
      const token2 = pool.tokens.find((t: any) => t.address === Token2);

      let liq: Decimal;
      liq = calculateLiquidity(pool.totalWeight, token1.denormWeight, token2.denormWeight, token2.balance);

      poolLiq.push({
        address: pool.id,
        liq: liq
      })

      totalPoolLiqudity = totalPoolLiqudity.plus(liq);
    })

    poolLiq = poolLiq.sort((a, b) => {
          return b.liq.minus(a.liq).toNumber();
      });

    let topLiq: string[] = [];
    poolLiq.forEach(pool => {
      if(pool.liq.gt(totalPoolLiqudity.times(0.1)))
        topLiq.push(pool.address);
    })

    let pairLiq: PairLiq = {
      token1: Token1,
      token2: Token2,
      poolsLiq: poolLiq,
      topLiq: topLiq.slice(0, NO_POOLS-1), // !!!!!! TODO: Slice to 3
      totalLiq: totalPoolLiqudity
    }
    return pairLiq;
}

async function run(estimate=false) {

  if(estimate)
    console.log('!!!!!!! Running Estimate !!!!!!');
  // Get active pools from Subgraph
  const activePools = await getAllActivePools();

  // For each pair:
  // Find direct pools
  // Calculate pair liquidity for each pool
  // Order pools by liquidity and select top 3
  // Compare to top 3 pools on Registry and update if different
  for(let i = 0;i < pairArray.length;i++){
  // for(let i = 0;i < 2;i++){
    let pair: Pair = pairArray[i];
    pair.token1 = pair.token1.toLowerCase();
    pair.token2 = pair.token2.toLowerCase();

    let directPools: PoolList = filterPoolsWithTokensDirect(
              activePools.pools,
              pair.token1,
              pair.token2
          );

    const pairLiq: PairLiq = getPairLiquidity(directPools, pair.token1, pair.token2);

    console.group(`Pair: ${pair.token1}/${pair.token2}`);
    console.log(`No direct pools: ${Object.keys(directPools).length}`);
    console.log(`Total liquidity: ${pairLiq.totalLiq.toString()}`);
    console.log(`Pools ordered by liquidity:`);
    console.table(pairLiq.poolsLiq);
    console.log(`Pools to add to Registry: `);
    console.table(pairLiq.topLiq);

    await updateOnChainPools(pairLiq.topLiq, pairLiq.token1, pairLiq.token2, estimate);
    console.groupEnd();
    console.log();
  }

  if(estimate)
    console.log(`Total Gas: ${totalGas}`);
  console.log('DONE');
}

run(true);
