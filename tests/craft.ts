import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";
import {
  createIngredientMints,
  initNewTokenMint,
  createIngredients,
  createOutputItems,
  createAssociatedTokenAccount,
  mintTokensToAccount,
} from "./utils";

const textEncoder = new TextEncoder();

describe("craft", async () => {
  const provider = anchor.Provider.env();
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Crafting;
  // Account that pays to create the formula
  const payer = anchor.web3.Keypair.generate();
  // Account that crafts the formula using their token accounts
  const crafter = anchor.web3.Keypair.generate();

  // The mintAuthority for the formula's ingredients - 2-to-1 formula
  const mintAuthority = anchor.web3.Keypair.generate();
  let ingredientMintA: PublicKey, ingredientMintB: PublicKey, outputMint: PublicKey, outputToken: Token;
  let formulaKp: Keypair;

  // Crafter's token accounts for IngredientMintA & IngredientMintB
  const tokenAccountArray = [anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];
  // Crafter's token account for OutputItem
  const outputTokenAccount = anchor.web3.Keypair.generate();

  // Set up a formula to craft in main test block
  before("Create a 2-to-1 formula", async () => {
    // Airdrop lamports to payer & crafter
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(crafter.publicKey, 10_000_000_000),
      "confirmed"
    );

    // Create ingredient mints
    [ingredientMintA, ingredientMintB] = await createIngredientMints(
      provider.connection,
      mintAuthority.publicKey,
      payer,
      2
    );

    // Create output mint
    const { mintAccount } = await initNewTokenMint(provider.connection, payer.publicKey, payer, 0);
    outputMint = mintAccount.publicKey;
    outputToken = new Token(provider.connection, outputMint, TOKEN_PROGRAM_ID, payer);

    const ingredients = createIngredients([ingredientMintA, ingredientMintB], [1, 1], true);
    const outputItems = createOutputItems([outputMint], [1]);

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
    formulaKp = formulaKeypair;
  });

  it("Craft the formula", async () => {
    // Recreate the ngredients and outputItems for reference
    const ingredients = createIngredients([ingredientMintA, ingredientMintB], [1, 1], true);
    const outputItems = createOutputItems([outputMint], [1]);

    const ingredientTokenAccounts: PublicKey[] = [];

    // Create ingredient ATAs for crafter
    ingredients.forEach(async (ingredient, index) => {
      let token_account = await createAssociatedTokenAccount(
        provider.connection,
        crafter,
        ingredient.mint,
        tokenAccountArray[index].publicKey
      );

      ingredientTokenAccounts.push(token_account);
    });

    // Create output item ATAs for crafter
    let outputItemTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      crafter,
      outputItems[0].mint,
      outputTokenAccount.publicKey
    );

    // Mint the right amount of ingredient tokens to the crafter's ATAs
    ingredients.forEach(async (ingredient, index) => {
      await mintTokensToAccount(
        provider.connection,
        ingredient.amount,
        ingredient.mint,
        ingredientTokenAccounts[index],
        mintAuthority.publicKey,
        [mintAuthority],
        [mintAuthority]
      );
    });

    const [outMintPda, outBump] = await PublicKey.findProgramAddress(
      [textEncoder.encode("crafting"), formulaKp.publicKey.toBuffer()],
      program.programId
    );

    let remainingAccounts: AccountMeta[] = [];

    ingredients.forEach((ingredient, index) => {
      // Push crafter's ingredient ATAs
      remainingAccounts.push({
        pubkey: ingredientTokenAccounts[index],
        isWritable: true,
        isSigner: true,
      });

      // Push ingredient mints
      remainingAccounts.push({
        pubkey: ingredient.mint,
        isWritable: false,
        isSigner: false,
      });
    });

    // Push output item token account
    remainingAccounts.push({
      pubkey: outputItemTokenAccount,
      isWritable: true,
      isSigner: false,
    });

    outputItems.forEach((item) => {
      // Push output Item mints
      remainingAccounts.push({
        pubkey: item.mint,
        isSigner: false,
        isWritable: true,
      });
    });

    await program.rpc.craft(outBump, {
      accounts: {
        formula: formulaKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts,
      signers: [crafter, mintAuthority],
    });
  });
});
