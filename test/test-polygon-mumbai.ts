import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Wallet, ethers } from "ethers";
import { Bundler, SoulWalletLib, IUserOpReceipt } from 'soul-wallet-lib';
import { NumberLike } from "soul-wallet-lib/dist/defines/numberLike";
import { Utils } from "./Utils";


const log_on = true;
const log = (message?: any, ...optionalParams: any[]) => { if (log_on) console.log(message, ...optionalParams) };
const entryPointAddress = '0x0576a174d229e3cfa37253523e645a78a0c91b57';
const walletLogicAddress = '0x0F8065973c4F7AB41E739302152c5cB6aC7590BA';
const bundlerUrl = "http://127.0.0.1:3000/rpc"
const walletAddress0 = "0xdE0d9524A59f3aB393DAA60750b1b88e77De1ED8"
const walletAddress1 = "0x37Bb350b9bD47D5354dC4d6d6E7227BCCe0F4474"
const walletFactoryAddressHas ="0xC544A5107d887c9df046Cd8C5fB9D61e7559c229"

const provider = new ethers.providers.JsonRpcProvider("https://polygon-mumbai.g.alchemy.com/v2/MD-3rBtr93tbYyDY518rqsBGupOGuvOV")
const walletOwner = Wallet.fromMnemonic("xxxxxxxxxxxxxxxxxxxxxxxxxx").connect(provider)
        
const accounts = [walletAddress0, walletAddress1]

const soulWalletLib = new SoulWalletLib(SoulWalletLib.Defines.SingletonFactoryAddress);
       
const bundler:Bundler = new soulWalletLib.Bundler(entryPointAddress, provider, bundlerUrl);

const slat = 0

