import { JsonRpcProvider, yoctoToNear } from "near-api-js";

export async function getNearBalance(accountId: string): Promise<{
  accountId: string;
  balanceYocto: string;
  balanceNear: string;
}> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  const provider = new JsonRpcProvider({
    url: `https://rpc.${networkId}.near.org`,
  });

  const state = await provider.viewAccount({ accountId });
  const balanceYocto = (state.amount - state.locked).toString();

  return {
    accountId,
    balanceYocto,
    balanceNear: yoctoToNear(balanceYocto),
  };
}
