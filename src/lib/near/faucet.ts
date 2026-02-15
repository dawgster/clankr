import { Account, JsonRpcProvider, nearToYocto, teraToGas } from "near-api-js";
import type { KeyPairString } from "near-api-js";

const FAUCET_CONTRACT_ID = "v2.faucet.nonofficial.testnet";
const FAUCET_AMOUNT = nearToYocto("1");

/**
 * Request testnet NEAR from the faucet for an agent sub-account.
 *
 * The faucet contract rejects sub-accounts (e.g. a-xxx.clankr.testnet)
 * as receiver, so we use the parent account to receive funds and then
 * transfer them to the agent's sub-account.
 */
export async function requestFaucetFunds(opts: {
  agentAccountId: string;
}): Promise<{ transactionHash: string }> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  if (networkId !== "testnet") {
    throw new Error("Faucet is only available on testnet");
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

  // Step 1: Request funds from faucet to parent account
  await parentAccount.callFunctionRaw({
    contractId: FAUCET_CONTRACT_ID,
    methodName: "request_near",
    args: {
      receiver_id: parentAccountId,
      request_amount: FAUCET_AMOUNT.toString(),
    },
    gas: teraToGas("30"),
    deposit: BigInt(0),
  });

  // Step 2: Transfer from parent to agent sub-account
  const result = await parentAccount.transfer({
    receiverId: opts.agentAccountId,
    amount: FAUCET_AMOUNT,
  });

  return {
    transactionHash: result.transaction_outcome.id,
  };
}
