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
    let pool1, pool2, pool3;
    let weth, bal, dai;
    let WETH: string;
    let BAL: string;
    let DAI: string;
    const MAX = ethers.constants.MaxUint256;
    const toWei = utils.parseEther;

    before(async () => {
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

        weth = await TokenFactory.deploy('Wrapped Ether', 'WETH', 18);
        dai = await TokenFactory.deploy('Dai Stablecoin', 'DAI', 18);
        bal = await TokenFactory.deploy('Balancer', 'BAL', 18);
        await weth.deployed();
        await dai.deployed();
        await bal.deployed();
        WETH = weth.address;
        DAI = dai.address;
        BAL = bal.address;

        await weth.mint(await admin.getAddress(), toWei('40000'));
        await bal.mint(await admin.getAddress(), toWei('4000000'));
        await dai.mint(await admin.getAddress(), toWei('10000000'));

        await weth.approve(POOL1, MAX);
        await bal.approve(POOL1, MAX);

        await weth.approve(POOL2, MAX);
        await bal.approve(POOL2, MAX);

        await weth.approve(POOL3, MAX);
        await bal.approve(POOL3, MAX);

        await pool1.bind(BAL, toWei('720000'), toWei('8'));
        await pool1.bind(WETH, toWei('9200'), toWei('2'));
        await pool1.setSwapFee(toWei('0.0015'));
        await pool1.finalize();

        await pool2.bind(BAL, toWei('185000'), toWei('5'));
        await pool2.bind(WETH, toWei('9400'), toWei('5'));
        await pool2.setSwapFee(toWei('0.0095'));
        await pool2.finalize();

        await pool3.bind(BAL, toWei('720000'), toWei('8'));
        await pool3.bind(WETH, toWei('9200'), toWei('2'));
        await pool3.setSwapFee(toWei('0.011'));
        await pool3.finalize();
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
          registry.addPoolPair(POOL3, BAL, WETH)
        ).to.be.revertedWith("ERR_FEE_TOO_HIGH");
    })
    /*
    it("Add single pool pair should register.", async function() {
        await registry.addPoolPair(POOL2, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        console.log(pools)
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL2);
        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL2);
    });

    it("Adding same pool pair should not add again.", async function() {
        await registry.addPoolPair(POOL2, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        console.log(pools)
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL2);
        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(1);
        expect(pools[0]).to.equal(POOL2);
    });
    */
    it("Adding & sorting second pool pair should give best liquidity.", async function() {
        await registry.addPoolPair(POOL2, BAL, WETH);
        await registry.addPoolPair(POOL1, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let pools = await registry.getBestPoolsWithLimit(BAL, WETH, 5);
        console.log(pools)
        expect(pools.length).to.equal(2);
        expect(pools[0]).to.equal(POOL1);
        expect(pools[1]).to.equal(POOL2);
        pools = await registry.getPoolsWithLimit(BAL, WETH, 0, 5);
        expect(pools.length).to.equal(2);
        expect(pools[0]).to.equal(POOL1);
        expect(pools[1]).to.equal(POOL2);
    });

});
