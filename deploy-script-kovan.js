async function main() {
  // We get the contract to deploy
  const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
  const Registry = await ethers.getContractFactory("BRegistry");
  const WETH = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
  const BFactory = '0x8f7F78080219d4066A8036ccD30D588B416a40DB';

  const registry = await Registry.deploy(BFactory);
  await registry.deployed();
  console.log("Registry deployed to:", registry.address);

  const exchangeProxy = await ExchangeProxy.deploy(WETH);
  await exchangeProxy.deployed();

  console.log("Proxy deployed to:", exchangeProxy.address);

  await exchangeProxy.setRegistry(registry.address);
  console.log('Registry set.')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
