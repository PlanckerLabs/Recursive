import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";
import { Bundler, IApproveToken, ITransaction, SignatureMode, SoulWalletLib, UserOperation, IUserOpReceipt, Signatures } from 'soul-wallet-lib';
import { USDCoin__factory, TokenPaymaster__factory, SingletonFactory__factory, EntryPoint__factory, ERC20__factory, SoulWalletFactory__factory, SoulWallet__factory, EstimateGasHelper__factory } from "soulwallet-contract/src/types";
import { Utils } from "./Utils";


const log_on = true;
const log = (message?: any, ...optionalParams: any[]) => { if (log_on) console.log(message, ...optionalParams) };
const EntryPointAddress = '0x319307ef67205d3a8731dd97718e961d429a8aae';
const bundlerUrl = "http://localhost:3000/rpc"

describe("SoulWalletContract", function () {

    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        // get accounts
        const accounts = await ethers.getSigners();

        // new account
        const walletOwner = Wallet.fromMnemonic("test test test test test test test test test test test junk").connect(ethers.provider);

        let chainId = await (await ethers.provider.getNetwork()).chainId;
        log("chainId:", chainId);

        // #region SingletonFactory 
        let SingletonFactory: string = SoulWalletLib.Defines.SingletonFactoryAddress;
        let code = await ethers.provider.getCode(SingletonFactory);
        if (code === '0x') {
            SingletonFactory = (await (await ethers.getContractFactory("SingletonFactory")).deploy()).address;
            code = await ethers.provider.getCode(SingletonFactory);
            expect(code).to.not.equal('0x');
        }
        const soulWalletLib = new SoulWalletLib(SingletonFactory);

        // #region SoulWalletLogic
        const SoulWalletLogic = {
            contract: await (await ethers.getContractFactory("SoulWallet")).deploy()
        };
        log("SoulWalletLogic:", SoulWalletLogic.contract.address);

        // #region EntryPoint  
        let EntryPoint
        if (await ethers.provider.getCode(EntryPointAddress) === '0x') {
            EntryPoint = {contract: await (await ethers.getContractFactory("EntryPoint")).deploy()};
        } else {
            EntryPoint = {contract: EntryPoint__factory.connect(EntryPointAddress, walletOwner)};
        }
        log("EntryPoint:", EntryPoint.contract.address);


        // #region wallet factory
        const _walletFactoryAddress = await soulWalletLib.Utils.deployFactory.deploy(SoulWalletLogic.contract.address, ethers.provider, accounts[0]);
        const WalletFactory = {
            contract: await ethers.getContractAt("SoulWalletFactory", _walletFactoryAddress)
        };
        log("SoulWalletFactory:", WalletFactory.contract.address);

        //# reginon bundler
        const bundler:Bundler = new soulWalletLib.Bundler(EntryPoint.contract.address, ethers.provider, bundlerUrl);
        await bundler.init();


        return {
            soulWalletLib,
            bundler,
            chainId,
            accounts,
            walletOwner,
            SingletonFactory,
            SoulWalletLogic,
            EntryPoint,
            WalletFactory
        };
    }

    async function activateWallet_withETH() {
        const { soulWalletLib, bundler, chainId, accounts, SingletonFactory, walletOwner, SoulWalletLogic, EntryPoint } = await loadFixture(deployFixture);

        const upgradeDelay = 30;
        const guardianDelay = 30;

        const walletAddress = await soulWalletLib.calculateWalletAddress(
            SoulWalletLogic.contract.address,
            EntryPoint.contract.address,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero
        );

        log('walletAddress: ' + walletAddress);

        //#region
        const activateOp = soulWalletLib.activateWalletOp(
            SoulWalletLogic.contract.address,
            EntryPoint.contract.address,
            walletOwner.address,
            upgradeDelay,
            guardianDelay,
            SoulWalletLib.Defines.AddressZero,
            '0x',
            10000000000,// 100Gwei
            1000000000,// 10Gwei 
        );

        const userOpHash = activateOp.getUserOpHashWithTimeRange(EntryPoint.contract.address, chainId, walletOwner.address);
        {
            // test toJson and fromJson
            const _activateOp = UserOperation.fromJSON(activateOp.toJSON());
            const _userOpHash = _activateOp.getUserOpHashWithTimeRange(EntryPoint.contract.address, chainId, walletOwner.address);
            expect(_userOpHash).to.equal(userOpHash);
        }
        {
            const _userOpHashRaw = activateOp.getUserOpHash(EntryPoint.contract.address, chainId);
            const _userOpHashOnline = await EntryPoint.contract.getUserOpHash(activateOp);
            expect(_userOpHashOnline).to.equal(_userOpHashRaw);
        }

        {
            const requiredPrefund = activateOp.requiredPrefund();
            log('requiredPrefund: ', ethers.utils.formatEther(requiredPrefund), 'ETH');

            // send eth to wallet
            await accounts[0].sendTransaction({
                to: walletAddress,
                value: requiredPrefund
            });
            // get balance of walletaddress
            const balance = await ethers.provider.getBalance(walletAddress);
            log('balance: ' + balance, 'wei');
        }

        activateOp.signWithSignature(
            walletOwner.address,
            Utils.signMessage(userOpHash, walletOwner.privateKey)
        );

        //const activateOp = UserOperation.fromJSON(activateOp.toJSON());
        const validation = await bundler.simulateValidation(activateOp);
        if (validation.status !== 0) {
            throw new Error(`error code:${validation.status}`);
        }
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
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        const code = await ethers.provider.getCode(walletAddress);
        expect(code).to.not.equal('0x');

        return {
            chainId, accounts, SingletonFactory, EntryPoint,
            soulWalletLib,
            bundler,
            walletAddress,
            walletOwner
        };
    }

    async function transferToken() {
        const { soulWalletLib, walletAddress, walletOwner, bundler, chainId, accounts, SingletonFactory, EntryPoint } = await activateWallet_withETH();

        let nonce = await soulWalletLib.Utils.getNonce(walletAddress, ethers.provider);

        await accounts[0].sendTransaction({
            to: walletAddress,
            value: ethers.utils.parseEther('0.001').toHexString()
        });

        const sendETHOP = await soulWalletLib.Tokens.ETH.transfer(
            ethers.provider,
            walletAddress,
            nonce,
            EntryPoint.contract.address,
            '0x',
            10000000000,// 100Gwei
            1000000000,// 10Gwei
            accounts[1].address,
            ethers.utils.parseEther('0.0001').toHexString()
        );
        if (!sendETHOP) {
            throw new Error('setGuardianOP is null');
        }
        const sendETHOPuserOpHash = sendETHOP.getUserOpHashWithTimeRange(EntryPoint.contract.address, chainId, walletOwner.address);
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
        const balanceBefore = await ethers.provider.getBalance(accounts[1].address);
        console.log('balanceBefore: ' + balanceBefore);

        const bundlerEvent = bundler.sendUserOperation(sendETHOP, 1000 * 60 * 3);
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
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        
        
        // get balance of accounts[1].address
        const balanceAfter = await ethers.provider.getBalance(accounts[1].address);
        console.log('balanceAfter: ' + balanceAfter);
        expect(balanceAfter.sub(balanceBefore).toString()).to.equal(ethers.utils.parseEther('0.0001').toString());



    }


    describe("wallet test", async function () {
        it("activate wallet(ETH)", activateWallet_withETH);
        it("transferToken", transferToken);
       
    });



});