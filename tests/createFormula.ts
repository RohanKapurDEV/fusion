import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";
import { createIngredientMints, initNewTokenMint } from "./utils";

const textEncoder = new TextEncoder();

describe("create_formula", () => {
  const provider = anchor.Provider.env();
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Crafting;
  const payer = anchor.web3.Keypair.generate();

  // The mintAuthority for the ingredients (2-to-1 crafting)
  const mintAuthority = anchor.web3.Keypair.generate();
  let ingredientMintA: PublicKey, ingredientMintB: PublicKey, outputMint: PublicKey, outputToken: Token;

  // The mintAuthority for the ingredients (4-to-6 crafting)
  const mintAuthorityOne = anchor.web3.Keypair.generate();
  let ingredientMintOne: PublicKey,
    ingredientMintTwo: PublicKey,
    ingredientMintThree: PublicKey,
    ingredientMintFour: PublicKey;
  let outputMintOne: PublicKey, outputTokenOne: Token, outputMintTwo: PublicKey, outputTokenTwo: Token;
  let outputMintThree: PublicKey, outputTokenThree: Token, outputMintFour: PublicKey, outputTokenFour: Token;
  let outputMintFive: PublicKey, outputTokenFive: Token, outputMintSix: PublicKey, outputTokenSix: Token;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
  });

  describe("Two to one crafting", () => {
    before(async () => {
      // create the initial 2 mints (not owned by the user)
      [ingredientMintA, ingredientMintB] = await createIngredientMints(
        provider.connection,
        mintAuthority.publicKey,
        payer,
        2
      );
      // create the 1 output mint which is owned by the user
      const { mintAccount } = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0);
      outputMint = mintAccount.publicKey;
      outputToken = new Token(provider.connection, outputMint, TOKEN_PROGRAM_ID, payer);
    });

    it("should create a Formula and transfer the mint authority for output items", async () => {
      const ingredients = [
        {
          mint: ingredientMintA,
          amount: 1,
          burnOnCraft: true,
        },
        {
          mint: ingredientMintB,
          amount: 1,
          burnOnCraft: true,
        },
      ];
      const outputItems = [
        {
          mint: outputMint,
          amount: 1,
        },
      ];

      const remainingAccounts: AccountMeta[] = outputItems.map((x) => ({
        pubkey: x.mint,
        isWritable: true,
        isSigner: false,
      }));
      const expectedFormula = {
        ingredients,
        outputItems,
      };
      // Generate new keypair for the Formula account
      const formulaKeypair = anchor.web3.Keypair.generate();

      const [outMintPda, outBump] = await PublicKey.findProgramAddress(
        [textEncoder.encode("crafting"), formulaKeypair.publicKey.toBuffer()],
        program.programId
      );

      await program.rpc.createFormula(
        expectedFormula.ingredients.length,
        expectedFormula.outputItems.length,
        expectedFormula.ingredients,
        expectedFormula.outputItems,
        outBump,
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

      // Validate the Formula gets created and stored on chain properly
      const formula = await program.account.formula.fetch(formulaKeypair.publicKey);
      expect(formula).to.eql(expectedFormula);

      // Vaidate the mint authority for the output items gets transfered to the formula
      await Promise.all(
        expectedFormula.outputItems.map(async (outputItem) => {
          const token = new Token(provider.connection, outputItem.mint, TOKEN_PROGRAM_ID, payer);
          const outputMintAfter = await token.getMintInfo();
          assert.ok(outputMintAfter.mintAuthority?.equals(outMintPda));
        })
      );
    });
  });

  describe("Four to six crafting", () => {
    before(async () => {
      // create the initial 4 mints (not owned by the user)
      [ingredientMintOne, ingredientMintTwo, ingredientMintThree, ingredientMintFour] = await createIngredientMints(
        provider.connection,
        mintAuthorityOne.publicKey,
        payer,
        4
      );

      // create the 6 output mint which is owned by the user
      const mintAccountOne = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintOne = mintAccountOne.publicKey;
      outputTokenOne = new Token(provider.connection, outputMintOne, TOKEN_PROGRAM_ID, payer);
      const mintAccountTwo = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintTwo = mintAccountTwo.publicKey;
      outputTokenTwo = new Token(provider.connection, outputMintTwo, TOKEN_PROGRAM_ID, payer);
      const mintAccountThree = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintThree = mintAccountThree.publicKey;
      outputTokenThree = new Token(provider.connection, outputMintThree, TOKEN_PROGRAM_ID, payer);
      const mintAccountFour = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintFour = mintAccountFour.publicKey;
      outputTokenFour = new Token(provider.connection, outputMintFour, TOKEN_PROGRAM_ID, payer);
      const mintAccountFive = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintFive = mintAccountFive.publicKey;
      outputTokenFive = new Token(provider.connection, outputMintFive, TOKEN_PROGRAM_ID, payer);
      const mintAccountSix = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0).then(
        (_) => _.mintAccount
      );
      outputMintSix = mintAccountSix.publicKey;
      outputTokenSix = new Token(provider.connection, outputMintSix, TOKEN_PROGRAM_ID, payer);
    });

    it("should create a Formula and transfer the mint authority for output items", async () => {
      const ingredients = [
        {
          mint: ingredientMintOne,
          amount: 1,
          burnOnCraft: true,
        },
        {
          mint: ingredientMintTwo,
          amount: 1,
          burnOnCraft: true,
        },
        {
          mint: ingredientMintThree,
          amount: 1,
          burnOnCraft: true,
        },
        {
          mint: ingredientMintFour,
          amount: 1,
          burnOnCraft: true,
        },
      ];

      const outputItems = [
        {
          mint: outputMintOne,
          amount: 1,
        },
        {
          mint: outputMintTwo,
          amount: 1,
        },
        {
          mint: outputMintThree,
          amount: 1,
        },
        {
          mint: outputMintFour,
          amount: 1,
        },
        {
          mint: outputMintFive,
          amount: 1,
        },
        {
          mint: outputMintSix,
          amount: 1,
        },
      ];

      const remainingAccounts: AccountMeta[] = outputItems.map((x) => ({
        pubkey: x.mint,
        isWritable: true,
        isSigner: false,
      }));

      const expectedFormula = {
        ingredients,
        outputItems,
      };

      // Generate new keypair for the Formula account
      const formulaKeypair = anchor.web3.Keypair.generate();

      const [outMintPda, outBump] = await PublicKey.findProgramAddress(
        [textEncoder.encode("crafting"), formulaKeypair.publicKey.toBuffer()],
        program.programId
      );

      await program.rpc.createFormula(
        expectedFormula.ingredients.length,
        expectedFormula.outputItems.length,
        expectedFormula.ingredients,
        expectedFormula.outputItems,
        outBump,
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

      // Validate the Formula gets created and stored on chain properly
      const formula = await program.account.formula.fetch(formulaKeypair.publicKey);
      expect(formula).to.eql(expectedFormula);

      // Vaidate the mint authority for the output items gets transfered to the formula
      await Promise.all(
        expectedFormula.outputItems.map(async (outputItem) => {
          const token = new Token(provider.connection, outputItem.mint, TOKEN_PROGRAM_ID, payer);
          const outputMintAfter = await token.getMintInfo();
          assert.ok(outputMintAfter.mintAuthority?.equals(outMintPda));
        })
      );
    });
  });

  describe("One to one crafting, metaplex edition outputs", () => {
    // Create a formula where the Ingredient has an associated Metadata account
    // and the output is a MasterEdition that can mint new Editions
  });
});
