async function main() {
  // We get the contract to deploy
  const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
  const Registry = await ethers.getContractFactory("BRegistry");
  const WETH = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  const BFactory = '0x9C84391B443ea3a48788079a5f98e2EaD55c9309';

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
