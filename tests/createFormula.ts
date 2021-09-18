import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, PublicKey, SystemProgram } from "@solana/web3.js";
import {assert, expect} from 'chai';
import { createIngredientMints, initNewTokenMint } from "./utils";


describe('create_formula', () => {

  const provider = anchor.Provider.env();
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Crafting;
  const payer = anchor.web3.Keypair.generate();
  // The mintAuthority for the ingredients
  const mintAuthority = anchor.web3.Keypair.generate();
  let ingredientMintA: PublicKey, ingredientMintB: PublicKey, outputMint: PublicKey;
  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
  })

  describe("Two to one crafting", () => {
    before(async () => {
      // create the initial 2 mints (not owned by the user)
      [ingredientMintA, ingredientMintB] = await createIngredientMints(
        provider.connection,
        mintAuthority.publicKey,
        payer,
        2
      );
      // TODO: create the 1 output mint which is owned by the user
      const {mintAccount} = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      );
      outputMint = mintAccount.publicKey
    })
    it('should create a Formula', async () => {
      const ingredients = [{
        mint: ingredientMintA,
        amount: 1,
        burnOnCraft: true
      },
      {
        mint: ingredientMintB,
        amount: 1,
        burnOnCraft: true
      }];
      const outputItems = [{
        mint: outputMint,
        amount: 1
      }]

      const remainingAccounts: AccountMeta[] = outputItems.map(x => ({
        pubkey: x.mint,
        isWritable: true,
        isSigner: false
      }))
      const formulaKeypair = anchor.web3.Keypair.generate();
      const expectedFormula = {
        ingredients,
        outputItems, 
      }

      await program.rpc.createFormula(
        expectedFormula.ingredients.length,
        expectedFormula.outputItems.length,
        expectedFormula.ingredients,
        expectedFormula.outputItems,
        {
          accounts: {
            formula: formulaKeypair.publicKey,
            authority: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          },
          remainingAccounts,
          signers: [payer, formulaKeypair],
        }
      );
      let formula = await program.account.formula.fetch(formulaKeypair.publicKey)
      expect(formula).to.eql(expectedFormula)
    });
  })

});
