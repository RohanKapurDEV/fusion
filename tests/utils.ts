import { MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  Signer,
} from "@solana/web3.js";

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export const initNewTokenMint = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  wallet: Keypair,
  decimals: number = 8
) => {
  const mintAccount = new Keypair();
  const transaction = new Transaction();
  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance = await connection.getMinimumBalanceForRentExemption(MintLayout.span);

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(Token.createInitMintInstruction(TOKEN_PROGRAM_ID, mintAccount.publicKey, decimals, owner, null));
  await sendAndConfirmTransaction(connection, transaction, [wallet, mintAccount], {
    commitment: "confirmed",
  });
  return {
    mintAccount,
  };
};

export const createIngredientMints = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  wallet: Keypair,
  amount: number = 2
) => {
  const ingredientMints: PublicKey[] = [];
  await Promise.all(
    Array(amount)
      .fill(0)
      .map(async (x) => {
        const { mintAccount } = await initNewTokenMint(connection, owner, wallet, 0);
        ingredientMints.push(mintAccount.publicKey);
      })
  );
  return ingredientMints;
};

export const createAssociatedTokenAccount = async (
  connection: Connection,
  owner: Keypair,
  mint: PublicKey,
  tokenAccount: PublicKey
) => {
  const transaction = new Transaction();

  transaction.add(
    Token.createAssociatedTokenAccountInstruction(
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint,
      tokenAccount,
      owner.publicKey,
      owner.publicKey
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [owner], {
    commitment: "confirmed",
  });

  return tokenAccount;
};

export const mintTokensToAccount = async (
  connection: Connection,
  amount: number,
  mint: PublicKey,
  recipient: PublicKey,
  mint_authority: PublicKey,
  multiSigners: Signer[],
  signers: Keypair[]
) => {
  let transaction = new Transaction();

  transaction.add(
    Token.createMintToInstruction(TOKEN_PROGRAM_ID, mint, recipient, mint_authority, multiSigners, amount)
  );

  await sendAndConfirmTransaction(connection, transaction, signers, {
    commitment: "confirmed",
  });
};

export const createIngredients = (mintArray: PublicKey[], amountArray: number[], burnAll: boolean) => {
  let ingredients: IngredientType[] = [];

  mintArray.forEach((mint, index) => {
    ingredients.push({
      mint: mint,
      amount: amountArray[index],
      burnOnCraft: burnAll,
    });
  });

  return ingredients;
};

export const createOutputItems = (mintArray: PublicKey[], amountArray: number[]) => {
  let outputItems: OutputItemType[] = [];

  mintArray.forEach((mint, index) => {
    outputItems.push({
      mint: mint,
      amount: amountArray[index],
    });
  });

  return outputItems;
};

export interface IngredientType {
  mint: PublicKey;
  amount: number;
  burnOnCraft: boolean;
}
export interface OutputItemType {
  mint: PublicKey;
  amount: number;
}

export const createItemMints = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  wallet: Keypair,
  amount: number = 2
) => {
  const itemMints: PublicKey[] = [];
  await Promise.all(
    Array(amount)
      .fill(0)
      .map(async (x) => {
        const { mintAccount } = await initNewTokenMint(connection, owner, wallet, 0);
        itemMints.push(mintAccount.publicKey);
      })
  );
  return itemMints;
};
