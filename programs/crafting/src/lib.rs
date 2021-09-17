use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint};

// Program ID
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crafting {
    use super::*;

    pub fn create(
        ctx: Context<Create>,
        items: Vec<Ingredient>,
        reversible: bool,
        _space_multiple: u16, // Effectively just the number of ingredients in the formula
    ) -> ProgramResult {
        let formula = &mut ctx.accounts.formula;
        formula.items = items;
        formula.output_mint = *ctx.accounts.output_mint.to_account_info().key;
        formula.reversible = reversible;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_space_multiple: u16)]
pub struct Create<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 1 + 33 * _space_multiple as usize)]
    pub formula: Account<'info, Formula>,

    pub output_mint: Account<'info, Mint>,

    #[account(signer)]
    pub authority: AccountInfo<'info>,

    // System program account
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Formula {
    // Vector of <Ingredient> items required to satisy the formula
    // Each <Ingredient> item is 33 bytes
    pub items: Vec<Ingredient>,
    // Pubkey of the mint of the formula
    pub output_mint: Pubkey,
    // Is formula reversible
    pub reversible: bool,
}

/// Size: 32 + 1 = 33 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Ingredient {
    // Pubkey of the ingredient's token mint
    pub mint: Pubkey,
    // Amount of the token required to satisy the "creation" of the ingredient
    pub amount: u8,
}