describe("SoulWalletContract", function () {


    async function deployFixture() {
        await bundler.init();
        let chainId = await (await provider.getNetwork()).chainId;
        log("chainId:", chainId);

        return {
            chainId
        };
    }

    async function getWalletAddress() {
        const { chainId } = await loadFixture(deployFixture);

        const upgradeDelay = 30;
        const guardianDelay = 30;

        const walletAddress = await soulWalletLib.calculateWalletAddress(
            walletLogicAddress,
            entryPointAddress,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero,
            slat
        );

        const feeData = await provider.getFeeData()
        const activateOp = soulWalletLib.activateWalletOp(
            walletLogicAddress,
            entryPointAddress,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero,
            '0x',
            feeData.maxFeePerGas?.toNumber() as NumberLike,
            feeData.maxPriorityFeePerGas?.toNumber() as NumberLike,
            slat
        );


        const requiredPrefund = await activateOp.requiredPrefund();
        log('requiredPrefund: ', ethers.utils.formatEther(requiredPrefund));

        log('walletAddress: ' + walletAddress);
        const walletBalance = await provider.getBalance(walletAddress)
        log('walletBalance: ' + walletBalance, 'wei');
        
    }

    async function activateWallet() {
        const { chainId } = await loadFixture(deployFixture);
        
        const upgradeDelay = 30;
        const guardianDelay = 30;

        const walletAddress = await soulWalletLib.calculateWalletAddress(
            walletLogicAddress,
            entryPointAddress,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero,
            slat
        );

        log('walletAddress: ' + walletAddress);
        log('walletBalance: ' + await provider.getBalance(walletAddress), 'wei');
        
        //#region
        const activateOp = soulWalletLib.activateWalletOp(
            walletLogicAddress,
            entryPointAddress,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero,
            '0x',
            10000000000,// 100Gwei
            1000000000,// 10Gwei
            slat
        );


        const requiredPrefund = await activateOp.requiredPrefund();
        log('requiredPrefund: ', ethers.utils.formatEther(requiredPrefund));

        // await walletOwner.sendTransaction({
        //     to: walletAddress,
        //     value: requiredPrefund
        // });

        const balance = await provider.getBalance(walletAddress);
        log('walletBalance: ' + balance, 'wei');

        const userOpHash = activateOp.getUserOpHashWithTimeRange(entryPointAddress, chainId, walletOwner.address);
        activateOp.signWithSignature(
            walletOwner.address,
            Utils.signMessage(userOpHash, walletOwner.privateKey)
        );

        const validation = await bundler.simulateValidation(activateOp);
        if (validation.status !== 0) {
            throw new Error(`error code:${validation.status}`);
        }
        log(`simulateValidation result:`, validation);
        const simulate = await bundler.simulateHandleOp(activateOp);
        if (simulate.status !== 0) {
            throw new Error(`error code:${simulate.status}`);
        }
        log(`simulateHandleOp result:`, simulate);

        
        let activated = false;
        const bundlerEvent = bundler.sendUserOperation(activateOp, 1000 * 60 * 5);
        bundlerEvent.on('error', (err: any) => {
            console.log(err);
        });
        bundlerEvent.on('send', (userOpHash: string) => {
            console.log('send: ' + userOpHash);
        });
        bundlerEvent.on('receipt', (receipt: IUserOpReceipt) => {
            console.log('receipt: ' + receipt);
        activated = true;
        
        });
        bundlerEvent.on('timeout', () => {
            console.log('timeout');
        });
        while (!activated) {
            console.log("send userOperration, waiting...");
            await new Promise(r => setTimeout(r, 3000));
        }
        
        const walletAddressCode = await provider.getCode(walletAddress);
        log('walletAddressCode: ' + walletAddressCode);

        return {
            walletAddress
        }

    }

    async function transferEth() {
        const { chainId } = await loadFixture(deployFixture);
        const walletAddress  = accounts[0];
        
        
        let nonce = await soulWalletLib.Utils.getNonce(walletAddress, provider);

        // await accounts[0].sendTransaction({
        //     to: walletAddress,
        //     value: ethers.utils.parseEther('0.0001').toHexString()
        // });

        const sendETHOP = await soulWalletLib.Tokens.ETH.transfer(
            provider,
            walletAddress,
            nonce,
            entryPointAddress,
            '0x',
            10000000000,// 100Gwei
            1000000000,// 10Gwei
            accounts[1],
            ethers.utils.parseEther('0.00011').toHexString()
        );
        if (!sendETHOP) {
            throw new Error('setGuardianOP is null');
        }
        const sendETHOPuserOpHash = sendETHOP.getUserOpHashWithTimeRange(entryPointAddress, chainId, walletOwner.address);
        const sendETHOPSignature = Utils.signMessage(sendETHOPuserOpHash, walletOwner.privateKey)
        sendETHOP.signWithSignature(walletOwner.address, sendETHOPSignature);

        let validation = await bundler.simulateValidation(sendETHOP);
        if (validation.status !== 0) {
            throw new Error(`error code:${validation.status}`);
        }
        let simulate = await bundler.simulateHandleOp(sendETHOP);
        if (simulate.status !== 0) {
            throw new Error(`error code:${simulate.status}`);
        }

        // get balance of accounts[1].address
        let finish = false
        const balanceBefore = await provider.getBalance(accounts[1]);
        console.log('balanceBefore: ' + balanceBefore);

        const bundlerEvent = bundler.sendUserOperation(sendETHOP, 1000 * 60 * 5);
        bundlerEvent.on('error', (err: any) => {
            console.log(err);
        });
        bundlerEvent.on('send', (userOpHash: string) => {
            console.log('send: ' + userOpHash);
        });
        bundlerEvent.on('receipt', (receipt: IUserOpReceipt) => {
            console.log('receipt: ' + receipt);
            finish = true
        });
        bundlerEvent.on('timeout', () => {
            console.log('timeout');
        });

        while (!finish) {
            console.log("send userOperration, waiting...");
            await new Promise(r => setTimeout(r, 3000));
        }
        
        
        // get balance of accounts[1].address
        const balanceAfter = await provider.getBalance(accounts[1]);
        console.log('balanceAfter: ' + balanceAfter);
        
        console.log('diffAmount:' + balanceAfter.sub(balanceBefore).toString());


    }


    describe("wallet test", async function () {
        //it("get wallet address", getWalletAddress);
        //it("activate wallet", activateWallet);
        it("transferEth", transferEth);
    
    });

});