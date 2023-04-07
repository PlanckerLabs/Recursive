import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Wallet, ethers } from "ethers";
import { Bundler, SoulWalletLib, IUserOpReceipt, UserOperation } from 'soul-wallet-lib';
import { NumberLike, toNumber } from "soul-wallet-lib/dist/defines/numberLike";
import { Utils } from "./Utils";


const log_on = true;
const log = (message?: any, ...optionalParams: any[]) => { if (log_on) console.log(message, ...optionalParams) };
const entryPointAddress = '0x0576a174d229e3cfa37253523e645a78a0c91b57';
const walletLogicAddress = '0xc535620Bc1E7e0A5682A1A0b3D4878e8a32c0e81';
const bundlerUrl = "http://bundler-pol-main.plancker.org/rpc"
const walletAddress0 = "0x8a3Ee9D3be3bF30a747A3c94C3328A2027B74A2E"
const walletAddress1 = "0xD30b30137d7dA29ecf3247F430ABC50A38a43c7f"
const walletFactoryAddressHas = "0x28D188e045528c6C29BD51AA6CF0D1a885720EA1"

const provider = new ethers.providers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/yQOK9DBkT6J4QhOGZea037r7txWH0GyA")
const walletOwner = Wallet.fromMnemonic("silent sign razor move sunset grass worth loop token various medal cool").connect(provider)

const accounts = [walletAddress0, walletAddress1]

const soulWalletLib = new SoulWalletLib(SoulWalletLib.Defines.SingletonFactoryAddress);

const bundler: Bundler = new soulWalletLib.Bundler(entryPointAddress, provider, bundlerUrl);

const slat = 3

describe("SoulWalletContract", function () {

    async function estimateUserOperationGas(bundler: Bundler, userOp: UserOperation) {
        const estimateData:any = await bundler.eth_estimateUserOperationGas(userOp);
        if (toNumber(userOp.callGasLimit) === 0) {
            userOp.callGasLimit = estimateData.callGasLimit;
        }
        userOp.preVerificationGas = estimateData.preVerificationGas;
        userOp.verificationGasLimit = estimateData.verificationGas;
    }

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
        await estimateUserOperationGas(bundler, activateOp);


        const requiredPrefund = await (await activateOp.requiredPrefund()).requiredPrefund;
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
        const walletBalance = await provider.getBalance(walletAddress)
        log('walletBalance: ' + walletBalance, 'wei');

        //#region
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
        await estimateUserOperationGas(bundler, activateOp);

        const requiredPrefund = await (await activateOp.requiredPrefund()).requiredPrefund;
        log('requiredPrefund: ', ethers.utils.formatEther(requiredPrefund));

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
        const walletAddress = accounts[0];


        let nonce = await soulWalletLib.Utils.getNonce(walletAddress, provider);
        const feeData = await provider.getFeeData()
        const sendETHOP = await soulWalletLib.Tokens.ETH.transfer(
            walletAddress,
            nonce,
            '0x',
            feeData.maxFeePerGas?.toNumber() as NumberLike,
            feeData.maxPriorityFeePerGas?.toNumber() as NumberLike,
            accounts[1],
            ethers.utils.parseEther('0.001').toHexString()
        );
        if (!sendETHOP) {
            throw new Error('setGuardianOP is null');
        }
        await estimateUserOperationGas(bundler, sendETHOP);
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

        //Timeout of 40000ms exceeded. For async tests and hooks, ensure "done()" is called; if returning a Promise, ensure it resolves
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