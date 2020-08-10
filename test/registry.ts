import { expect } from 'chai';
import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";

describe("Registry", function() {
    let accounts: Signer[];
    let admin, user1;
    let registry: any;
    let POOL1: string;
    let POOL2: string;
    let POOL3: string;
    let POOL4: string;
    let POOL5: string;
    let POOL6: string;
    let POOL7: string;
    let pool1, pool2, pool3, pool4, pool5, pool6, pool7;
    let weth, bal, dai;
    let WETH: string;
    let BAL: string;
    let DAI: string;
    const MAX = ethers.constants.MaxUint256;
    const toWei = utils.parseEther;

    beforeEach(async () => {
        [admin, user1] = await ethers.getSigners();

        const BFactory = await ethers.getContractFactory("BFactory");
        const TokenFactory = await ethers.getContractFactory("TToken");
        const Registry = await ethers.getContractFactory("BRegistry");

        const factory = await BFactory.deploy();
        registry = await Registry.deploy(factory.address);

        POOL1 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool1 = await ethers.getContractAt("BPool", POOL1)

        POOL2 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool2 = await ethers.getContractAt("BPool", POOL2)

        POOL3 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool3 = await ethers.getContractAt("BPool", POOL3)

        POOL4 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool4 = await ethers.getContractAt("BPool", POOL4)

        POOL5 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool5 = await ethers.getContractAt("BPool", POOL5)

        // NO TOKENS FOR TEST
        POOL6 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool6 = await ethers.getContractAt("BPool", POOL6);

        POOL7 = await factory.callStatic.newBPool();
        await factory.newBPool();
        pool7 = await ethers.getContractAt("BPool", POOL7)

        weth = await TokenFactory.deploy('Wrapped Ether', 'WETH', 18);
        dai = await TokenFactory.deploy('Dai Stablecoin', 'DAI', 18);
        bal = await TokenFactory.deploy('Balancer', 'BAL', 18);
        await weth.deployed();
        await dai.deployed();
        await bal.deployed();
        WETH = weth.address;
        DAI = dai.address;
        BAL = bal.address;

        await weth.mint(await admin.getAddress(), toWei('4000000000'));
        await bal.mint(await admin.getAddress(), toWei('400000000000'));
        await dai.mint(await admin.getAddress(), toWei('1000000000000'));

        await weth.approve(POOL1, MAX);
        await bal.approve(POOL1, MAX);

        await weth.approve(POOL2, MAX);
        await bal.approve(POOL2, MAX);

        await weth.approve(POOL3, MAX);
        await bal.approve(POOL3, MAX);

        await weth.approve(POOL4, MAX);
        await bal.approve(POOL4, MAX);

        await weth.approve(POOL5, MAX);
        await bal.approve(POOL5, MAX);

        await weth.approve(POOL6, MAX);
        await bal.approve(POOL6, MAX);

        await weth.approve(POOL7, MAX);
        await bal.approve(POOL7, MAX);

        await pool1.bind(BAL, toWei('720001'), toWei('8'));
        await pool1.bind(WETH, toWei('9201'), toWei('2'));
        await pool1.setSwapFee(toWei('0.031'));
        await pool1.finalize();
        // Fee too high

        // Doesn't bind tokens to pool2 so it will Revert

        // ALL POOLS MUST HAVE SAME SP FOR LIQ ORDER TO BE CORRECT
        await pool3.bind(BAL, toWei('1000'), toWei('1'));
        await pool3.bind(WETH, toWei('900'), toWei('9'));
        await pool3.setSwapFee(toWei('0.0031'));
        await pool3.finalize();
        // Liq 900/90

        await pool4.bind(BAL, toWei('1000'), toWei('5'));
        await pool4.bind(WETH, toWei('100'), toWei('5'));
        await pool4.setSwapFee(toWei('0.0031'));
        await pool4.finalize();
        // Liq 500/50

        await pool5.bind(BAL, toWei('900'), toWei('5'));
        await pool5.bind(WETH, toWei('90'), toWei('5'));
        await pool5.setSwapFee(toWei('0.0001'));
        await pool5.finalize();
        // Liq 450/45

        await pool6.bind(BAL, toWei('1000'), toWei('7.5'));
        await pool6.bind(WETH, toWei('33.33333'), toWei('2.5'));
        await pool6.setSwapFee(toWei('0.0095'));
        await pool6.finalize();
        // Liq 250/25

        await pool7.bind(BAL, toWei('1000'), toWei('9'));
        await pool7.bind(WETH, toWei('11.11111'), toWei('1'));
        await pool7.setSwapFee(toWei('0.0001'));
        await pool7.finalize();
        // Liq 100/10
        /*
        console.log('Set up complete: ')
        console.log(`Pool1: ${POOL1}`);
        console.log(`Pool2: ${POOL2}`);
        console.log(`Pool3: ${POOL3}`);
        console.log(`Pool4: ${POOL4}`);
        console.log(`Pool5: ${POOL5}`);
        console.log(`Pool6: ${POOL6}`);
        console.log(`Pool7: ${POOL7}`);
        */
    });

    it("No Added Pools, gets Should Return 0", async function() {
        let poolInfo = await registry.getPairInfo(POOL1, BAL, WETH);
        expect(poolInfo[0]).to.equal(0);
        expect(poolInfo[1]).to.equal(0);
        expect(poolInfo[2]).to.equal(0);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(0);

        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(0);
    });

    it("Should fail for non-pool addition.", async function() {
        await expect(
          registry.addPoolPair('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', BAL, WETH)
        ).to.be.revertedWith("ERR_NOT_BPOOL");
    })

    it("Should fail for high fee addition.", async function() {
        await expect(
          registry.addPoolPair(POOL1, BAL, WETH)
        ).to.be.revertedWith("ERR_FEE_TOO_HIGH");
    })

    it("Should fail for adding pool without tokens.", async function() {
        await expect(
          registry.addPoolPair(POOL2, BAL, WETH)
        ).to.be.revertedWith("ERR_NOT_BOUND");
    })

    it("Add single pool pair should register.", async function() {
        await registry.addPoolPair(POOL3, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);
        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);

        await registry.sortPools([WETH, BAL], 10);
        pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);
        pools = await registry.getPoolsWithLimit(WETH, BAL, 0, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);
    });

    it("Adding same pool pair should not add again.", async function() {
        await registry.addPoolPair(POOL3, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);
        await registry.addPoolPair(POOL3, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);
        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL3);
    });

    it("Adding pools in correct order should give best liquidity.", async function() {
        await registry.addPoolPair(POOL3, BAL, WETH);
        await registry.addPoolPair(POOL4, BAL, WETH);
        await registry.addPoolPair(POOL5, BAL, WETH);
        await registry.addPoolPair(POOL6, BAL, WETH);
        await registry.addPoolPair(POOL7, BAL, WETH);

        await registry.sortPools([BAL, WETH], 10);
        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        console.log(`Pool0: ${pools[0]} ${POOL3}`);
        console.log(`Pool1: ${pools[1]} ${POOL4}`);
        console.log(`Pool2: ${pools[2]} ${POOL5}`);
        console.log(`Pool3: ${pools[3]} ${POOL6}`);
        console.log(`Pool4: ${pools[4]} ${POOL7}`);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);

        await registry.sortPools([WETH, BAL], 10);
        pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);
    });

    it("Adding pools in random order should sort correctly.", async function() {
        console.log()
        let tx = await registry.addPoolPair(POOL4, BAL, WETH);
        tx = await tx.wait();
        console.log(`Add Pair Gas: ${tx.gasUsed.toString()}`);
        tx = await registry.estimateGas.addPoolPair(POOL7, BAL, WETH);
        console.log(`Add Pair Estimate: ${tx}`);
        tx = await registry.addPoolPair(POOL5, BAL, WETH);
        tx = await tx.wait();
        console.log(`Add Pair Gas: ${tx.gasUsed.toString()}`);
        tx = await registry.addPoolPair(POOL7, BAL, WETH);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL3, BAL, WETH);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL6, BAL, WETH);
        tx = await tx.wait();
        console.log(`Add Pair Gas: ${tx.gasUsed.toString()}`);

        tx = await registry.estimateGas.sortPools([BAL, WETH], 10);
        console.log(`Sort Pools Estimate: ${tx}`);

        tx = await registry.sortPools([BAL, WETH], 10);
        tx = await tx.wait();
        console.log(`Sort Pools: ${tx.gasUsed.toString()}`);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);
    });

    it("Adding pools in random order with sort inbetween should sort correctly.", async function() {

        let tx = await registry.addPoolPair(POOL5, BAL, WETH);
        tx = await tx.wait();
        await registry.sortPools([BAL, WETH], 10);
        tx = await registry.addPoolPair(POOL3, BAL, WETH);
        tx = await tx.wait();
        await registry.sortPools([BAL, WETH], 10);
        tx = await registry.addPoolPair(POOL4, BAL, WETH);
        tx = await tx.wait();
        await registry.sortPools([BAL, WETH], 10);
        tx = await registry.addPoolPair(POOL7, BAL, WETH);
        tx = await tx.wait();
        await registry.sortPools([BAL, WETH], 10);
        tx = await registry.addPoolPair(POOL6, BAL, WETH);
        tx = await tx.wait();

        tx = await registry.sortPools([BAL, WETH], 10);
        tx = await tx.wait();

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);
    });

    it("Adding pools in random order WETH/BAL should sort correctly.", async function() {

        let tx = await registry.addPoolPair(POOL4, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL5, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL3, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL6, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL7, WETH, BAL);
        tx = await tx.wait();

        tx = await registry.sortPools([BAL, WETH], 10);
        tx = await tx.wait();
        console.log(`Sort Pools: ${tx.gasUsed.toString()}`);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);
    });

    it("Adding pools in random order WETH/BAL should sort correctly.", async function() {
        let tx = await registry.addPoolPair(POOL7, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL4, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL3, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL6, BAL, WETH);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL5, BAL, WETH);
        tx = await tx.wait();

        tx = await registry.sortPools([WETH, BAL], 10);
        tx = await tx.wait();

        let pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(5);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
        expect(pools[4]).to.equal(POOL7);
    });

    it("Sort Pools With Purge Should Remove <10% Pool.", async function() {
        let tx = await registry.addPoolPair(POOL7, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL4, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL3, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL6, BAL, WETH);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL5, BAL, WETH);
        tx = await tx.wait();

        tx = await registry.sortPoolsWithPurge([WETH, BAL], 10);
        tx = await tx.wait();
        console.log(`Sort Pools With Purge: ${tx.gasUsed.toString()}`);

        let pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(4);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
    });

    it("Sort Pools With Purge Should Remove <10% Pool.", async function() {
        let tx = await registry.addPoolPair(POOL7, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL4, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL3, WETH, BAL);
        tx = await tx.wait();
        tx = await registry.addPoolPair(POOL5, BAL, WETH);
        tx = await tx.wait();

        tx = await registry.sortPoolsWithPurge([WETH, BAL], 10);
        tx = await tx.wait();
        console.log(`Sort Pools With Purge: ${tx.gasUsed.toString()}`);

        let pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(3);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);

        tx = await registry.addPoolPair(POOL6, BAL, WETH);
        tx = await tx.wait();
        tx = await registry.sortPoolsWithPurge([WETH, BAL], 10);
        tx = await tx.wait();
        pools = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        expect(pools.length).to.equal(4);
        expect(pools[0]).to.equal(POOL3);
        expect(pools[1]).to.equal(POOL4);
        expect(pools[2]).to.equal(POOL5);
        expect(pools[3]).to.equal(POOL6);
    });
});
