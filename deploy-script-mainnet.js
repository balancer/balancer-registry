async function main() {
  // We get the contract to deploy
  const ExchangeProxy = await ethers.getContractFactory("ExchangeProxy");
  const Registry = await ethers.getContractFactory("BRegistry");
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const BFactory = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd';

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
