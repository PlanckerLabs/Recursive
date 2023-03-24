import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Wallet, ethers } from "ethers";
import { Bundler, SoulWalletLib, IUserOpReceipt } from 'soul-wallet-lib';
import { Utils } from "./Utils";


const log_on = true;
const log = (message?: any, ...optionalParams: any[]) => { if (log_on) console.log(message, ...optionalParams) };
const entryPointAddress = '0x0576a174d229e3cfa37253523e645a78a0c91b57';
const walletLogicAddress = '0x0F8065973c4F7AB41E739302152c5cB6aC7590BA';
const bundlerUrl = "http://18.217.235.204:3000/rpc"
const walletAddress0 = "0x267801C85A5E31133b3EF0d88920c2EE2f6001c2"
const walletAddress1 = "0x63D9e3861d0E1BEC049BAeb3759d8F046762A5e6"
const walletFactoryAddressHas ="0xC544A5107d887c9df046Cd8C5fB9D61e7559c229"

const provider = new ethers.providers.JsonRpcProvider("https://polygon-mumbai.g.alchemy.com/v2/MD-3rBtr93tbYyDY518rqsBGupOGuvOV")
const walletOwner = Wallet.fromMnemonic("xxx").connect(provider)
        
const accounts = [walletAddress0, walletAddress1]

const soulWalletLib = new SoulWalletLib(SoulWalletLib.Defines.SingletonFactoryAddress);
       
const bundler:Bundler = new soulWalletLib.Bundler(entryPointAddress, provider, bundlerUrl);


describe("SoulWalletContract", function () {


    async function deployFixture() {
        await bundler.init();
        let chainId = await (await provider.getNetwork()).chainId;
        log("chainId:", chainId);

        return {
            chainId
        };
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
            1
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
            1
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
        const bundlerEvent = bundler.sendUserOperation(activateOp, 1000 * 60 * 3);
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
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        
        const walletAddressCode = await provider.getCode(walletAddress);
        log('walletAddressCode: ' + walletAddressCode);

        return {
            walletAddress
        }

    }

    async function transferToken() {
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
            ethers.utils.parseEther('0.0001').toHexString()
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

        const bundlerEvent = bundler.sendUserOperation(sendETHOP, 1000 * 60 * 10);
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

        // while (!finish) {
        //     await new Promise((resolve) => setTimeout(resolve, 10000));
        // }
        
        
        // get balance of accounts[1].address
        const balanceAfter = await provider.getBalance(accounts[1]);
        console.log('balanceAfter: ' + balanceAfter);
        
        console.log('diffAmount:' + balanceAfter.sub(balanceBefore).toString());


    }


    describe("wallet test", async function () {
        //it("activate wallet", activateWallet);
        it("transferToken", transferToken);
    
    });

});