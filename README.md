# Recursive

Bundler on the layer2

## Entrypoint contract on the Scroll Alpha Testnet: 
https://blockscout.scroll.io/address/0x630f191C6b8738ca24cA39A75C9EcE5445e21Ed1

## Entrypoint contract on the Optimism Goerli Testnet: 
https://goerli-optimism.etherscan.io/address/0x630f191C6b8738ca24cA39A75C9EcE5445e21Ed1



## Entrypoint
https://blockscan.com/address/0x0576a174d229e3cfa37253523e645a78a0c91b57

## SimpleAccountFactory
https://blockscan.com/address/0x09c58cf6be8e25560d479bd52b4417d15bca2845


packages\bundler\src\BundlerServer.ts 77行 if里要加一个“err?.errorName && ”，不然启动Optimism的bundler服务会报版本错误
