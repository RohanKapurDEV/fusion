import { PublicKey } from "@solana/web3.js";

export type Ingredient = {
  mint: PublicKey;
  amount: number;
  burnOnCraft: boolean;
};

export type Item = {
  mint: PublicKey;
  amount: number;
  isMasterEdition: boolean;
};

export type Formula = {
  ingredients: Ingredient[];
  outputItems: Item[];
};
