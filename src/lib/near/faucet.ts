import { Account, JsonRpcProvider, nearToYocto } from "near-api-js";
import type { KeyPairString } from "near-api-js";

const FUND_AMOUNT = nearToYocto("1");

/**
 * Fund an agent sub-account with testnet NEAR from the parent account.
 */
export async function requestFaucetFunds(opts: {
  agentAccountId: string;
}): Promise<{ transactionHash: string }> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  if (networkId !== "testnet") {
    throw new Error("Funding from parent is only available on testnet");
  }

  const parentAccountId = process.env.NEAR_PARENT_ACCOUNT_ID;
  const parentPrivateKey = process.env.NEAR_PARENT_PRIVATE_KEY;
  if (!parentAccountId || !parentPrivateKey) {
    throw new Error(
      "NEAR_PARENT_ACCOUNT_ID and NEAR_PARENT_PRIVATE_KEY are required",
    );
  }

  const provider = new JsonRpcProvider({
    url: `https://rpc.${networkId}.near.org`,
  });

  const parentAccount = new Account(
    parentAccountId,
    provider,
    parentPrivateKey as KeyPairString,
  );

  const result = await parentAccount.transfer({
    receiverId: opts.agentAccountId,
    amount: FUND_AMOUNT,
  });

  return {
    transactionHash: result.transaction_outcome.id,
  };
}
