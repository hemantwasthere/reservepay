import { AnchorProvider, setProvider } from "@coral-xyz/anchor";

module.exports = async (provider: AnchorProvider) => {
  setProvider(provider);
};
