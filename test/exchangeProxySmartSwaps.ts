import { assert } from 'chai';
import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";
const verbose = process.env.VERBOSE;
const Decimal = require('decimal.js');
const { calcRelativeDiff } = require('./lib/calc_comparisons');
const errorDelta = 10 ** -8;

describe('ExchangeProxy Smart Swaps', function(){
    const toWei = utils.parseEther;
    const fromWei = utils.formatEther;
    const MAX = ethers.constants.MaxUint256;
    const errorDelta = 10 ** -8;

    let registry: any;
    let factory: any;
    let REGISTRY: any;
    let WETH: string;
    let MKR: string;
    let ETH: string = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    let weth: any;
    let mkr: any;
    let proxy: any;
    let _POOLS: any[] =[];
    let _pools: any[] =[];
    let PROXY: string;

    before(async () => {
        const BRegistry = await ethers.getContractFactory('BRegistry');
        const BFactory = await ethers.getContractFactory('BFactory');
        const BPool = await ethers.getContractFactory('BPool');
        const TToken = await ethers.getContractFactory('TToken');
        const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
        const Weth9 = await ethers.getContractFactory('WETH9');
        const [adminSigner] = await ethers.getSigners();
        const admin = await adminSigner.getAddress();
        factory = await BFactory.deploy();
        await factory.deployed();

        registry = await BRegistry.deploy(factory.address);
        await registry.deployed();

        mkr = await TToken.deploy('Maker', 'MKR', 18);
        await mkr.deployed();
        MKR = mkr.address;

        let weth9 = await Weth9.deploy();
        await weth9.deployed();
        WETH = weth9.address;

        proxy = await ExchangeProxy.deploy(WETH);
        await proxy.deployed();
        PROXY = proxy.address;
        await proxy.setRegistry(registry.address);
        await weth9.approve(PROXY, MAX);
        await mkr.approve(PROXY, MAX);

        // Admin balances
        await weth9.deposit({ value: toWei('10000000000') });

        await mkr.mint(admin,  toWei('1000000000000000000000'));

        // Copy pools printed by https://github.com/balancer-labs/python-SOR/blob/master/Onchain_SOR_test_comparison.py
        // For the following inputs:
        // num_pools = 5 # Number of pools available for this pair
        // max_n_pools = 4
        // swap_type = "swapExactOut"
        // input_amount = 100000 # Number of tokens in the trader wants to sell
        // output_token_eth_price = 0 # One output token buys 0.01 eth
        // seed = 1
        let poolsData = [
            {   'Bmkr': 1033191.1981189704,
                'Bweth': 21709.92411864851,
                'Wmkr': 8.261291241849618,
                'Wweth': 1.7387087581503824,
                'fee': 0.015},
            {   'Bmkr': 911870.2026231368,
                'Bweth': 30347.518852549234,
                'Wmkr': 7.509918308978633,
                'Wweth': 2.4900816910213672,
                'fee': 0.025},
            {   'Bmkr': 1199954.250073062,
                'Bweth': 72017.58337846321,
                'Wmkr': 6.235514183655618,
                'Wweth': 3.764485816344382,
                'fee': 0.01},
            {   'Bmkr': 1079066.970947264,
                'Bweth': 77902.62602094973,
                'Wmkr': 5.8258602061546405,
                'Wweth': 4.1741397938453595,
                'fee': 0.01},
            {   'Bmkr': 1141297.6436731548,
                'Bweth': 128034.7686206643,
                'Wmkr': 4.689466127973144,
                'Wweth': 5.310533872026856,
                'fee': 0.005}
        ]

        for (var i = 0; i < poolsData.length; i++) {
            let poolAddr = await factory.callStatic.newBPool();
            _POOLS.push(poolAddr);
            await factory.newBPool();
            let poolContract = await ethers.getContractAt("BPool", poolAddr);
            _pools.push(poolContract);

            await weth9.approve(_POOLS[i], MAX);
            await mkr.approve(_POOLS[i], MAX);

            await _pools[i].bind(WETH, toWei(poolsData[i]['Bweth'].toString()), toWei(poolsData[i]['Wweth'].toString()));
            await _pools[i].bind(MKR, toWei(poolsData[i]['Bmkr'].toString()), toWei(poolsData[i]['Wmkr'].toString()));
            await _pools[i].setSwapFee(toWei(poolsData[i]['fee'].toString()));

            await _pools[i].finalize();
            /*
            console.log("Pool "+i.toString()+": "+_POOLS[i]+", Liquidity WETH-MKR: "+
                await registry.getNormalizedLiquidity.call(MKR, WETH, _POOLS[i]))
            */
        }

        // Proposing registry. NOTICE _POOLS[0] has been left out since it would make up less than 10% of total liquidity
        await registry.addPools([_POOLS[1], _POOLS[2], _POOLS[3], _POOLS[4]], MKR, WETH);
        await registry.sortPools([MKR, WETH], 10);
    });

    it('swapExactIn, MKR->WETH, input_amount = 10000', async () => {
        const totalAmountIn = toWei('10000');
        const numberPools = toWei('4');
        let swaps: any;
        let totalOutput;
        [swaps, totalOutput] = await proxy.viewSplitExactIn(MKR, WETH, totalAmountIn, numberPools);

        assert.equal(swaps.length, 4);
        /*
        assert.equal(swaps[0].swapAmount.toString(), "4185393607802335550000");
        assert.equal(swaps[1].swapAmount.toString(), "2124143700789415150000");
        assert.equal(swaps[2].swapAmount.toString(), "2101757242093019490000");
        assert.equal(swaps[3].swapAmount.toString(), "1588705449315229800000");
        */

        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })

        const relDif = calcRelativeDiff(Decimal(totalAmountIn.toString()), totalCheck);
        if (verbose) {
            console.log(`expected: ${totalAmountIn.toString()})`);
            console.log(`actual  : ${totalCheck.toString()})`);
            console.log(`relDif  : ${relDif})`);
        }

        assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));

        const totalAmountOut = await proxy.callStatic.smartSwapExactIn(
            MKR, WETH, totalAmountIn, 0, numberPools
        );

        assert.equal(totalOutput.toString(), totalAmountOut.toString());
    });

    it('swapExactIn, ETH->MKR, input_amount = 10', async () => {
        const totalAmountIn = toWei('10');
        const numberPools = toWei('4');
        let swaps: any;
        let totalOutput;
        [swaps, totalOutput] = await proxy.viewSplitExactIn(WETH, MKR, totalAmountIn, numberPools);
        /*
        assert.equal(swaps[0].swapAmount.toString(), "4199183886767423200");
        assert.equal(swaps[1].swapAmount.toString(), "2110771196960414460");
        assert.equal(swaps[2].swapAmount.toString(), "2116879433527427990");
        assert.equal(swaps[3].swapAmount.toString(), "1573165482744734360");
        assert.equal(totalOutput.toString(), "98405266835517850927");
        */

        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })

        const relDif = calcRelativeDiff(Decimal(totalAmountIn.toString()), totalCheck);
        if (verbose) {
            console.log(`expected: ${totalAmountIn.toString()})`);
            console.log(`actual  : ${totalCheck.toString()})`);
            console.log(`relDif  : ${relDif})`);
        }

        assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));

        const totalAmountOut = await proxy.callStatic.smartSwapExactIn(
            ETH, MKR, totalAmountIn, 0, numberPools,
            {
              value: totalAmountIn
            }
        );

        assert.equal(totalOutput.toString(), totalAmountOut.toString());
    });

    it('swapExactIn, MKR->ETH, input_amount = 77.77', async () => {
        const totalAmountIn = toWei('77.77');
        const numberPools = toWei('4');
        let swaps: any;
        let totalOutput;
        [swaps, totalOutput] = await proxy.viewSplitExactIn(MKR, WETH, totalAmountIn, numberPools);
        /*
        assert.equal(result.swaps[0].tokenInParam.toString(), "26971587201378705686");
        assert.equal(result.swaps[1].tokenInParam.toString(), "20387657863302753606");
        assert.equal(result.swaps[2].tokenInParam.toString(), "20172791298247171725");
        assert.equal(result.swaps[3].tokenInParam.toString(), "10237963637071368983");
        assert.equal(result.totalOutput.toString(), "7679415326946795121");
        */

        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })

        console.log(`totalCheck ${totalCheck}`)

        assert(Decimal(totalAmountIn.toString()).eq(totalCheck));

        const totalAmountOut = await proxy.callStatic.smartSwapExactIn(
            MKR, ETH, totalAmountIn, 0, numberPools
        );

        assert.equal(totalOutput.toString(), totalAmountOut.toString());
    });

    it('swapExactOut, MKR->WETH, output_amount = 10000', async () => {
        const totalAmountOut = toWei('10000');
        const numberPools = toWei('4');

        let swaps: any;
        let totalInput;
        [swaps, totalInput] = await proxy.viewSplitExactOut(MKR, WETH, totalAmountOut, numberPools);

        // result.swaps[0].tokenOutParam.toString() is Same as: result['swaps'][0][2]
        /*
        assert.equal(result.swaps[0].tokenOutParam.toString(), "3468122309551074410000");
        assert.equal(result.swaps[1].tokenOutParam.toString(), "2621532449955349570000");
        assert.equal(result.swaps[2].tokenOutParam.toString(), "2593903985887510830000");
        assert.equal(result.swaps[3].tokenOutParam.toString(), "1316441254606065190000");
        assert.equal(result.totalOutput.toString(), "104289193841332281129540");
        */
        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })
        assert(Decimal(totalAmountOut.toString()).eq(totalCheck));

        const totalIn = await proxy.callStatic.smartSwapExactOut(
            MKR, WETH, totalAmountOut, totalInput, numberPools
        );

        assert.equal(totalInput.toString(), totalIn.toString());
    });

    it('swapExactOut, ETH->MKR, output_amount = 354', async () => {
        const totalAmountOut = toWei('354');
        const numberPools = toWei('4');

        let swaps: any;
        let totalInput;
        [swaps, totalInput] = await proxy.viewSplitExactOut(WETH, MKR, totalAmountOut, numberPools);

        // result.swaps[0].tokenOutParam.toString() is Same as: result['swaps'][0][2]
        /*
        assert.equal(result.swaps[0].tokenOutParam.toString(), "123642519316419239514");
        assert.equal(result.swaps[1].tokenOutParam.toString(), "92151221254246474152");
        assert.equal(result.swaps[2].tokenOutParam.toString(), "91885319734091311206");
        assert.equal(result.swaps[3].tokenOutParam.toString(), "46320939695242975128");
        assert.equal(result.totalOutput.toString(), "35687772808297263273");
        */

        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            // console.log(swap.tokenOutParam.toString())
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })
        console.log(`totalCheck ${totalCheck}`)
        assert(Decimal(totalAmountOut.toString()).eq(totalCheck));

        const totalIn = await proxy.callStatic.smartSwapExactOut(
            ETH, MKR, totalAmountOut, totalInput, numberPools,
            {
              value: totalInput
            }
        );

        assert.equal(totalInput.toString(), totalIn.toString());
    });

    it('swapExactOut, MKR->ETH, output_amount = 584', async () => {
        const totalAmountOut = toWei('584');
        const numberPools = toWei('4');

        let swaps: any;
        let totalInput;
        [swaps, totalInput] = await proxy.viewSplitExactOut(MKR, WETH, totalAmountOut, numberPools);

        // result.swaps[0].tokenOutParam.toString() is Same as: result['swaps'][0][2]
        /*
        assert.equal(result.swaps[0].tokenOutParam.toString(), "202538342877782745544");
        assert.equal(result.swaps[1].tokenOutParam.toString(), "153097495077392414888");
        assert.equal(result.swaps[2].tokenOutParam.toString(), "151483992775830632472");
        assert.equal(result.swaps[3].tokenOutParam.toString(), "76880169268994207096");
        assert.equal(result.totalOutput.toString(), "5924319155850574968070");
        */
        let totalCheck = Decimal(0);
        swaps.forEach((swap: any) => {
            // console.log(swap.tokenOutParam.toString())
            totalCheck = totalCheck.plus(Decimal(swap.swapAmount.toString()));
        })

        assert(Decimal(totalAmountOut.toString()).eq(totalCheck));

        const totalIn = await proxy.callStatic.smartSwapExactOut(
            MKR, ETH, totalAmountOut, totalInput, numberPools
        );

        assert.equal(totalInput.toString(), totalIn.toString());
    });

});
