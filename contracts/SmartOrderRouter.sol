// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.5.12;
pragma experimental ABIEncoderV2;


import "./BNum.sol";

contract RegistryInterface {
    function getBestPoolsWithLimit(address, address, uint256) external view returns (address[] memory);
    function getPoolsWithLimit(address, address, uint256, uint256) public view returns(address[] memory);
}

contract PoolInterface {
    function swapExactAmountIn(address, uint, address, uint, uint) external returns (uint, uint);
    function swapExactAmountOut(address, uint, address, uint, uint) external returns (uint, uint);
    function getNormalizedWeight(address) external view returns (uint);
    function getBalance(address) external view returns (uint);
    function getSwapFee() external view returns (uint);
    function calcOutGivenIn(uint, uint, uint, uint, uint, uint) public pure returns (uint);
    function calcInGivenOut(uint, uint, uint, uint, uint, uint) public pure returns (uint);
}

contract TokenInterface {
    function balanceOf(address) public view returns (uint);
    function allowance(address, address) public view returns (uint);
    function approve(address, uint) public returns (bool);
    function transfer(address, uint) public returns (bool);
    function transferFrom(address, address, uint) public returns (bool);
}

contract SmartOrderRouter is BNum {

    struct Pool {
        address pool;
        uint    tokenBalanceIn;
        uint    tokenWeightIn;
        uint    tokenBalanceOut;
        uint    tokenWeightOut;
        uint    swapFee;
        uint    slippageSlopeEffectivePrice;
    }

    struct Swap {
        address pool;
        uint    tokenInParam; // tokenInAmount / maxAmountIn / limitAmountIn
        uint    tokenOutParam; // minAmountOut / tokenAmountOut / limitAmountOut
        uint    maxPrice;
    }

    RegistryInterface registry;

	constructor(address _registry) public {
        registry = RegistryInterface(_registry);
    }

    function getPoolData(
        address tokenIn,
        address tokenOut,
        address poolAddress
    )
        public view
        returns (Pool memory)
    {
        PoolInterface pool = PoolInterface(poolAddress);
        uint tokenBalanceIn = pool.getBalance(tokenIn);
        uint tokenBalanceOut = pool.getBalance(tokenOut);
        uint tokenWeightIn = pool.getNormalizedWeight(tokenIn);
        uint tokenWeightOut = pool.getNormalizedWeight(tokenOut);
        uint swapFee = pool.getSwapFee();

        uint slippageSlopeEffectivePrice = calcSlippageSlopeEffectivePrice(
                                            tokenWeightIn,
                                            tokenBalanceOut,
                                            tokenWeightOut
                                        );
        Pool memory returnPool = Pool({
            pool: poolAddress,
            tokenBalanceIn: tokenBalanceIn,
            tokenWeightIn: tokenWeightIn,
            tokenBalanceOut: tokenBalanceOut,
            tokenWeightOut: tokenWeightOut,
            swapFee: swapFee,
            slippageSlopeEffectivePrice: slippageSlopeEffectivePrice
        });

        return returnPool;
    }

    function viewSplit(
        bool swapExactIn,
        address tokenIn,
        address tokenOut,
        uint swapAmount,
        uint nPools
    )
        public view
        returns (Swap[] memory swaps, uint totalOutput)
    {
        address[] memory poolAddresses = registry.getPoolsWithLimit(tokenIn, tokenOut, 0, 10);
        Pool[] memory pools = new Pool[](poolAddresses.length);
        for (uint i = 0; i < poolAddresses.length; i++) {
            pools[i] = getPoolData(tokenIn, tokenOut, poolAddresses[i]);
        }

        (uint[] memory bestInputAmounts, Pool[] memory bestPools) = calcSplit(pools, swapAmount, nPools);

        swaps = new Swap[](bestPools.length);

        if (swapExactIn) {
            for (uint i = 0; i < bestPools.length; i++) {
                swaps[i] = Swap({
                            pool: bestPools[i].pool,
                            tokenInParam: bestInputAmounts[i],
                            tokenOutParam: 0,
                            maxPrice: MAX_UINT
                        });
            }

            totalOutput = calcTotalOutExactIn(bestInputAmounts, bestPools);
        } else {
            for (uint i = 0; i < bestPools.length; i++) {
                swaps[i] = Swap({
                            pool: bestPools[i].pool,
                            tokenInParam: MAX_UINT,
                            tokenOutParam: bestInputAmounts[i],
                            maxPrice: MAX_UINT
                        });
            }

            totalOutput = calcTotalOutExactOut(bestInputAmounts, bestPools);
        }

        return (swaps, totalOutput);
    }

    function executeSplitExactIn(
        address tokenIn,
        address tokenOut,
        uint totalAmountIn,
        uint nPools,
        uint minTotalAmountOut
    )
        public
        returns (uint totalAmountOut)
    {
        Swap[] memory swaps;
        (swaps,) = viewSplit(true, tokenIn, tokenOut, totalAmountIn, nPools);

        TokenInterface TI = TokenInterface(tokenIn);
        TokenInterface TO = TokenInterface(tokenOut);

        require(TI.transferFrom(msg.sender, address(this), totalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            Swap memory swap = swaps[i];

            PoolInterface pool = PoolInterface(swap.pool);
            if (TI.allowance(address(this), swap.pool) < totalAmountIn) {
                TI.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountOut,) = pool.swapExactAmountIn(
                                        tokenIn,
                                        swap.tokenInParam,
                                        tokenOut,
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );
            totalAmountOut = badd(tokenAmountOut, totalAmountOut);
        }
        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");
        uint tokenOutBalance = TO.balanceOf(address(this));
        uint tokenInBalance = TI.balanceOf(address(this));
        if (tokenOutBalance > 0) {
            require(TO.transfer(msg.sender, tokenOutBalance), "ERR_TRANSFER_FAILED");
        }
        if (tokenInBalance > 0) {
            require(TI.transfer(msg.sender, tokenInBalance), "ERR_TRANSFER_FAILED");
        }
        return totalAmountOut;

    }

    function executeSplitExactOut(
        address tokenIn,
        address tokenOut,
        uint totalAmountOut,
        uint nPools,
        uint maxTotalAmountIn
    )
        public
        returns (uint totalAmountIn)
    {
        Swap[] memory swaps;
        (swaps,) = viewSplit(false, tokenIn, tokenOut, totalAmountOut, nPools);

        TokenInterface TI = TokenInterface(tokenIn);
        TokenInterface TO = TokenInterface(tokenOut);

        require(TI.transferFrom(msg.sender, address(this), maxTotalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            Swap memory swap = swaps[i];
            PoolInterface pool = PoolInterface(swap.pool);
            if (TI.allowance(address(this), swap.pool) < maxTotalAmountIn) {
                TI.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountIn,) = pool.swapExactAmountOut(
                                        tokenIn,
                                        swap.tokenInParam,
                                        tokenOut,
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );
            totalAmountIn = badd(tokenAmountIn, totalAmountIn);
        }
        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        uint tokenOutBalance = TO.balanceOf(address(this));
        uint tokenInBalance = TI.balanceOf(address(this));
        if (tokenOutBalance > 0) {
            require(TO.transfer(msg.sender, tokenOutBalance), "ERR_TRANSFER_FAILED");
        }
        if (tokenInBalance > 0) {
            require(TI.transfer(msg.sender, tokenInBalance), "ERR_TRANSFER_FAILED");
        }
        return totalAmountIn;

    }

    function calcSplit(
        Pool[] memory pools,
        uint swapAmount,
        uint nPools
    )
        public pure
        returns (uint[] memory bestInputAmounts, Pool[] memory bestPools)
    {

        // Gets nPools with best liquidity (lowest slippageSlopeEffectivePrice) ignoring spot prices
        bestPools = getBestPoolsBySlippage(pools, nPools);

        // tokenAmount is split proportionally to normalized liquidity (which is the inverse of slippage)
        uint[] memory inverseSlippage;
        inverseSlippage = new uint[](bestPools.length);
        for (uint i = 0; i < bestPools.length; i++) {
            inverseSlippage[i] = bdiv(
                BONE,
                bestPools[i].slippageSlopeEffectivePrice
            );
        }

        uint suminverseSlippage = sum(inverseSlippage);

        // Calculate inputAmounts and price
        bestInputAmounts = new uint[](bestPools.length);
        for (uint i = 0; i < bestPools.length; i++) {
            bestInputAmounts[i] = bmul(
                swapAmount,
                bdiv(
                    inverseSlippage[i],
                    suminverseSlippage
                )
            );
        }

        bestInputAmounts = calcDust(bestInputAmounts, swapAmount);

        return (bestInputAmounts, bestPools);
    }

    function getBestPoolsBySlippage(
        Pool[] memory _pools,
        uint nPools
    )
        public pure
        returns (Pool[] memory bestPools)
    {
        Pool[] memory pools = _pools;
        Pool memory bestPool;

        uint poolsMin = min(pools.length, nPools);

        uint bestSlippage;
        uint indexBestPool;
        bestPools = new Pool[](poolsMin);

        for (uint i = 0; i < poolsMin; i++) {
            bestSlippage = MAX_UINT;
            indexBestPool = 0;
            for (uint k = 0; k < pools.length; k++) {
                if (pools[k].slippageSlopeEffectivePrice < bestSlippage) {
                    bestSlippage = pools[k].slippageSlopeEffectivePrice;
                    indexBestPool = k;
                    bestPool = pools[k];
                }
            }
            bestPools[i] = bestPool;
            pools = removePool(pools, indexBestPool);
        }
        return bestPools;
    }

    function calcDust(
        uint[] memory bestInputAmounts,
        uint swapAmount
    )
        public pure
        returns (uint[] memory)
    {
        uint sumBestInputAmounts = sum(bestInputAmounts);

        // Add dust to the first swapAmount (which is always the greater) if rounding error is negative
        if (sumBestInputAmounts < swapAmount) {
            bestInputAmounts[0] = badd(bestInputAmounts[0], bsub(swapAmount, sumBestInputAmounts));
        } else {
            bestInputAmounts[0] = bsub(bestInputAmounts[0], bsub(sumBestInputAmounts, swapAmount));
        }
        return bestInputAmounts;
    }

    function calcTotalOutExactIn(
        uint[] memory bestInputAmounts,
        Pool[] memory bestPools
    )
        public pure
        returns (uint totalOutput)
    {
        totalOutput = 0;
        for (uint i = 0; i < bestInputAmounts.length; i++) {
            uint output = PoolInterface(bestPools[i].pool).calcOutGivenIn(
                                bestPools[i].tokenBalanceIn,
                                bestPools[i].tokenWeightIn,
                                bestPools[i].tokenBalanceOut,
                                bestPools[i].tokenWeightOut,
                                bestInputAmounts[i],
                                bestPools[i].swapFee
                            );

            totalOutput = badd(totalOutput, output);
        }
        return totalOutput;
    }

    function calcTotalOutExactOut(
        uint[] memory bestInputAmounts,
        Pool[] memory bestPools
    )
        public pure
        returns (uint totalOutput)
    {
        totalOutput = 0;
        for (uint i = 0; i < bestInputAmounts.length; i++) {
            uint output = PoolInterface(bestPools[i].pool).calcInGivenOut(
                                bestPools[i].tokenBalanceIn,
                                bestPools[i].tokenWeightIn,
                                bestPools[i].tokenBalanceOut,
                                bestPools[i].tokenWeightOut,
                                bestInputAmounts[i],
                                bestPools[i].swapFee
                            );

            totalOutput = badd(totalOutput, output);
        }
        return totalOutput;
    }

    function calcSlippageSlopeEffectivePrice(
        uint tokenWeightIn,
        uint tokenBalanceOut,
        uint tokenWeightOut
    )
        public pure
        returns (uint slippageSlopeEffectivePrice)
    {

        // (wo/wi+1)/(2*Bo)
        slippageSlopeEffectivePrice = bdiv(
            badd(
                bdiv(
                    tokenWeightOut,
                    tokenWeightIn
                ),
                BONE
            ),
            bmul(
                2*BONE,
                tokenBalanceOut
            )
        );

        return slippageSlopeEffectivePrice;
    }

    function removePool(
        Pool[] memory array,
        uint index
    )
        public pure
        returns(Pool[] memory array_return)
    {
        if (index >= array.length) return array;
        array_return = new Pool[](array.length-1);

        for (uint i = 0; i<index; i++){
            array_return[i] = array[i];
        }

        for (uint i = index; i<array.length-1; i++){
            array_return[i] = array[i+1];
        }
        return array_return;
    }

}
