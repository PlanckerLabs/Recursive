import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Wallet, ethers } from "ethers";
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

        const provider = await ethers.getDefaultProvider("http://127.0.0.1:8545")

        
        const account0 = new ethers.Wallet("0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e", provider)
        const account1 = new ethers.Wallet("0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0", provider)
        



        const walletOwner = Wallet.fromMnemonic("test test test test test test test test test test test junk").connect(provider);
        

        
        
        const accounts = [account0, account1]

        // new account
        

        let chainId = await (await provider.getNetwork()).chainId;
        log("chainId:", chainId);

        // #region SingletonFactory 
        let SingletonFactoryAddress: string = SoulWalletLib.Defines.SingletonFactoryAddress;
        let code = await provider.getCode(SingletonFactoryAddress);
        if (code === '0x') {
            const SingletonFactory = new ethers.ContractFactory(SingletonFactory__factory.abi, SingletonFactory__factory.bytecode, walletOwner);
            const Singleton = await SingletonFactory.deploy()
            await Singleton.deployed()
            SingletonFactoryAddress = Singleton.address
            code = await provider.getCode(SingletonFactoryAddress);
            expect(code).to.not.equal('0x');
        }
        const soulWalletLib = new SoulWalletLib(SingletonFactoryAddress);

        // #region SoulWalletLogic
        const SoulWalletFactory = new ethers.ContractFactory(SoulWallet__factory.abi, SoulWallet__factory.bytecode, walletOwner);
        const SoulWallet = await SoulWalletFactory.deploy()
        const SoulWalletLogic = {
            contract: await SoulWallet.deployed()
        };
        log("SoulWalletLogic:", SoulWalletLogic.contract.address);

        // #region EntryPoint  
        let EntryPoint
        if (await provider.getCode(EntryPointAddress) === '0x') {
            const EntryPointFactory = new ethers.ContractFactory(EntryPoint__factory.abi, EntryPoint__factory.bytecode, walletOwner);
            EntryPoint = await EntryPointFactory.deploy()
            await EntryPoint.deployed()
        } else {
            EntryPoint = {contract: EntryPoint__factory.connect(EntryPointAddress, walletOwner)};
        }
        log("EntryPoint:", EntryPoint.contract.address);



        //# reginon bundler
        const bundler:Bundler = new soulWalletLib.Bundler(EntryPoint.contract.address, provider, bundlerUrl);
        await bundler.init();


        return {
            soulWalletLib,
            bundler,
            chainId,
            accounts,
            walletOwner,
            SoulWalletLogic,
            EntryPoint,
            provider
        };
    }

    async function activateWallet_withETH() {
        const { soulWalletLib, bundler, chainId, accounts, walletOwner, SoulWalletLogic, EntryPoint, provider } = await loadFixture(deployFixture);

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
            const balance = await provider.getBalance(walletAddress);
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
        const code = await provider.getCode(walletAddress);
        expect(code).to.not.equal('0x');

        return {
            chainId, accounts, EntryPoint, provider, 
            soulWalletLib,
            bundler,
            walletAddress,
            walletOwner
        };
    }

    async function transferToken() {
        const { soulWalletLib, walletAddress, walletOwner, bundler, chainId, accounts, provider, EntryPoint } = await activateWallet_withETH();

        let nonce = await soulWalletLib.Utils.getNonce(walletAddress, provider);

        await accounts[0].sendTransaction({
            to: walletAddress,
            value: ethers.utils.parseEther('0.001').toHexString()
        });

        const sendETHOP = await soulWalletLib.Tokens.ETH.transfer(
            provider,
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
        const balanceBefore = await provider.getBalance(accounts[1].address);
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
        const balanceAfter = await provider.getBalance(accounts[1].address);
        console.log('balanceAfter: ' + balanceAfter);
        expect(balanceAfter.sub(balanceBefore).toString()).to.equal(ethers.utils.parseEther('0.0001').toString());



    }


    describe("wallet test", async function () {
        it("activate wallet(ETH)", activateWallet_withETH);
        it("transferToken", transferToken);
       
    });



});