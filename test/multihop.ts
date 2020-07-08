import { assert } from 'chai';
import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";
const Decimal = require('decimal.js');
const { calcOutGivenIn, calcInGivenOut, calcRelativeDiff } = require('./lib/calc_comparisons');
const errorDelta = 10 ** -8;
const verbose = process.env.VERBOSE;

describe('ExchangeProxy', async () => {
    const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
    const TTokenFactory = await ethers.getContractFactory('TToken');
    const BFactory = await ethers.getContractFactory('BFactory');
    const BPool = await ethers.getContractFactory('BPool');
    const Weth9 = await ethers.getContractFactory('WETH9');

    const [admin, nonAdmin] = await ethers.getSigners();
    const toWei = utils.parseEther;
    const fromWei = utils.formatEther;
    const MAX = ethers.constants.MaxUint256;

    describe('Multihop Swaps', () => {
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

        before(async () => {

            //weth = await Weth9.deployed();

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
            await dai.mint(await admin.getAddress(), toWei('10000'));
            await mkr.mint(await admin.getAddress(), toWei('20'));

            await weth.connect(nonAdmin).deposit({ from: await nonAdmin.getAddress(), value: toWei('25') });
            await dai.mint(await nonAdmin.getAddress(), toWei('10000'));
            await mkr.mint(await nonAdmin.getAddress(), toWei('20'));

            factory = await BFactory.deploy();

            POOL1 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool1 = await ethers.getContractAt("BPool", POOL1)

            POOL2 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool2 = await ethers.getContractAt("BPool", POOL2)

            POOL3 = await factory.callStatic.newBPool();
            await factory.newBPool();
            pool3 = await ethers.getContractAt("BPool", POOL3)

            await dai.connect(nonAdmin).approve(PROXY, MAX, { from: await nonAdmin.getAddress() });
            await mkr.connect(nonAdmin).approve(PROXY, MAX, { from: await nonAdmin.getAddress() });
            await weth.connect(nonAdmin).approve(PROXY, MAX, { from: await nonAdmin.getAddress() });

            await dai.approve(PROXY, MAX);
            await mkr.approve(PROXY, MAX);
            await weth.approve(PROXY, MAX);

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
            await pool1.finalize();

            await pool2.bind(WETH, toWei('1'), toWei('10'));
            await pool2.bind(MKR, toWei('2'), toWei('20'));
            await pool2.finalize();

            await pool3.bind(DAI, toWei('1000'), toWei('5'));
            await pool3.bind(MKR, toWei('5'), toWei('5'));
            await pool3.finalize();
        });

        it('multihopBatchSwapExactIn dry', async () => {

            const swapFee = fromWei(await pool1.getSwapFee());
            const pool1Out = calcOutGivenIn(6, 5, 1200, 5, 0.5, swapFee); // WETH -> DAI
            const pool2Out = calcOutGivenIn(1, 10, 2, 20, 0.5, swapFee); // WETH -> MKR
            const pool3Out = calcOutGivenIn(5, 5, 1000, 5, pool2Out, swapFee); // MKR -> DAI

            // 2 sequences: [[WETH -> DAI]] and [[WETH -> MKR], [MKR -> DAI]]
            const swapSequences = [
                [
                    [
                        POOL1,
                        WETH,
                        DAI,
                        toWei('0.5'),
                        toWei('0'),
                        MAX,
                    ],
                ],
                [
                    [
                        POOL2,
                        WETH,
                        MKR,
                        toWei('0.5'),
                        toWei('0'),
                        MAX,
                    ],
                    [
                        POOL3,
                        MKR,
                        DAI,
                        //toWei(pool2Out.toString()), // This conversion to string is bugged, so using hardcoded line below
                        //toWei('0.36700656597895291'),
                        toWei('0'), // This number should not influence the result
                        toWei('0'),
                        MAX,
                    ],
                ],
            ];

            // console.log(swapSequences);

            const totalAmountOut = await proxy.callStatic.multihopBatchSwapExactIn(
                swapSequences, WETH, DAI, toWei('1'), toWei('0')
            );

            console.log(totalAmountOut.toString());

            const expectedTotalOut = pool1Out.plus(pool3Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));

            if (verbose) {
                console.log('batchSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));
        });

        it('multihopBatchSwapExactOut dry', async () => {
            const swapFee = fromWei(await pool1.getSwapFee());

            const pool1In = calcInGivenOut(6, 5, 1200, 5, 100, swapFee); // WETH -> DAI
            const pool3In = calcInGivenOut(5, 5, 1000, 5, 100, swapFee); // MKR -> DAI
            const pool2In = calcInGivenOut(1, 10, 2, 20, pool3In, swapFee); // WETH -> MKR

            // 2 sequences: [[WETH -> DAI]] and [[WETH -> MKR], [MKR -> DAI]]
            const swapSequences = [
                [
                    [
                        POOL1,
                        WETH,
                        DAI,
                        toWei('100'),
                        MAX,
                        MAX,
                    ],
                ],
                [
                    [
                        POOL2,
                        WETH,
                        MKR,
                        // toWei(pool3In.toString()), // This conversion to string is bugged, so using hardcoded line below
                        //toWei('0.55555611111166667'), // Rounded up in last decimal, from 0.55555611111166666717
                        toWei('0'), // This number should not influence the result
                        MAX,
                        MAX,
                    ],
                    [
                        POOL3,
                        MKR,
                        DAI,
                        toWei('100'),
                        MAX,
                        MAX,
                    ],
                ],
            ];

            const totalAmountIn = await proxy.callStatic.multihopBatchSwapExactOut(
                swapSequences, WETH, DAI, toWei('3')
            );

            // console.log(totalAmountIn.toString());

            const expectedTotalIn = pool1In.plus(pool2In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));
        });

        it('multihopBatchEthInSwapExactIn dry', async () => {
            const swapFee = fromWei(await pool1.getSwapFee());
            const pool1Out = calcOutGivenIn(6, 5, 1200, 5, 0.5, swapFee); // WETH -> DAI
            const pool2Out = calcOutGivenIn(1, 10, 2, 20, 0.5, swapFee); // WETH -> MKR
            const pool3Out = calcOutGivenIn(5, 5, 1000, 5, pool2Out, swapFee); // MKR -> DAI

            // 2 sequences: [[WETH -> DAI]] and [[WETH -> MKR], [MKR -> DAI]]
            const swapSequences = [
                [
                    [
                        POOL1,
                        WETH,
                        DAI,
                        toWei('0.5'),
                        toWei('0'),
                        MAX,
                    ],
                ],
                [
                    [
                        POOL2,
                        WETH,
                        MKR,
                        toWei('0.5'),
                        toWei('0'),
                        MAX,
                    ],
                    [
                        POOL3,
                        MKR,
                        DAI,
                        //toWei(pool2Out.toString()), // This conversion to string is bugged, so using hardcoded line below
                        // toWei('0.36700656597895291'),
                        toWei('0'), // This number should not influence the result
                        toWei('0'),
                        MAX,
                    ],
                ],
            ];

            // console.log(swapSequences);

            const totalAmountOut = await proxy.callStatic.multihopBatchSwapExactIn(
                swapSequences, ETH, DAI, toWei('2'), toWei('0'),
                {
                  gasPrice: 0,
                  value: toWei('2')
                }
            );

            console.log(totalAmountOut.toString());

            const expectedTotalOut = pool1Out.plus(pool3Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));

            if (verbose) {
                console.log('batchSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));
        });

        it('multihopBatchEthOutSwapExactIn dry', async () => {
            const swapFee = fromWei(await pool1.getSwapFee());

            const pool1Out = calcOutGivenIn(1200, 5, 6, 5, 50, swapFee); // DAI -> WETH
            const pool3Out = calcOutGivenIn(1000, 5, 5, 5, 50, swapFee); // DAI -> MKR
            const pool2Out = calcOutGivenIn(2, 20, 1, 10, pool3Out, swapFee); // MKR -> WETH

            const swapSequences = [
                [
                    [
                        POOL1,
                        DAI,
                        WETH,
                        toWei('50'),
                        toWei('0'),
                        MAX,
                    ],
                ],
                [
                    [
                        POOL3,
                        DAI,
                        MKR,
                        toWei('50'),
                        toWei('0'),
                        MAX,
                    ],
                    [
                        POOL2,
                        MKR,
                        WETH,
                        // toWei(pool2Out.toString()), // Error: [ethjs-unit] while converting number 0.23809501133785768275 to wei, too many decimal places
                        // toWei('0.2380950113379'),
                        toWei('0'), // This number should not influence the result
                        toWei('0'),
                        MAX,
                    ],
                ],
            ];

            // console.log(swapSequences);

            const totalAmountOut = await proxy.connect(nonAdmin).callStatic.multihopBatchSwapExactIn(
                swapSequences, DAI, ETH, toWei('100'), toWei('0.1'),
                { from: await nonAdmin.getAddress() },
            );

            // console.log(totalAmountOut.toString());

            const expectedTotalOut = pool1Out.plus(pool2Out);

            const relDif = calcRelativeDiff(expectedTotalOut, Decimal(fromWei(totalAmountOut)));

            if (verbose) {
                console.log('batchSwapExactIn');
                console.log(`expected: ${expectedTotalOut})`);
                console.log(`actual  : ${fromWei(totalAmountOut)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));
        });

        it('multihopBatchEthInSwapExactOut dry', async () => {
            const swapFee = fromWei(await pool1.getSwapFee());

            const pool1In = calcInGivenOut(6, 5, 1200, 5, 100, swapFee); // WETH -> DAI
            const pool3In = calcInGivenOut(5, 5, 1000, 5, 100, swapFee); // MKR -> DAI
            const pool2In = calcInGivenOut(1, 10, 2, 20, pool3In, swapFee); // WETH -> MKR

            // 2 sequences: [[WETH -> DAI]] and [[WETH -> MKR], [MKR -> DAI]]
            const swapSequences = [
                [
                    [
                        POOL1,
                        WETH,
                        DAI,
                        toWei('100'),
                        MAX,
                        MAX,
                    ],
                ],
                [
                    [
                        POOL2,
                        WETH,
                        MKR,
                        // toWei(pool3In.toString()), // This conversion to string is bugged, so using hardcoded line below
                        // toWei('0.55555611111166667'), // Rounded up in last decimal, from 0.55555611111166666717
                        toWei('0'), // This number should not influence the result
                        MAX,
                        MAX,
                    ],
                    [
                        POOL3,
                        MKR,
                        DAI,
                        toWei('100'),
                        MAX,
                        MAX,
                    ],
                ],
            ];

            const totalAmountIn = await proxy.connect(nonAdmin).callStatic.multihopBatchSwapExactOut(
                swapSequences, ETH, DAI, toWei('3'),
                { from: await nonAdmin.getAddress(), value: toWei('3') },
            );

            // console.log(totalAmountIn.toString());

            const expectedTotalIn = pool1In.plus(pool2In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));

        });


        it('multihopBatchEthOutSwapExactOut dry', async () => {
            const swapFee = fromWei(await pool1.getSwapFee());

            const pool1In = calcInGivenOut(1200, 5, 6, 5, 0.1, swapFee); // DAI -> WETH
            const pool2In = calcInGivenOut(2, 20, 1, 10, 0.1, swapFee); // MKR -> WETH
            const pool3In = calcInGivenOut(1000, 5, 5, 5, pool2In, swapFee); // DAI -> MKR

            const swapSequences = [
                [
                    [
                        POOL1,
                        DAI,
                        WETH,
                        toWei('0.1'),
                        MAX,
                        MAX,
                    ],
                ],
                [
                    [
                        POOL3,
                        DAI,
                        MKR,
                        // toWei(pool2In.toString()), // Error: [ethjs-unit] while converting number 0.10818521496413451873 to wei, too many decimal places
                        // toWei('0.108185215'),
                        toWei('0'), // This number should not influence the result
                        MAX,
                        MAX,
                    ],
                    [
                        POOL2,
                        MKR,
                        WETH,
                        toWei('0.1'),
                        MAX,
                        MAX,
                    ],
                ],
            ];


            const totalAmountIn = await proxy.callStatic.multihopBatchSwapExactOut(
                swapSequences, DAI, ETH, toWei('50')
            );

            const expectedTotalIn = pool1In.plus(pool3In);

            const relDif = calcRelativeDiff(expectedTotalIn, Decimal(fromWei(totalAmountIn)));
            if (verbose) {
                console.log('batchSwapExactOut');
                console.log(`expected: ${expectedTotalIn})`);
                console.log(`actual  : ${fromWei(totalAmountIn)})`);
                console.log(`relDif  : ${relDif})`);
            }

            assert.isAtMost(relDif.toNumber(), (errorDelta * swapSequences.length));
        });

    });

});
