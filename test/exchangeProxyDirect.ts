import { assert } from 'chai';
import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";
const Decimal = require('decimal.js');
const { calcOutGivenIn, calcInGivenOut, calcRelativeDiff } = require('./lib/calc_comparisons');
const errorDelta = 10 ** -8;
const verbose = process.env.VERBOSE;

describe('ExchangeProxy SmartSwaps', async () => {
        const toWei = utils.parseEther;
        const fromWei = utils.formatEther;
        const MAX = ethers.constants.MaxUint256;

        let factory: any;
        let proxy: any;
        let PROXY: string;
        let pool1: any;
        let pool2: any;
        let pool3: any;
        let POOL1: any;
        let POOL2: any;
        let POOL3: any;
        let weth: any;
        let dai: any;
        let mkr: any;
        let WETH: string;
        let DAI: string;
        let MKR: string;
        let ETH: string;
        let adminSigner: any;
        let nonAdminSigner: any;
        let admin: string;
        let nonAdmin: string;

        before(async () => {
            [adminSigner, nonAdminSigner] = await ethers.getSigners();
            admin = await adminSigner.getAddress();
            nonAdmin = await nonAdminSigner.getAddress();
            const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
            const SOR = await ethers.getContractFactory("SmartOrderRouter");
            const BFactory = await ethers.getContractFactory('BFactory');
            const BPool = await ethers.getContractFactory('BPool');
            const Weth9 = await ethers.getContractFactory('WETH9');
            const TToken = await ethers.getContractFactory("TToken");
            const TokenFactory = await ethers.getContractFactory("TToken");

            weth = await Weth9.deploy();
            dai = await TokenFactory.deploy('Dai Stablecoin', 'DAI', 18);
            mkr = await TokenFactory.deploy('Maker', 'MKR', 18);

            ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
            WETH = weth.address;
            DAI = dai.address;
            MKR = mkr.address;

            proxy = await ExchangeProxy.deploy(WETH);
            await proxy.deployed();
            PROXY = proxy.address;

            await weth.deposit({ value: toWei('25') });
            await dai.mint(admin, toWei('10000'));
            await mkr.mint(admin, toWei('20'));

            await weth.connect(nonAdminSigner).deposit({ from: nonAdmin, value: toWei('25') });
            await dai.mint(nonAdmin, toWei('10000'));
            await mkr.mint(nonAdmin, toWei('20'));

            factory = await BFactory.deploy();

            POOL1 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool1 = await ethers.getContractAt("BPool", POOL1);

            POOL2 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool2 = await ethers.getContractAt("BPool", POOL2);

            POOL3 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool3 = await ethers.getContractAt("BPool", POOL3);

            await weth.connect(nonAdminSigner).approve(PROXY, MAX, { from: nonAdmin });
            await dai.connect(nonAdminSigner).approve(PROXY, MAX, { from: nonAdmin });
            await mkr.connect(nonAdminSigner).approve(PROXY, MAX, { from: nonAdmin });

            await weth.approve(POOL1, MAX);
            await dai.approve(POOL1, MAX);
            await mkr.approve(POOL1, MAX);

            await weth.approve(POOL2, MAX);
            await dai.approve(POOL2, MAX);
            await mkr.approve(POOL2, MAX);

            await weth.approve(POOL3, MAX);
            await dai.approve(POOL3, MAX);
            await mkr.approve(POOL3, MAX);

            await pool1.bind(WETH, toWei('6'), toWei('5'));
            await pool1.bind(DAI, toWei('1200'), toWei('5'));
            await pool1.bind(MKR, toWei('2'), toWei('5'));
            await pool1.finalize();

            await pool2.bind(WETH, toWei('2'), toWei('10'));
            await pool2.bind(DAI, toWei('800'), toWei('20'));
            await pool2.finalize();

            await pool3.bind(WETH, toWei('15'), toWei('5'));
            await pool3.bind(DAI, toWei('2500'), toWei('5'));
            await pool3.bind(MKR, toWei('5'), toWei('5'));
            await pool3.finalize();
        });

        it('batchSwapExactIn dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('0.5'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('0.5'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('1'),
                    toWei('0'),
                    MAX,
                ],
            ];
            const swapFee = fromWei(await pool1.getSwapFee());

            const totalAmountIn = toWei('2');
            const numberPools = toWei('4');

            const totalAmountOut = await proxy.connect(nonAdminSigner).callStatic.batchSwapExactIn(
                swaps, WETH, DAI, totalAmountIn, numberPools,
                { from: nonAdmin }
            );

            const pool1Out = calcOutGivenIn(6, 5, 1200, 5, 0.5, swapFee);
            const pool2Out = calcOutGivenIn(2, 10, 800, 20, 0.5, swapFee);
            const pool3Out = calcOutGivenIn(15, 5, 2500, 5, 1, swapFee);

            const expectedTotalOut = pool1Out.plus(pool2Out).plus(pool3Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));

            if (verbose) {
                console.log('batchSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });

        it('batchSwapExactOut dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('1'),
                    toWei('100'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('1'),
                    toWei('100'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('5'),
                    toWei('500'),
                    MAX,
                ],
            ];

            const swapFee = fromWei(await pool1.getSwapFee());
            const totalAmountIn = await proxy.connect(nonAdminSigner).callStatic.batchSwapExactOut(
                swaps, WETH, DAI, toWei('7'),
                { from: nonAdmin },
            );

            const pool1In = calcInGivenOut(6, 5, 1200, 5, 100, swapFee);
            const pool2In = calcInGivenOut(2, 10, 800, 20, 100, swapFee);
            const pool3In = calcInGivenOut(15, 5, 2500, 5, 500, swapFee);

            const expectedTotalIn = pool1In.plus(pool2In).plus(pool3In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });

        it('batchEthInSwapExactIn dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('0.5'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('0.5'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('1'),
                    toWei('0'),
                    MAX,
                ],
            ];

            const swapFee = fromWei(await pool1.getSwapFee());
            const totalAmountOut = await proxy.connect(nonAdminSigner).callStatic.batchEthInSwapExactIn(
                swaps, DAI, toWei('0'),
                { from: nonAdmin, value: toWei('2') },
            );

            const pool1Out = calcOutGivenIn(6, 5, 1200, 5, 0.5, swapFee);
            const pool2Out = calcOutGivenIn(2, 10, 800, 20, 0.5, swapFee);
            const pool3Out = calcOutGivenIn(15, 5, 2500, 5, 1, swapFee);

            const expectedTotalOut = pool1Out.plus(pool2Out).plus(pool3Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));
            if (verbose) {
                console.log('batchEthInSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });

        it('batchEthOutSwapExactIn dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('30'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('45'),
                    toWei('0'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('75'),
                    toWei('0'),
                    MAX,
                ],
            ];

            const swapFee = fromWei(await pool1.getSwapFee());
            const totalAmountOut = await proxy.connect(nonAdminSigner).callStatic.batchEthOutSwapExactIn(
                swaps, DAI, toWei('150'), toWei('0.5'),
                { from: nonAdmin },
            );

            const pool1Out = calcOutGivenIn(1200, 5, 6, 5, 30, swapFee);
            const pool2Out = calcOutGivenIn(800, 20, 2, 10, 45, swapFee);
            const pool3Out = calcOutGivenIn(2500, 5, 15, 5, 75, swapFee);

            const expectedTotalOut = pool1Out.plus(pool2Out).plus(pool3Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));
            if (verbose) {
                console.log('batchEthOutSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });

        it('batchEthInSwapExactOut dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('1'),
                    toWei('100'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('1'),
                    toWei('100'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('5'),
                    toWei('500'),
                    MAX,
                ],
            ];

            const swapFee = fromWei(await pool1.getSwapFee());
            const totalAmountIn = await proxy.connect(nonAdminSigner).callStatic.batchEthInSwapExactOut(
                swaps, DAI,
                { from: nonAdmin, value: toWei('7.5') },
            );

            const pool1In = calcInGivenOut(6, 5, 1200, 5, 100, swapFee);
            const pool2In = calcInGivenOut(2, 10, 800, 20, 100, swapFee);
            const pool3In = calcInGivenOut(15, 5, 2500, 5, 500, swapFee);

            const expectedTotalIn = pool1In.plus(pool2In).plus(pool3In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchEthInSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });

        it('batchEthOutSwapExactOut dry', async () => {
            const swaps = [
                [
                    POOL1,
                    toWei('150'),
                    toWei('0.5'),
                    MAX,
                ],
                [
                    POOL2,
                    toWei('150'),
                    toWei('0.5'),
                    MAX,
                ],
                [
                    POOL3,
                    toWei('550'),
                    toWei('2.5'),
                    MAX,
                ],
            ];

            const swapFee = fromWei(await pool1.getSwapFee());
            const totalAmountIn = await proxy.connect(nonAdminSigner).callStatic.batchEthOutSwapExactOut(
                swaps, DAI, toWei('750'),
                { from: nonAdmin },
            );

            const pool1In = calcInGivenOut(1200, 5, 6, 5, 0.5, swapFee);
            const pool2In = calcInGivenOut(800, 20, 2, 10, 0.5, swapFee);
            const pool3In = calcInGivenOut(2500, 5, 15, 5, 2.5, swapFee);

            const expectedTotalIn = pool1In.plus(pool2In).plus(pool3In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchEthOutSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swaps.length));
        });
});
