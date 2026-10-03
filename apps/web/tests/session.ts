import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api } from "../convex/_generated/api";
import { signInMessage } from "../src/lib/sign-in";

export const TEST_DOMAIN = "localhost:4173";

export async function signIn(
  t: ReturnType<typeof convexTest>,
  keypair: Keypair,
  domain: string = TEST_DOMAIN,
) {
  const wallet = keypair.publicKey.toBase58();
  const challenge = await t.action(api.authActions.requestNonce, { wallet });
  const signature = bs58.encode(
    nacl.sign.detached(
      signInMessage({ ...challenge, wallet, domain }),
      keypair.secretKey,
    ),
  );
  return t.action(api.authActions.signIn, {
    ...challenge,
    wallet,
    domain,
    signature,
  });
}
