import { assert, expect } from 'chai';
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
    let admin: string;

    before(async () => {
        const BRegistry = await ethers.getContractFactory('BRegistry');
        const BFactory = await ethers.getContractFactory('BFactory');
        const BPool = await ethers.getContractFactory('BPool');
        const TToken = await ethers.getContractFactory('TToken');
        const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
        const Weth9 = await ethers.getContractFactory('WETH9');
        const [adminSigner] = await ethers.getSigners();
        admin = await adminSigner.getAddress();
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

    it('joinswapExternAmountIn, MKR In', async () => {
        const [, newUserSigner] = await ethers.getSigners();
        const newUserAddr = await newUserSigner.getAddress();
        const amountIn = toWei('1000');

        await mkr.connect(newUserSigner).approve(PROXY, MAX);
        await mkr.mint(newUserAddr, amountIn);

        const startingMkrBalance = await mkr.balanceOf(newUserAddr);
        const startingBptBalance = await _pools[1].balanceOf(newUserAddr);

        expect(startingBptBalance).to.equal(0);
        expect(startingMkrBalance).to.equal(amountIn);

        const poolAmountOut = await proxy.connect(newUserSigner).callStatic.joinswapExternAmountIn(
            _POOLS[1],
            MKR,
            amountIn,
            toWei('0')
        );

        expect(poolAmountOut.toString()).to.equal('81833525388142100');

        await proxy.connect(newUserSigner).joinswapExternAmountIn(
            _POOLS[1],
            MKR,
            amountIn,
            toWei('0')
        );

        const endingMkrBalance = await mkr.balanceOf(newUserAddr);
        const endingBptBalance = await _pools[1].balanceOf(newUserAddr);

        expect(endingMkrBalance).to.equal(0);
        expect(endingBptBalance).to.equal(poolAmountOut);
    });

    it('joinswapExternAmountIn, ETH In', async () => {
        const [, newUserSigner] = await ethers.getSigners();
        const newUserAddr = await newUserSigner.getAddress();
        const amountIn = toWei('1000');

        const startingEthBalance = await newUserSigner.getBalance();
        const startingBptBalance = await _pools[1].balanceOf(newUserAddr);

        const poolAmountOut = await proxy.connect(newUserSigner).callStatic.joinswapExternAmountIn(
            _POOLS[1],
            ETH,
            amountIn,
            toWei('0'),
            {
              value: amountIn
            }
        );

        let tx = await proxy.connect(newUserSigner).joinswapExternAmountIn(
            _POOLS[1],
            ETH,
            amountIn,
            toWei('0'),
            {
              gasPrice: 0,
              value: amountIn
            }
        );

        const endingEthBalance = await newUserSigner.getBalance();
        const endingBptBalance = await _pools[1].balanceOf(newUserAddr);

        expect(endingEthBalance).to.equal(startingEthBalance.sub(amountIn));
        expect(poolAmountOut).to.equal(endingBptBalance.sub(startingBptBalance));
    });

});
