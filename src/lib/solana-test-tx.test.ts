import { describe, expect, it } from "vitest";
import { INCINERATOR, b58decode, toB64, zeroTransferTx } from "./solana-test-tx";

// Vecteurs produits par @solana/web3.js 1.98 :
// new Transaction({ feePayer, recentBlockhash }).add(SystemProgram.transfer({ lamports: 0 }))
//   .serialize({ requireAllSignatures: false, verifySignatures: false })
const ME = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const SELF =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAECZ1IFXCCz6dh0Zlbd9zhVUH+Hq22HUj5Mdqf6NglqmesAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMxJDpKM0uOHO7ND/JXaMxecpg9Nv0bCw26RKZ1V1Oa5AQECAAAMAgAAAAAAAAAAAAAA";
const EXTERNAL =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDZ1IFXCCz6dh0Zlbd9zhVUH+Hq22HUj5Mdqf6NglqmesAM5ByjTQRYHm9yRG//wDb1E0uzcz3nKbhADjhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzEkOkozS44c7s0P8ldozF5ymD02/RsLDbpEpnVXU5rkBAgIAAQwCAAAAAAAAAAAAAAA=";

describe("transactions de test Turnkey", () => {
  it("auto-virement 0 SOL identique à @solana/web3.js", () =>
    expect(toB64(zeroTransferTx(ME, ME, BLOCKHASH))).toBe(SELF));
  it("virement externe 0 SOL identique à @solana/web3.js", () =>
    expect(toB64(zeroTransferTx(ME, INCINERATOR, BLOCKHASH))).toBe(EXTERNAL));
  it("décode les zéros de tête base58", () => {
    const k = b58decode(INCINERATOR);
    expect(k.length).toBe(32);
    expect(k[0]).toBe(0);
  });
  it("refuse une adresse invalide", () => {
    expect(() => zeroTransferTx("abc", ME, BLOCKHASH)).toThrow(/invalide/);
    expect(() => zeroTransferTx("0OIl", ME, BLOCKHASH)).toThrow(/invalide/);
  });
});
