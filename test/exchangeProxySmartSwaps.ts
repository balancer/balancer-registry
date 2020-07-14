import { assert } from 'chai';
import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";
const verbose = process.env.VERBOSE;

describe('ExchangeProxy Smart Swaps', function(){
    const toWei = utils.parseEther;
    const fromWei = utils.formatEther;
    const MAX = ethers.constants.MaxUint256;
    const errorDelta = 10 ** -8;

    let registry: any;
    let factory: any;
    let smartOrderRouter: any;
    let REGISTRY: any;
    let WETH: string;
    let MKR: string;
    let weth: any;
    let mkr: any;
    let proxy: any;
    let _POOLS: any[] =[];
    let _pools: any[] =[];
    let SOR: string;
    let PROXY: string;

    before(async () => {
        const BRegistry = await ethers.getContractFactory('BRegistry');
        const SmartOrderRouter = await ethers.getContractFactory('SmartOrderRouter');
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

        smartOrderRouter = await SmartOrderRouter.deploy(registry.address);
        await smartOrderRouter.deployed();
        SOR = smartOrderRouter.address;

        mkr = await TToken.deploy('Maker', 'MKR', 18);
        await mkr.deployed();
        MKR = mkr.address;

        let weth9 = await Weth9.deploy();
        await weth9.deployed();
        WETH = weth9.address;

        proxy = await ExchangeProxy.deploy(weth9.address);
        await proxy.deployed();
        PROXY = proxy.address;
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

    it('SimplifiedCalcSplit swapExactOut, input_amount = 100,000', async () => {
        // !!!!!!! getBestPoolsWithLimit should probably be used (also in Contract)
        let pools1 = await registry.getBestPoolsWithLimit(MKR, WETH, 10)
        let pools = await registry.getPoolsWithLimit(MKR, WETH, 0, 10)

        // _POOLS[0] has been correctly left out of new proposal since it would make up less than 10% of total liquidity
        // result = await smartOrderRouter.viewSimplifiedSplit(MKR, WETH, toWei('100000'),4); // Sell 100000 WETH for MKR
        let result = await smartOrderRouter.viewSplit(false, MKR, WETH, toWei('10000'), 4); // Sell 100000 WETH for MKR

        // result.swaps[0].tokenOutParam.toString() is Same as: result['swaps'][0][2]
        assert.equal(result.swaps[0].tokenOutParam.toString(), "3468122309551074410000");
        assert.equal(result.swaps[1].tokenOutParam.toString(), "2621532449955349570000");
        assert.equal(result.swaps[2].tokenOutParam.toString(), "2593903985887510830000");
        assert.equal(result.swaps[3].tokenOutParam.toString(), "1316441254606065190000");
        assert.equal(result.totalOutput.toString(), "104289193841332281129540");

        const totalAmountIn = toWei('10000');
        const numberPools = toWei('4');

        const totalAmountOut = await proxy.callStatic.smartSwapExactOut(
            SOR, MKR, WETH, totalAmountIn, numberPools
        );

        console.log(result.totalOutput.toString())
        console.log(totalAmountOut.toString())
    });

    it('SimplifiedCalcSplit swapExactIn, input_amount = 10,000', async () => {

        let pools1 = await registry.getBestPoolsWithLimit(MKR, WETH, 10)
        let pools = await registry.getPoolsWithLimit(MKR, WETH, 0, 10)

        // _POOLS[0] has been correctly left out of new proposal since it would make up less than 10% of total liquidity
        // result = await smartOrderRouter.viewSimplifiedSplit(MKR, WETH, toWei('100000'),4); // Sell 100000 WETH for MKR
        let result = await smartOrderRouter.viewSplit(true, MKR, WETH, toWei('10000'), 4); // Sell 100000 WETH for MKR
        assert.equal(result['swaps'][0][1].toString(),"3468122309551074410000");
        assert.equal(result['swaps'][1][1].toString(),"2621532449955349570000");
        assert.equal(result['swaps'][2][1].toString(),"2593903985887510830000");
        assert.equal(result['swaps'][3][1].toString(),"1316441254606065190000");

        const totalAmountIn = toWei('10000');
        const numberPools = toWei('4');

        const totalAmountOut = await proxy.callStatic.smartSwapExactIn(
            SOR, MKR, WETH, totalAmountIn, numberPools
        );
        console.log(result.totalOutput.toString())
        console.log(totalAmountOut.toString())
    });
});
