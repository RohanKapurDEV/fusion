import * as anchor from "@project-serum/anchor";
import {
  createMasterEdition,
  createMetadata,
  Creator,
  Data,
} from "./metadata_utils";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Signer,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { assert, expect } from "chai";
import {
  createIngredientMints,
  createIngredients,
  initNewTokenAccountInstructions,
  initNewTokenMint,
} from "./utils";
import { BN } from "@project-serum/anchor";
import { Formula, Ingredient, Item } from "./types";

const textEncoder = new TextEncoder();

describe("create_formula", () => {
  const provider = anchor.Provider.env();
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Crafting;
  const payer = anchor.web3.Keypair.generate();

  // The mintAuthority for the ingredients (2-to-1 crafting)
  const mintAuthority = anchor.web3.Keypair.generate();
  let ingredientMintA: PublicKey,
    ingredientMintB: PublicKey,
    outputMint: PublicKey;

  // The mintAuthority for the ingredients (4-to-6 crafting)
  const mintAuthorityOne = anchor.web3.Keypair.generate();
  let ingredientMintOne: PublicKey,
    ingredientMintTwo: PublicKey,
    ingredientMintThree: PublicKey,
    ingredientMintFour: PublicKey;
  let outputMintOne: PublicKey,
    outputMintTwo: PublicKey,
    outputMintThree: PublicKey,
    outputMintFour: PublicKey,
    outputMintFive: PublicKey,
    outputMintSix: PublicKey;

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
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      );
      outputMint = mintAccount.publicKey;
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
      const outputItems: Item[] = [
        {
          mint: outputMint,
          amount: 1,
          isMasterEdition: false,
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

      const [craftingMintAuthority, craftingMintAuthorityBump] =
        await PublicKey.findProgramAddress(
          [textEncoder.encode("crafting"), formulaKeypair.publicKey.toBuffer()],
          program.programId
        );

      await program.rpc.createFormula(
        expectedFormula.ingredients.length,
        expectedFormula.outputItems.length,
        expectedFormula.ingredients,
        expectedFormula.outputItems,
        craftingMintAuthorityBump,
        {
          accounts: {
            formula: formulaKeypair.publicKey,
            authority: payer.publicKey,
            outputAuthority: craftingMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          },
          remainingAccounts,
          signers: [payer, formulaKeypair],
        }
      );

      // Validate the Formula gets created and stored on chain properly
      const formula = await program.account.formula.fetch(
        formulaKeypair.publicKey
      );
      expect(formula).to.eql(expectedFormula);

      // Vaidate the mint authority for the output items gets transfered to the formula
      await Promise.all(
        expectedFormula.outputItems.map(async (outputItem) => {
          const token = new Token(
            provider.connection,
            outputItem.mint,
            TOKEN_PROGRAM_ID,
            payer
          );
          const outputMintAfter = await token.getMintInfo();
          assert.ok(
            outputMintAfter.mintAuthority?.equals(craftingMintAuthority)
          );
        })
      );
    });
  });

  describe("Four to six crafting", () => {
    before(async () => {
      // create the initial 4 mints (not owned by the user)
      [
        ingredientMintOne,
        ingredientMintTwo,
        ingredientMintThree,
        ingredientMintFour,
      ] = await createIngredientMints(
        provider.connection,
        mintAuthorityOne.publicKey,
        payer,
        4
      );

      // create the 6 output mint which is owned by the user
      const mintAccountOne = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintOne = mintAccountOne.publicKey;
      const mintAccountTwo = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintTwo = mintAccountTwo.publicKey;
      const mintAccountThree = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintThree = mintAccountThree.publicKey;
      const mintAccountFour = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintFour = mintAccountFour.publicKey;
      const mintAccountFive = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintFive = mintAccountFive.publicKey;
      const mintAccountSix = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      ).then((_) => _.mintAccount);
      outputMintSix = mintAccountSix.publicKey;
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

      const outputItems: Item[] = [
        {
          mint: outputMintOne,
          amount: 1,
          isMasterEdition: false,
        },
        {
          mint: outputMintTwo,
          amount: 1,
          isMasterEdition: false,
        },
        {
          mint: outputMintThree,
          amount: 1,
          isMasterEdition: false,
        },
        {
          mint: outputMintFour,
          amount: 1,
          isMasterEdition: false,
        },
        {
          mint: outputMintFive,
          amount: 1,
          isMasterEdition: false,
        },
        {
          mint: outputMintSix,
          amount: 1,
          isMasterEdition: false,
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

      const [craftingMintAuthority, craftingMintAuthorityBump] =
        await PublicKey.findProgramAddress(
          [textEncoder.encode("crafting"), formulaKeypair.publicKey.toBuffer()],
          program.programId
        );

      await program.rpc.createFormula(
        expectedFormula.ingredients.length,
        expectedFormula.outputItems.length,
        expectedFormula.ingredients,
        expectedFormula.outputItems,
        craftingMintAuthorityBump,
        {
          accounts: {
            formula: formulaKeypair.publicKey,
            authority: payer.publicKey,
            outputAuthority: craftingMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          },
          remainingAccounts,
          signers: [payer, formulaKeypair],
        }
      );

      // Validate the Formula gets created and stored on chain properly
      const formula = await program.account.formula.fetch(
        formulaKeypair.publicKey
      );
      expect(formula).to.eql(expectedFormula);

      // Vaidate the mint authority for the output items gets transfered to the formula
      await Promise.all(
        expectedFormula.outputItems.map(async (outputItem) => {
          const token = new Token(
            provider.connection,
            outputItem.mint,
            TOKEN_PROGRAM_ID,
            payer
          );
          const outputMintAfter = await token.getMintInfo();
          assert.ok(
            outputMintAfter.mintAuthority?.equals(craftingMintAuthority)
          );
        })
      );
    });
  });

  describe("Single output as a metaplex Edition", () => {
    let masterToken: Token,
      masterEditionHolder: PublicKey,
      ingredientMintA: PublicKey,
      ingredientMintB: PublicKey;
    beforeEach(async () => {
      // Prior to creating the formula, a user must interact with the Token-Metadata contract
      //  to create MasterEditions for all the outputs

      // Create new mint for the output
      const { mintAccount: outputMint } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      );
      masterToken = new Token(
        provider.connection,
        outputMint.publicKey,
        TOKEN_PROGRAM_ID,
        payer
      );
      // Instruction to Metaplex's Token-Metadata contract to create a new metadata account
      const instructions: TransactionInstruction[] = [];
      const metadataAccount = await createMetadata(
        new Data({
          symbol: "SYM",
          name: "Name",
          uri: " ".repeat(64), // size of url for arweave
          sellerFeeBasisPoints: 50,
          creators: [
            new Creator({
              address: payer.publicKey.toString(),
              verified: true,
              share: 100,
            }),
          ],
        }),
        payer.publicKey,
        outputMint.publicKey,
        payer.publicKey,
        instructions,
        payer.publicKey
      );
      masterEditionHolder = await masterToken.createAssociatedTokenAccount(
        payer.publicKey
      );
      // Mint one to the user
      instructions.push(
        Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          outputMint.publicKey,
          masterEditionHolder,
          payer.publicKey,
          [],
          1
        )
      );
      // Instruction to `create_master_edition` on the metadata
      const maxSupply = undefined;
      const { mintAccount: masterEdition } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer,
        0
      );
      await createMasterEdition(
        maxSupply !== undefined ? new BN(maxSupply) : undefined,
        outputMint.publicKey,
        payer.publicKey,
        payer.publicKey,
        payer.publicKey,
        instructions
      );
      const tx = new Transaction();
      instructions.forEach((ix) => tx.add(ix));
      const txid = await sendAndConfirmTransaction(provider.connection, tx, [
        payer,
      ]);

      // Create ingredient mints
      [ingredientMintA, ingredientMintB] = await createIngredientMints(
        provider.connection,
        mintAuthority.publicKey,
        payer,
        2
      );
    });

    it("should create new Formula with the output mint", async () => {
      const ingredients: Ingredient[] = createIngredients(
        [ingredientMintA, ingredientMintB],
        [1, 1],
        true
      );
      const outputItems: Item[] = [
        {
          mint: masterToken.publicKey,
          amount: 1,
          isMasterEdition: true,
        },
      ];
      const formula: Formula = {
        ingredients,
        outputItems,
      };

      // Generate new keypair for the Formula account
      const formulaKeypair = anchor.web3.Keypair.generate();

      const [craftingMintAuthority, craftingMintAuthorityBump] =
        await PublicKey.findProgramAddress(
          [textEncoder.encode("crafting"), formulaKeypair.publicKey.toBuffer()],
          program.programId
        );

      const remainingAccounts: AccountMeta[] = [],
        masterTokenAccounts: PublicKey[] = [];
      let instructions: TransactionInstruction[] = [],
        signers: Signer[] = [];
      const starterPromise = Promise.resolve(null);
      await outputItems.reduce(async (accumulator, item) => {
        await accumulator;
        // Push the output mint
        remainingAccounts.push({
          pubkey: item.mint,
          isWritable: true,
          isSigner: false,
        });

        if (item.isMasterEdition) {
          // If the output is a Metaplex MasterEdition we need to push the TokenAccount holding the current MasterEdition
          remainingAccounts.push({
            pubkey: masterEditionHolder,
            isWritable: true,
            isSigner: false,
          });
          // Create the master TokenAccount for the program...this could be
          //  moved inside the instruction but we've decided to offload to the client for now.
          const {
            transaction,
            signers: newTokenAccountSigners,
            tokenAccount: masterTokenAccount,
          } = await initNewTokenAccountInstructions(
            program.provider.connection,
            craftingMintAuthority,
            masterToken.publicKey,
            provider.wallet.publicKey
          );
          instructions = [...instructions, ...transaction.instructions];
          signers = [...signers, ...newTokenAccountSigners];
          // We also need to push the new TokenAccount that the program controls
          remainingAccounts.push({
            pubkey: masterTokenAccount.publicKey,
            isWritable: true,
            isSigner: false,
          });
          // Store the master token account so we can test
          masterTokenAccounts.push(masterTokenAccount.publicKey);
        }
        return null;
      }, starterPromise);

      try {
        await program.rpc.createFormula(
          formula.ingredients.length,
          formula.outputItems.length,
          formula.ingredients,
          formula.outputItems,
          craftingMintAuthorityBump,
          {
            accounts: {
              formula: formulaKeypair.publicKey,
              authority: payer.publicKey,
              outputAuthority: craftingMintAuthority,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            },
            remainingAccounts,
            instructions: instructions ? instructions : undefined,
            signers: [payer, formulaKeypair, ...signers],
          }
        );
      } catch (err) {
        console.error(err);
        throw err;
      }

      assert.ok(true);

      // Validate that the program now controls the MasterEdition token
      await Promise.all(
        masterTokenAccounts.map(async (masterTokenAccount) => {
          const programMasterTokenInfo = await masterToken.getAccountInfo(
            masterTokenAccount
          );
          assert.ok(programMasterTokenInfo.amount.eqn(1));
        })
      );

      // Validate that the original masterEditionHolder no longer has it
      const oldHolerInfo = await masterToken.getAccountInfo(
        masterEditionHolder
      );
      assert.ok(oldHolerInfo.amount.eqn(0));
    });
  });
});
