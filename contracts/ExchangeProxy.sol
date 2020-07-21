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

import "@nomiclabs/buidler/console.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

interface PoolInterface {
    function swapExactAmountIn(address, uint, address, uint, uint) external returns (uint, uint);
    function swapExactAmountOut(address, uint, address, uint, uint) external returns (uint, uint);
    function calcInGivenOut(uint, uint, uint, uint, uint, uint) external pure returns (uint);
    function calcOutGivenIn(uint, uint, uint, uint, uint, uint) external pure returns (uint);
    function getDenormalizedWeight(address) external view returns (uint);
    function getBalance(address) external view returns (uint);
    function getSwapFee() external view returns (uint);
    function joinswapExternAmountIn(address, uint, uint) external returns (uint);
    function exitswapExternAmountOut(address, uint, uint) external returns (uint);
}

interface TokenInterface {
    function balanceOf(address) external view returns (uint);
    function allowance(address, address) external view returns (uint);
    function approve(address, uint) external returns (bool);
    function transfer(address, uint) external returns (bool);
    function transferFrom(address, address, uint) external returns (bool);
    function deposit() external payable;
    function withdraw(uint) external;
}

interface RegistryInterface {
    function getBestPoolsWithLimit(address, address, uint) external view returns (address[] memory);
}

