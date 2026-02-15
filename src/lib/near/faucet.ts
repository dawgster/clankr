import { Account, JsonRpcProvider, nearToYocto, teraToGas } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { decryptPrivateKey } from "./account";

const FAUCET_CONTRACT_ID = "v2.faucet.nonofficial.testnet";
const FAUCET_AMOUNT = nearToYocto("1");

export async function requestFaucetFunds(opts: {
  accountId: string;
  encryptedPrivateKey: string;
}): Promise<{ transactionHash: string }> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  if (networkId !== "testnet") {
    throw new Error("Faucet is only available on testnet");
  }

  const privateKey = decryptPrivateKey(opts.encryptedPrivateKey);

  const provider = new JsonRpcProvider({
    url: `https://rpc.${networkId}.near.org`,
  });

  const account = new Account(
    opts.accountId,
    provider,
    privateKey as KeyPairString,
  );

  console.log("[faucet] requesting funds for", opts.accountId, "amount", FAUCET_AMOUNT.toString());

  const result = await account.callFunctionRaw({
    contractId: FAUCET_CONTRACT_ID,
    methodName: "request_near",
    args: {
      receiver_id: opts.accountId,
      request_amount: FAUCET_AMOUNT.toString(),
    },
    gas: teraToGas("30"),
    deposit: BigInt(0),
  });

  return {
    transactionHash: result.transaction_outcome.id,
  };
}
