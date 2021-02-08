# Onchain Registry & Exchange Proxy

### Registry.sol

Stores a registry of Balancer Pool addresses for a given token address pair. Pools can be sorted in order of liquidity and queried via view functions.

Fork of https://github.com/CryptoManiacsZone/BalancerRegistry

> **Adding Pools To Registry**

`addPoolPair(address pool, address token1, address token2)`

Adds a single pool address for token pair.

`addPools(address[] calldata pools, address token1, address token2)`

Adds an array of pool addresses for token pair.

> **Sorting Pools**

`sortPools(address[] calldata tokens, uint256 lengthLimit)`

Sorts pools in order of liquidity. lengthLimit can be used to limit the number of pools sorted.

`sortPoolsWithPurge(address[] calldata tokens, uint256 lengthLimit)`

Sorts pools in order of liquidity and removes any pools with <10% of total liquidity.

> **Retrieving Pools**

`getBestPools(address fromToken, address destToken)`

Retrieve array of pool addresses for token pair. Ordered by liquidity if previously sorted. Max of 32 pools returned.

`getBestPoolsWithLimit(address fromToken, address destToken, uint256 limit)`

Retrieve array of pool addresses for token pair. Ordered by liquidity if previously sorted. Max of n pools returned where n=limit.

`getPoolsWithLimit(address fromToken, address destToken, uint256 offset, uint256 limit)`

Retrieve array of pool addresses using an offset starting position.

### ExchangeProxy.sol

This contract includes swap forwarding proxy logic and on-chain smart order routing functionality.

batchSwap functions allows users to batch execute swaps recommended by off-chain SOR.

viewSplit functions query the Registry to provide best swap information using on-chain data.

smartSwap functions combine view and batch functionality to provide complete optimised on-chain swaps.

> **batchSwap functions**

`multihopBatchSwapExactIn(Swap[][] memory swapSequences, TokenInterface tokenIn, TokenInterface tokenOut, uint totalAmountIn, uint minTotalAmountOut) public payable`

Execute multi-hop swaps returned from off-chain SOR for swapExactIn trade type.

`multihopBatchSwapExactOut(Swap[][] memory swapSequences, TokenInterface tokenIn, TokenInterface tokenOut, uint maxTotalAmountIn) public payable`

Execute multi-hop swaps returned from off-chain SOR for swapExactOut trade type.

`batchSwapExactIn(Swap[] memory swaps, TokenInterface tokenIn, TokenInterface tokenOut, uint totalAmountIn, uint minTotalAmountOut) public payable`

Execute single-hop swaps for swapExactIn trade type. Used for swaps returned from viewSplit function and legacy off-chain SOR.

`batchSwapExactOut(Swap[] memory swaps, TokenInterface tokenIn, TokenInterface tokenOut, uint maxTotalAmountIn) public payable`

Execute single-hop swaps for swapExactOut trade type. Used for swaps returned from viewSplit function and legacy off-chain SOR.

> **viewSplit functions**

`viewSplitExactIn(address tokenIn, address tokenOut, uint swapAmount, uint nPools)`

View function that calculates most optimal swaps (exactIn swap type) across a max of nPools. Returns an array of Swaps and the total amount out for swap.

`viewSplitExactOut(address tokenIn, address tokenOut, uint swapAmount, uint nPools)`

View function that calculates most optimal swaps (exactOut swap type) across a max of nPools. Returns an array of Swaps and the total amount in for swap. (! Please be aware the return parameter "totalOutput" in the contract is a misnomer and actually represents totalInput !)

> **smartSwap functions**

`smartSwapExactIn(TokenInterface tokenIn, TokenInterface tokenOut, uint totalAmountIn, uint minTotalAmountOut, uint nPools) public payable`

Calculates and executes most optimal swaps across a max of nPools for tokenIn > tokenOut swap with an input token amount = totalAmountIn.

`smartSwapExactOut(TokenInterface tokenIn, TokenInterface tokenOut, uint totalAmountOut, uint maxTotalAmountIn, uint nPools) public payable`

Calculates and executes most optimal swaps across a max of nPools for tokenIn > tokenOut swap with a desired output token amount = totalAmountOut.

## Testing

To run tests:

```
$ npx buidler node
$ npx buidler test
```

## Deploying

Deploy scripts:

Add .env variable to root and include: INFURA=your_api_key and KEYKOVAN/KEYRINKEBY/KEYMAIN=deploy_key 

* Mainnet: `$ npx buidler run --network main  deploy-script-mainnet.js`
* Kovan: `$ npx buidler run --network kovan deploy-script-kovan.js`
* Rinkeby: `$ npx buidler run --network rinkeby deploy-script-rinkeby.js`
