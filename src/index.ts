import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, providers, Wallet } from "ethers";
import { UnstakeAndTransferERC20 } from "./engine/UnstakeAndTransferERC20";
import { Base } from "./engine/Base";
import { checkSimulation, ETHER, gasPriceToGwei, printTransactions } from "./utils";
import { StakingAddress, TokenAddress, TokenBalance } from "./settings";
import { parseEther } from "ethers/lib/utils";

require('log-timestamp');
require('dotenv').config();

const MINER_REWARD_IN_WEI = parseEther(process.env.MINER_REWARD ?? '0.1');
const BLOCKS_IN_FUTURE = 2;

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY_ZERO_GAS = process.env.PRIVATE_KEY_ZERO_GAS;
const PRIVATE_KEY_DONOR = process.env.PRIVATE_KEY_DONOR;
const FLASHBOTS_SECRET = process.env.FLASHBOTS_SECRET || '';
const RECIPIENT = process.env.RECIPIENT;
const SIMULATE_TIMESTAMP = process.env.SIMULATE_TIMESTAMP ? parseInt(process.env.SIMULATE_TIMESTAMP) : undefined;
const NONCE = process.env.NONCE ? parseInt(process.env.NONCE) : undefined;
const DRY_RUN = process.env.DRY_RUN ?? false;

if (PRIVATE_KEY_ZERO_GAS === undefined) {
  console.warn("Must provide PRIVATE_KEY_ZERO_GAS environment variable, corresponding to Ethereum EOA with assets to be transferred")
  process.exit(1)
}
if (PRIVATE_KEY_DONOR === undefined) {
  console.warn("Must provide PRIVATE_KEY_DONOR environment variable, corresponding to an Ethereum EOA with ETH to pay miner")
  process.exit(1)
}
if (FLASHBOTS_SECRET === "") {
  console.warn("Must provide FLASHBOTS_SECRET environment variable, please see https://hackmd.io/@flashbots/rk-qzgzCD")
  process.exit(1)
}

const provider = new providers.JsonRpcProvider(ETHEREUM_RPC_URL);

const walletZeroGas = new Wallet(PRIVATE_KEY_ZERO_GAS, provider);
const walletDonor = new Wallet(PRIVATE_KEY_DONOR, provider);
const walletAuth = new Wallet(FLASHBOTS_SECRET, provider)
const recipient = RECIPIENT ?? walletDonor.address;


if (DRY_RUN) console.log(`** DRY RUN **`);
if (SIMULATE_TIMESTAMP) console.log(`Simulated Timestamp: ${new Date(SIMULATE_TIMESTAMP * 1000)}`);
console.log(`Zero Gas Account: ${walletZeroGas.address}`)
console.log(`Donor Account: ${walletDonor.address}`)
console.log(`Recipient Account: ${recipient}`)
console.log(`Token Balance: ${TokenBalance}`);
console.log(`Zero Gas Nonce: ${NONCE ?? 'not set'}`);
console.log(`Miner Reward: ${MINER_REWARD_IN_WEI.mul(1000).div(ETHER).toNumber() / 1000}`)

async function main() {
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletAuth);
  const engine: Base = new UnstakeAndTransferERC20(provider, walletZeroGas.address, recipient, TokenAddress, StakingAddress, BigNumber.from(TokenBalance), NONCE);

  const zeroGasTxs = await engine.getZeroGasPriceTx();
  const donorTx = await engine.getDonorTx(MINER_REWARD_IN_WEI);

  const bundleTransactions: Array<FlashbotsBundleTransaction> = [
    ...zeroGasTxs.map(transaction => {
      return {
        transaction,
        signer: walletZeroGas,
      }
    }),
    {
      transaction: donorTx,
      signer: walletDonor
    }
  ]
  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions)
  await printTransactions(bundleTransactions, signedBundle);
  const gasPrice = await checkSimulation(flashbotsProvider, signedBundle, SIMULATE_TIMESTAMP);
  console.log(`Gas Price: ${gasPriceToGwei(gasPrice)} gwei`)
  console.log(await engine.description())

  if (DRY_RUN) {
    console.log(`Dry run ended`);
    process.exit(0);
  }

  provider.on('block', async (blockNumber) => {
    try {
      console.log(`[${blockNumber}] New block seen`)
      const gasPrice = await checkSimulation(flashbotsProvider, signedBundle);
      const targetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
      console.log(`[${blockNumber}] Sending bundle with gas price ${gasPriceToGwei(gasPrice)} gwei`)
      const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
      const bundleResolution = await bundleResponse.wait()
      if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
        console.log(`[${blockNumber}] Included in ${targetBlockNumber}!`)
        process.exit(0)
      } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
        console.log(`[${blockNumber}] Not included in ${targetBlockNumber}`)
      } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
        console.log(`[${blockNumber}] Nonce too high for ${targetBlockNumber}`)
      }
    } catch (err) {
      console.log(`[${blockNumber}] Error processing`, err);
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
