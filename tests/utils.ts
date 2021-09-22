import { MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";

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
      mint: mintArray[index],
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
