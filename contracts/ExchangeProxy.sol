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

contract PoolInterface {
    function swapExactAmountIn(address, uint, address, uint, uint) external returns (uint, uint);
    function swapExactAmountOut(address, uint, address, uint, uint) external returns (uint, uint);
    function calcInGivenOut(uint, uint, uint, uint, uint, uint) public pure returns (uint);
    function getDenormalizedWeight(address) external view returns (uint);
    function getBalance(address) external view returns (uint);
    function getSwapFee() external view returns (uint);
}

contract TokenInterface {
    function balanceOf(address) public view returns (uint);
    function allowance(address, address) public view returns (uint);
    function approve(address, uint) public returns (bool);
    function transfer(address, uint) public returns (bool);
    function transferFrom(address, address, uint) public returns (bool);
    function deposit() public payable;
    function withdraw(uint) public;
}

contract SmartOrderRouterInterface {
    struct Swap {
        address pool;
        uint    tokenInParam; // tokenInAmount / maxAmountIn / limitAmountIn
        uint    tokenOutParam; // minAmountOut / tokenAmountOut / limitAmountOut
        uint    maxPrice;
    }

    function viewSplit(bool, address, address, uint, uint) public view returns (Swap[] memory, uint);
}

contract ExchangeProxy {

    struct Swap {
        address pool;
        address tokenIn;
        address tokenOut;
        uint    swapAmount; // tokenInAmount / tokenOutAmount
        uint    limitReturnAmount; // minAmountOut / maxAmountIn
        uint    maxPrice;
    }

    struct SwapDirect {
        address pool;
        uint    tokenInParam; // tokenInAmount / maxAmountIn / limitAmountIn
        uint    tokenOutParam; // minAmountOut / tokenAmountOut / limitAmountOut
        uint    maxPrice;
    }

    TokenInterface weth;
    address private constant ETH_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

    constructor(address _weth) public {
        weth = TokenInterface(_weth);
    }

    function add(uint a, uint b) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, "ERR_ADD_OVERFLOW");
        return c;
    }

    function batchSwapExactIn(
        SwapDirect[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut
    )
        public
        returns (uint totalAmountOut)
    {
        TokenInterface TI = TokenInterface(tokenIn);
        TokenInterface TO = TokenInterface(tokenOut);
        require(TI.transferFrom(msg.sender, address(this), totalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];

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
            totalAmountOut = add(tokenAmountOut, totalAmountOut);
        }
        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");
        require(TO.transfer(msg.sender, TO.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        require(TI.transfer(msg.sender, TI.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        return totalAmountOut;
    }

    function batchSwapExactOut(
        SwapDirect[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint maxTotalAmountIn
    )
        public
        returns (uint totalAmountIn)
    {
        TokenInterface TI = TokenInterface(tokenIn);
        TokenInterface TO = TokenInterface(tokenOut);
        require(TI.transferFrom(msg.sender, address(this), maxTotalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];
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
            totalAmountIn = add(tokenAmountIn, totalAmountIn);
        }
        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");
        require(TO.transfer(msg.sender, TO.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        require(TI.transfer(msg.sender, TI.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        return totalAmountIn;
    }

    function batchEthInSwapExactIn(
    SwapDirect[] memory swaps,
    address tokenOut,
    uint minTotalAmountOut
    )
        public payable
        returns (uint totalAmountOut)
    {
        TokenInterface TO = TokenInterface(tokenOut);
        weth.deposit.value(msg.value)();
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];
            PoolInterface pool = PoolInterface(swap.pool);
            if (weth.allowance(address(this), swap.pool) < msg.value) {
                weth.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountOut,) = pool.swapExactAmountIn(
                                        address(weth),
                                        swap.tokenInParam,
                                        tokenOut,
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );
            totalAmountOut = add(tokenAmountOut, totalAmountOut);
        }
        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");
        require(TO.transfer(msg.sender, TO.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        uint wethBalance = weth.balanceOf(address(this));
        if (wethBalance > 0) {
            weth.withdraw(wethBalance);
            (bool xfer,) = msg.sender.call.value(wethBalance)("");
            require(xfer, "ERR_ETH_FAILED");
        }
        return totalAmountOut;
    }

    function batchEthOutSwapExactIn(
        SwapDirect[] memory swaps,
        address tokenIn,
        uint totalAmountIn,
        uint minTotalAmountOut
    )
        public
        returns (uint totalAmountOut)
    {
        TokenInterface TI = TokenInterface(tokenIn);
        require(TI.transferFrom(msg.sender, address(this), totalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];
            PoolInterface pool = PoolInterface(swap.pool);
            if (TI.allowance(address(this), swap.pool) < totalAmountIn) {
                TI.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountOut,) = pool.swapExactAmountIn(
                                        tokenIn,
                                        swap.tokenInParam,
                                        address(weth),
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );

            totalAmountOut = add(tokenAmountOut, totalAmountOut);
        }
        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");
        uint wethBalance = weth.balanceOf(address(this));
        weth.withdraw(wethBalance);
        (bool xfer,) = msg.sender.call.value(wethBalance)("");
        require(xfer, "ERR_ETH_FAILED");
        require(TI.transfer(msg.sender, TI.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        return totalAmountOut;
    }

    function batchEthInSwapExactOut(
        SwapDirect[] memory swaps,
        address tokenOut
    )
        public payable
        returns (uint totalAmountIn)
    {
        TokenInterface TO = TokenInterface(tokenOut);
        weth.deposit.value(msg.value)();
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];
            PoolInterface pool = PoolInterface(swap.pool);
            if (weth.allowance(address(this), swap.pool) < msg.value) {
                weth.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountIn,) = pool.swapExactAmountOut(
                                        address(weth),
                                        swap.tokenInParam,
                                        tokenOut,
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );

            totalAmountIn = add(tokenAmountIn, totalAmountIn);
        }
        require(TO.transfer(msg.sender, TO.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        uint wethBalance = weth.balanceOf(address(this));
        if (wethBalance > 0) {
            weth.withdraw(wethBalance);
            (bool xfer,) = msg.sender.call.value(wethBalance)("");
            require(xfer, "ERR_ETH_FAILED");
        }
        return totalAmountIn;
    }

    function batchEthOutSwapExactOut(
        SwapDirect[] memory swaps,
        address tokenIn,
        uint maxTotalAmountIn
    )
        public
        returns (uint totalAmountIn)
    {
        TokenInterface TI = TokenInterface(tokenIn);
        require(TI.transferFrom(msg.sender, address(this), maxTotalAmountIn), "ERR_TRANSFER_FAILED");
        for (uint i = 0; i < swaps.length; i++) {
            SwapDirect memory swap = swaps[i];
            PoolInterface pool = PoolInterface(swap.pool);
            if (TI.allowance(address(this), swap.pool) < maxTotalAmountIn) {
                TI.approve(swap.pool, uint(-1));
            }
            (uint tokenAmountIn,) = pool.swapExactAmountOut(
                                        tokenIn,
                                        swap.tokenInParam,
                                        address(weth),
                                        swap.tokenOutParam,
                                        swap.maxPrice
                                    );

            totalAmountIn = add(tokenAmountIn, totalAmountIn);
        }
        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");
        require(TI.transfer(msg.sender, TI.balanceOf(address(this))), "ERR_TRANSFER_FAILED");
        uint wethBalance = weth.balanceOf(address(this));
        weth.withdraw(wethBalance);
        (bool xfer,) = msg.sender.call.value(wethBalance)("");
        require(xfer, "ERR_ETH_FAILED");
        return totalAmountIn;
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
            totalAmountOut = add(tokenAmountOut, totalAmountOut);
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
            totalAmountIn = add(tokenAmountInFirstSwap, totalAmountIn);
        }

        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));

    }

    function smartSwapExactIn(
        address sorAddress,
        address tokenIn,
        address tokenOut,
        uint totalAmountIn,
        uint nPools
    )
        public payable
        returns (uint totalAmountOut)
    {
        TokenInterface swapTokenIn = TokenInterface(tokenIn);
        TokenInterface swapTokenOut = TokenInterface(tokenOut);

        SmartOrderRouterInterface sor = SmartOrderRouterInterface(sorAddress);

        SmartOrderRouterInterface.Swap[] memory swaps;
        uint minTotalAmountOut;

        // SOR doesn't currently support ETH/WETH directly
        if (isETH(swapTokenIn)) {
          (swaps, minTotalAmountOut) = sor.viewSplit(true, address(weth), tokenOut, totalAmountIn, nPools);
        } else if (isETH(swapTokenOut)){
          (swaps, minTotalAmountOut) = sor.viewSplit(true, tokenIn, address(weth), totalAmountIn, nPools);
        } else {
          (swaps, minTotalAmountOut) = sor.viewSplit(true, tokenIn, tokenOut, totalAmountIn, nPools);
        }

        // !!!!!!! not sure why I can't use directly as same structure?
        SwapDirect[] memory swapsLocal;
        swapsLocal = new SwapDirect[](swaps.length);
        for (uint i = 0; i < swaps.length; i++) {
          swapsLocal[i] = SwapDirect(swaps[i].pool, swaps[i].tokenInParam, swaps[i].tokenOutParam, swaps[i].maxPrice);
        }

        // !!!!!!! this might not be most efficient but reuses existing proxy code?
        if (isETH(swapTokenIn)) {
            totalAmountOut = batchEthInSwapExactIn(
                swapsLocal,
                tokenOut,
                minTotalAmountOut
            );
        } else if (isETH(swapTokenOut)){
            totalAmountOut = batchEthOutSwapExactIn(
                swapsLocal,
                tokenIn,
                totalAmountIn,
                minTotalAmountOut
            );
        } else{
            totalAmountOut = batchSwapExactIn(
                swapsLocal,
                tokenIn,
                tokenOut,
                totalAmountIn,
                minTotalAmountOut
            );
        }
    }

    function smartSwapExactOut(
        address sorAddress,
        address tokenIn,
        address tokenOut,
        uint totalAmountOut,
        uint nPools
    )
        public payable
        returns (uint totalAmountIn)
    {
        TokenInterface swapTokenIn = TokenInterface(tokenIn);
        TokenInterface swapTokenOut = TokenInterface(tokenOut);

        SmartOrderRouterInterface sor = SmartOrderRouterInterface(sorAddress);

        SmartOrderRouterInterface.Swap[] memory swaps;
        uint maxTotalAmountIn;

        // SOR doesn't currently support ETH/WETH directly
        if (isETH(swapTokenIn)) {
          (swaps, maxTotalAmountIn) = sor.viewSplit(false, address(weth), tokenOut, totalAmountOut, nPools);
        } else if (isETH(swapTokenOut)){
          (swaps, maxTotalAmountIn) = sor.viewSplit(false, tokenIn, address(weth), totalAmountOut, nPools);
        } else {
          (swaps, maxTotalAmountIn) = sor.viewSplit(false, tokenIn, tokenOut, totalAmountOut, nPools);
        }

        // !!!!!!! not sure why I can't use directly as same structure?
        SwapDirect[] memory swapsLocal;
        swapsLocal = new SwapDirect[](swaps.length);
        for (uint i = 0; i < swaps.length; i++) {
          swapsLocal[i] = SwapDirect(swaps[i].pool, swaps[i].tokenInParam, swaps[i].tokenOutParam, swaps[i].maxPrice);
        }

        // !!!!!!! this might not be most efficient but reuses existing proxy code?
        if (isETH(swapTokenIn)) {
            totalAmountIn = batchEthInSwapExactOut(
                swapsLocal,
                tokenOut
            );
        } else if (isETH(swapTokenOut)){
            totalAmountIn = batchEthOutSwapExactOut(
                swapsLocal,
                tokenIn,
                maxTotalAmountIn
            );
        } else{
            totalAmountIn = batchSwapExactOut(
                swapsLocal,
                tokenIn,
                tokenOut,
                maxTotalAmountIn
            );
        }
    }

    function() external payable {}
}
