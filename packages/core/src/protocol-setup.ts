// Pure decision behind apps/web/scripts/setup-protocol.ts. Initializing is
// permissionless (the first caller becomes the authority), but changing an
// existing protocol requires its authority wallet.

export type ProtocolState = { authority: string; resolver: string };

export type ProtocolSetupPlan =
  | { action: "init"; resolver: string }
  | { action: "set-resolver"; resolver: string }
  | { action: "noop" };

export function planProtocolSetup(
  current: ProtocolState | null,
  wallet: string,
  flags: { resolver?: string } = {},
): ProtocolSetupPlan {
  if (!current) return { action: "init", resolver: flags.resolver ?? wallet };
  if (wallet !== current.authority)
    throw new Error("Wallet is not the protocol authority");
  const resolver = flags.resolver ?? current.resolver;
  return resolver === current.resolver
    ? { action: "noop" }
    : { action: "set-resolver", resolver };
}
