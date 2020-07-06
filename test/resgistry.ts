import { ethers, ethereum } from "@nomiclabs/buidler";
import { Signer, utils } from "ethers";

describe("Token", function() {
    let accounts: Signer[];
    let admin, user1;
    let registry: any;
    let POOL1: string;
    let POOL2: string;
    let pool1, pool2;
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

        await pool1.bind(BAL, toWei('720000'), toWei('8'));
        await pool1.bind(WETH, toWei('9200'), toWei('2'));
        await pool1.setSwapFee(toWei('0.0015'));
        await pool1.finalize();

        await pool2.bind(BAL, toWei('185000'), toWei('5'));
        await pool2.bind(WETH, toWei('9400'), toWei('5'));
        await pool2.setSwapFee(toWei('0.0095'));
        await pool2.finalize();

    });

    it("add pool pair", async function() {
        await registry.addPoolPair(POOL1, BAL, WETH);
        await registry.addPoolPair(POOL2, BAL, WETH);
        await registry.sortPools([BAL, WETH], 10);

        let test = await registry.getBestPoolsWithLimit(WETH, BAL, 5);
        console.log(test);
    });
});
