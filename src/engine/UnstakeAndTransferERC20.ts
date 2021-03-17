import { BigNumber, Contract, providers } from "ethers";
import { isAddress } from "ethers/lib/utils";
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { Base } from "./Base";
import { ERC20_ABI, STAKING_ABI } from "../abi";

export class UnstakeAndTransferERC20 extends Base {
  private _provider: providers.JsonRpcProvider;
  private _sender: string;
  private _recipient: string;
  private _tokenContract: Contract;
  private _stakingContract: Contract;
  private _tokenBalance: BigNumber;
  private _nonce: number | undefined;

  constructor(provider: providers.JsonRpcProvider, sender: string, recipient: string, _tokenAddress: string, _stakingAddress: string, _tokenBalance: BigNumber, _nonce?: number) {
    super()
    if (!isAddress(sender)) throw new Error("Bad Address")
    if (!isAddress(recipient)) throw new Error("Bad Address")

    this._sender = sender;
    this._provider = provider;
    this._recipient = recipient;
    this._tokenBalance = _tokenBalance;
    this._stakingContract = new Contract(_stakingAddress, STAKING_ABI, provider);
    this._tokenContract = new Contract(_tokenAddress, ERC20_ABI, provider);
    this._nonce = _nonce;
  }

  async description(): Promise<string> {
    return `Unstake ${this._tokenBalance.toString()}@${this._tokenContract.address} of ${this._sender} from ${this._stakingContract.address} and transfer to ${this._recipient}`;
  }

  async getZeroGasPriceTx(): Promise<Array<TransactionRequest>> {
    const unstakeTx = {
      ...(await this._stakingContract.populateTransaction.withdrawUnstakedBalance(this._tokenBalance)),
      gasPrice: BigNumber.from(0),
      gasLimit: BigNumber.from(120000), // TODO: CHECK
      nonce: this._nonce,
    }
    const transferTx = {
      ...(await this._tokenContract.populateTransaction.transfer(this._recipient, this._tokenBalance)),
      gasPrice: BigNumber.from(0),
      gasLimit: BigNumber.from(80000),
      nonce: this._nonce === undefined ? undefined : this._nonce + 1,
    };
    return [unstakeTx, transferTx];
  }

  private async getTokenBalance(tokenHolder: string): Promise<BigNumber> {
    return (await this._tokenContract.functions.balanceOf(tokenHolder))[0];
  }

  async getDonorTx(minerReward: BigNumber): Promise<TransactionRequest> {
    const checkTargets = [this._tokenContract.address]
    const checkPayloads = [this._tokenContract.interface.encodeFunctionData('balanceOf', [this._recipient])]
    const expectedBalance = this._tokenBalance ?? (await this.getTokenBalance(this._sender)).add(await this.getTokenBalance(this._recipient))
    const checkMatches = [this._tokenContract.interface.encodeFunctionResult('balanceOf', [expectedBalance])]
    return {
      ...(await Base.checkAndSendContract.populateTransaction.check32BytesAndSendMulti(checkTargets, checkPayloads, checkMatches)),
      value: minerReward,
      gasPrice: BigNumber.from(0),
      gasLimit: BigNumber.from(400000),
    }
  }
}
