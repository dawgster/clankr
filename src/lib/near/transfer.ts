import { Account, JsonRpcProvider, nearToYocto } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { decryptPrivateKey } from "./account";

export async function transferNear(opts: {
  senderAccountId: string;
  senderEncryptedPrivateKey: string;
  receiverAccountId: string;
  amount: string; // NEAR amount, e.g. "0.5"
}): Promise<{
  transactionHash: string;
  senderAccountId: string;
  receiverAccountId: string;
  amountYocto: string;
}> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  const privateKey = decryptPrivateKey(opts.senderEncryptedPrivateKey);

  const provider = new JsonRpcProvider({
    url: `https://rpc.${networkId}.near.org`,
  });

  const account = new Account(
    opts.senderAccountId,
    provider,
    privateKey as KeyPairString,
  );

  const amountYocto = nearToYocto(Number(opts.amount));
  const result = await account.transfer({
    receiverId: opts.receiverAccountId,
    amount: amountYocto,
  });

  return {
    transactionHash: result.transaction_outcome.id,
    senderAccountId: opts.senderAccountId,
    receiverAccountId: opts.receiverAccountId,
    amountYocto: amountYocto.toString(),
  };
}