contract ExchangeProxy is Ownable {

    using SafeMath for uint256;

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
        address tokenIn;
        address tokenOut;
        uint    swapAmount; // tokenInAmount / tokenOutAmount
        uint    limitReturnAmount; // minAmountOut / maxAmountIn
        uint    maxPrice;
    }

    TokenInterface weth;
    RegistryInterface registry;
    address private constant ETH_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    uint private constant BONE = 10**18;

    constructor(address _weth) public {
        weth = TokenInterface(_weth);
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = RegistryInterface(_registry);
    }

    function batchSwapExactIn(
        Swap[] memory swaps,
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut
    )
        public payable
        returns (uint totalAmountOut)
    {
        transferFromAll(tokenIn, totalAmountIn);

        for (uint i = 0; i < swaps.length; i++) {
            Swap memory swap = swaps[i];
            TokenInterface SwapTokenIn = TokenInterface(swap.tokenIn);
            PoolInterface pool = PoolInterface(swap.pool);

            if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                SwapTokenIn.approve(swap.pool, 0);
            }
            SwapTokenIn.approve(swap.pool, swap.swapAmount);

            (uint tokenAmountOut,) = pool.swapExactAmountIn(
                                        swap.tokenIn,
                                        swap.swapAmount,
                                        swap.tokenOut,
                                        swap.limitReturnAmount,
                                        swap.maxPrice
                                    );
            totalAmountOut = tokenAmountOut.add(totalAmountOut);
        }

        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");

        transferAll(tokenOut, totalAmountOut);
        transferAll(tokenIn, getBalance(tokenIn));
    }

    function batchSwapExactOut(
        Swap[] memory swaps,
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint maxTotalAmountIn
    )
        public payable
        returns (uint totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i = 0; i < swaps.length; i++) {
            Swap memory swap = swaps[i];
            TokenInterface SwapTokenIn = TokenInterface(swap.tokenIn);
            PoolInterface pool = PoolInterface(swap.pool);

            if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                SwapTokenIn.approve(swap.pool, 0);
            }
            SwapTokenIn.approve(swap.pool, swap.limitReturnAmount);

            (uint tokenAmountIn,) = pool.swapExactAmountOut(
                                        swap.tokenIn,
                                        swap.limitReturnAmount,
                                        swap.tokenOut,
                                        swap.swapAmount,
                                        swap.maxPrice
                                    );
            totalAmountIn = tokenAmountIn.add(totalAmountIn);
        }
        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));

    }

    function multihopBatchSwapExactIn(
        Swap[][] memory swapSequences,
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut
    )
        public payable
        returns (uint totalAmountOut)
    {

        transferFromAll(tokenIn, totalAmountIn);

        for (uint i = 0; i < swapSequences.length; i++) {
            uint tokenAmountOut;
            for (uint k = 0; k < swapSequences[i].length; k++) {
                Swap memory swap = swapSequences[i][k];
                TokenInterface SwapTokenIn = TokenInterface(swap.tokenIn);
                if (k == 1) {
                    // Makes sure that on the second swap the output of the first was used
                    // so there is not intermediate token leftover
                    swap.swapAmount = tokenAmountOut;
                }

                PoolInterface pool = PoolInterface(swap.pool);
                if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                    SwapTokenIn.approve(swap.pool, 0);
                }
                SwapTokenIn.approve(swap.pool, swap.swapAmount);
                (tokenAmountOut,) = pool.swapExactAmountIn(
                                            swap.tokenIn,
                                            swap.swapAmount,
                                            swap.tokenOut,
                                            swap.limitReturnAmount,
                                            swap.maxPrice
                                        );
            }
            // This takes the amountOut of the last swap
            totalAmountOut = tokenAmountOut.add(totalAmountOut);
        }

        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");

        transferAll(tokenOut, totalAmountOut);
        transferAll(tokenIn, getBalance(tokenIn));

    }

    function multihopBatchSwapExactOut(
        Swap[][] memory swapSequences,
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint maxTotalAmountIn
    )
        public payable
        returns (uint totalAmountIn)
    {

        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i = 0; i < swapSequences.length; i++) {
            uint tokenAmountInFirstSwap;
            // Specific code for a simple swap and a multihop (2 swaps in sequence)
            if (swapSequences[i].length == 1) {
                Swap memory swap = swapSequences[i][0];
                TokenInterface SwapTokenIn = TokenInterface(swap.tokenIn);

                PoolInterface pool = PoolInterface(swap.pool);
                if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                    SwapTokenIn.approve(swap.pool, 0);
                }
                SwapTokenIn.approve(swap.pool, swap.limitReturnAmount);

                (tokenAmountInFirstSwap,) = pool.swapExactAmountOut(
                                        swap.tokenIn,
                                        swap.limitReturnAmount,
                                        swap.tokenOut,
                                        swap.swapAmount,
                                        swap.maxPrice
                                    );
            } else {
                // Consider we are swapping A -> B and B -> C. The goal is to buy a given amount
                // of token C. But first we need to buy B with A so we can then buy C with B
                // To get the exact amount of C we then first need to calculate how much B we'll need:
                uint intermediateTokenAmount; // This would be token B as described above
                Swap memory secondSwap = swapSequences[i][1];
                PoolInterface poolSecondSwap = PoolInterface(secondSwap.pool);
                intermediateTokenAmount = poolSecondSwap.calcInGivenOut(
                                        poolSecondSwap.getBalance(secondSwap.tokenIn),
                                        poolSecondSwap.getDenormalizedWeight(secondSwap.tokenIn),
                                        poolSecondSwap.getBalance(secondSwap.tokenOut),
                                        poolSecondSwap.getDenormalizedWeight(secondSwap.tokenOut),
                                        secondSwap.swapAmount,
                                        poolSecondSwap.getSwapFee()
                                    );

                //// Buy intermediateTokenAmount of token B with A in the first pool
                Swap memory firstSwap = swapSequences[i][0];
                TokenInterface FirstSwapTokenIn = TokenInterface(firstSwap.tokenIn);
                PoolInterface poolFirstSwap = PoolInterface(firstSwap.pool);
                if (FirstSwapTokenIn.allowance(address(this), firstSwap.pool) < uint(-1)) {
                    FirstSwapTokenIn.approve(firstSwap.pool, uint(-1));
                }

                (tokenAmountInFirstSwap,) = poolFirstSwap.swapExactAmountOut(
                                        firstSwap.tokenIn,
                                        firstSwap.limitReturnAmount,
                                        firstSwap.tokenOut,
                                        intermediateTokenAmount, // This is the amount of token B we need
                                        firstSwap.maxPrice
                                    );

                //// Buy the final amount of token C desired
                TokenInterface SecondSwapTokenIn = TokenInterface(secondSwap.tokenIn);
                if (SecondSwapTokenIn.allowance(address(this), secondSwap.pool) < uint(-1)) {
                    SecondSwapTokenIn.approve(secondSwap.pool, uint(-1));
                }

                poolSecondSwap.swapExactAmountOut(
                                        secondSwap.tokenIn,
                                        secondSwap.limitReturnAmount,
                                        secondSwap.tokenOut,
                                        secondSwap.swapAmount,
                                        secondSwap.maxPrice
                                    );
            }
            totalAmountIn = tokenAmountInFirstSwap.add(totalAmountIn);
        }

        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));

    }

    function smartSwapExactIn(
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut,
        uint nPools
    )
        public payable
        returns (uint totalAmountOut)
    {
        Swap[] memory swaps;
        if (isETH(tokenIn)) {
          (swaps,) = viewSplitExactIn(address(weth), address(tokenOut), totalAmountIn, nPools);
        } else if (isETH(tokenOut)){
          (swaps,) = viewSplitExactIn(address(tokenIn), address(weth), totalAmountIn, nPools);
        } else {
          (swaps,) = viewSplitExactIn(address(tokenIn), address(tokenOut), totalAmountIn, nPools);
        }

        totalAmountOut = batchSwapExactIn(swaps, tokenIn, tokenOut, totalAmountIn, minTotalAmountOut);
    }

    function smartSwapExactOut(
        TokenInterface tokenIn,
        TokenInterface tokenOut,
        uint totalAmountOut,
        uint maxTotalAmountIn,
        uint nPools
    )
        public payable
        returns (uint totalAmountIn)
    {
        Swap[] memory swaps;
        if (isETH(tokenIn)) {
          (swaps,) = viewSplitExactOut(address(weth), address(tokenOut), totalAmountOut, nPools);
        } else if (isETH(tokenOut)){
          (swaps,) = viewSplitExactOut(address(tokenIn), address(weth), totalAmountOut, nPools);
        } else {
          (swaps,) = viewSplitExactOut(address(tokenIn), address(tokenOut), totalAmountOut, nPools);
        }

        totalAmountIn = batchSwapExactOut(swaps, tokenIn, tokenOut, maxTotalAmountIn);
    }

    function joinswapExternAmountIn(
        address poolAddress,
        TokenInterface tokenIn,
        uint tokenAmountIn,
        uint minPoolAmountOut
    )
        public payable
        returns (uint poolAmountOut)
    {
        transferFromAll(tokenIn, tokenAmountIn);

        PoolInterface pool = PoolInterface(poolAddress);

        TokenInterface tokenSwap = tokenIn;

        if (isETH(tokenIn)) {
          tokenSwap = weth;
        }

        if (tokenSwap.allowance(address(this), poolAddress) > 0) {
            tokenSwap.approve(poolAddress, 0);
        }
        tokenSwap.approve(poolAddress, tokenAmountIn);

        poolAmountOut = pool.joinswapExternAmountIn(address(tokenSwap), tokenAmountIn, minPoolAmountOut);

        // Returns any remaing tokenIn
        transferAll(tokenIn, getBalance(tokenIn));
        // Send pool token
        TokenInterface poolToken = TokenInterface(poolAddress);
        transferAll(poolToken, getBalance(poolToken));
    }

    function exitswapExternAmountOut(
        address poolAddress,
        TokenInterface tokenOut,
        uint tokenAmountOut,
        uint maxPoolAmountIn
    )
        public payable
        returns (uint poolAmountIn)
    {
        TokenInterface poolToken = TokenInterface(poolAddress);
        transferFromAll(poolToken, maxPoolAmountIn);

        if (poolToken.allowance(address(this), poolAddress) > 0) {
            poolToken.approve(poolAddress, 0);
        }
        poolToken.approve(poolAddress, maxPoolAmountIn);

        PoolInterface pool = PoolInterface(poolAddress);

        if (isETH(tokenOut)) {
          poolAmountIn = pool.exitswapExternAmountOut(address(weth), tokenAmountOut, maxPoolAmountIn);
        } else {
          poolAmountIn = pool.exitswapExternAmountOut(address(tokenOut), tokenAmountOut, maxPoolAmountIn);
        }

        // Returns any remaing tokenIn
        transferAll(poolToken, getBalance(poolToken));
        // Send pool token
        transferAll(tokenOut, tokenAmountOut);
    }

    function viewSplitExactIn(
        address tokenIn,
        address tokenOut,
        uint swapAmount,
        uint nPools
    )
        public view
        returns (Swap[] memory swaps, uint totalOutput)
    {
        address[] memory poolAddresses = registry.getBestPoolsWithLimit(tokenIn, tokenOut, nPools);

        Pool[] memory pools = new Pool[](poolAddresses.length);
        uint sumLiquidity;
        for (uint i = 0; i < poolAddresses.length; i++) {
            pools[i] = getPoolData(tokenIn, tokenOut, poolAddresses[i]);
            sumLiquidity = sumLiquidity.add(pools[i].slippageSlopeEffectivePrice);
        }

        uint[] memory bestInputAmounts = new uint[](pools.length);
        for (uint i = 0; i < pools.length; i++) {
            bestInputAmounts[i] = bmul(swapAmount, bdiv(pools[i].slippageSlopeEffectivePrice, sumLiquidity));//swapAmount.mul(pools[i].slippageSlopeEffectivePrice.div(sumLiquidity));
        }
        bestInputAmounts = calcDust(bestInputAmounts, swapAmount);
        swaps = new Swap[](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            swaps[i] = Swap({
                        pool: pools[i].pool,
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        swapAmount: bestInputAmounts[i],
                        limitReturnAmount: 0,
                        maxPrice: uint(-1)
                    });
        }

        totalOutput = calcTotalOutExactIn(bestInputAmounts, pools);

        return (swaps, totalOutput);
    }

    function viewSplitExactOut(
        address tokenIn,
        address tokenOut,
        uint swapAmount,
        uint nPools
    )
        public view
        returns (Swap[] memory swaps, uint totalOutput)
    {
        address[] memory poolAddresses = registry.getBestPoolsWithLimit(tokenIn, tokenOut, nPools);

        Pool[] memory pools = new Pool[](poolAddresses.length);
        uint sumLiquidity;
        for (uint i = 0; i < poolAddresses.length; i++) {
            pools[i] = getPoolData(tokenIn, tokenOut, poolAddresses[i]);
            sumLiquidity = sumLiquidity.add(pools[i].slippageSlopeEffectivePrice);
        }

        uint[] memory bestInputAmounts = new uint[](pools.length);
        for (uint i = 0; i < pools.length; i++) {
            bestInputAmounts[i] = bmul(swapAmount, bdiv(pools[i].slippageSlopeEffectivePrice, sumLiquidity));//swapAmount.mul(pools[i].slippageSlopeEffectivePrice.div(sumLiquidity));
        }
        bestInputAmounts = calcDust(bestInputAmounts, swapAmount);
        swaps = new Swap[](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            swaps[i] = Swap({
                        pool: pools[i].pool,
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        swapAmount: bestInputAmounts[i],
                        limitReturnAmount: uint(-1),
                        maxPrice: uint(-1)
                    });
        }

        totalOutput = calcTotalOutExactOut(bestInputAmounts, pools);

        return (swaps, totalOutput);
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
        uint tokenWeightIn = pool.getDenormalizedWeight(tokenIn);
        uint tokenWeightOut = pool.getDenormalizedWeight(tokenOut);
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
            bdiv(
                tokenWeightOut,
                tokenWeightIn
            ).add(BONE),
            bmul(
                2*BONE,
                tokenBalanceOut
            )
        );

        return slippageSlopeEffectivePrice;
    }

    function badd(uint a, uint b)
        internal pure
        returns (uint)
    {
        uint c = a + b;
        require(c >= a, "ERR_ADD_OVERFLOW");
        return c;
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

            totalOutput = totalOutput.add(output);
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

    function transferFromAll(TokenInterface token, uint256 amount) internal returns(bool) {
        if (isETH(token)) {
            weth.deposit.value(msg.value)();
        } else {
            require(token.transferFrom(msg.sender, address(this), amount), "ERR_TRANSFER_FAILED");
        }
    }

    function getBalance(TokenInterface token) internal view returns (uint256) {
        if (isETH(token)) {
            return address(this).balance;
        } else {
            return token.balanceOf(address(this));
        }
    }

    function transferAll(TokenInterface token, uint256 amount) internal returns(bool) {
        if (amount == 0) {
            return true;
        }

        if (isETH(token)) {
            weth.withdraw(amount);
            (bool xfer,) = msg.sender.call.value(amount)("");
            require(xfer, "ERR_ETH_FAILED");
        } else {
            require(token.transfer(msg.sender, amount), "ERR_TRANSFER_FAILED");
        }
    }

    function isETH(TokenInterface token) internal pure returns(bool) {
        return (address(token) == ETH_ADDRESS);
    }

    function bmul(uint a, uint b)
        internal pure
        returns (uint)
    {
        uint c0 = a * b;
        require(a == 0 || c0 / a == b, "ERR_MUL_OVERFLOW");
        uint c1 = c0 + (BONE / 2);
        require(c1 >= c0, "ERR_MUL_OVERFLOW");
        uint c2 = c1 / BONE;
        return c2;
    }

    function bdiv(uint a, uint b)
        internal pure
        returns (uint)
    {
        require(b != 0, "ERR_DIV_ZERO");
        uint c0 = a * BONE;
        require(a == 0 || c0 / a == BONE, "ERR_DIV_INTERNAL"); // bmul overflow
        uint c1 = c0 + (b / 2);
        require(c1 >= c0, "ERR_DIV_INTERNAL"); //  badd require
        uint c2 = c1 / b;
        return c2;
    }

    function bsubSign(uint a, uint b)
        internal pure
        returns (uint, bool)
    {
        if (a >= b) {
            return (a - b, false);
        } else {
            return (b - a, true);
        }
    }

    function sum(uint[] memory _data)
      internal pure
      returns (uint total)
    {
        for (uint i = 0; i < _data.length; ++i) {
            assembly {
                total := add(total, mload(add(add(_data, 0x20), mul(i, 0x20))))
            }
        }
    }

    function bsub(uint a, uint b)
        internal pure
        returns (uint)
    {
        (uint c, bool flag) = bsubSign(a, b);
        require(!flag, "ERR_SUB_UNDERFLOW");
        return c;
    }

    function() external payable {}
}
