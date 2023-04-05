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


test目录的脚本放到soul-wallet-contract的test目录下进行测试，比如：npx hardhat test ./test/test-polygon-mumbai.ts

soul-wallet-lib用这个版本v0.1.0-alpha.signaturetest.01

ethers使用5.7.2

服务器的bundler服务启动脚本放在/home/ubuntu/plancker/bundler/launcher目录下，启动命令：./bundler-polygon-mumbai.sh start|stop|restart