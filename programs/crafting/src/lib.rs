use anchor_lang::prelude::*;
use anchor_spl::token::{self, set_authority, Mint, SetAuthority};

// Program ID
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crafting {
    use super::*;

    pub fn create_formula(
        _ctx: Context<CreateFormula>,
        _ingredients_count: u16, // The number of ingredients in the formula
        _items_count: u16, // The number of items output by the formula
        _ingredients: Vec<Ingredient>,
        _output_items: Vec<Item>,
        // bump: u8,             // Run `find_program_address` offchain for canonical bump
    ) -> ProgramResult {
        // let formula = &mut ctx.accounts.formula;
        // formula.items = items;
        // formula.output_mint = *ctx.accounts.output_mint.to_account_info().key;
        // formula.reversible = reversible;

        // // Hand over control of the mint account to PDA
        // let pda_pubkey = Pubkey::create_program_address(
        //     &[
        //         &"crafting".as_bytes(),
        //         &formula.to_account_info().key.to_bytes()[..32],
        //         &[bump],
        //     ],
        //     &ctx.program_id,
        // )?;

        // let cpi_accounts = SetAuthority {
        //     account_or_mint: ctx.accounts.output_mint.to_account_info().clone(),
        //     current_authority: ctx.accounts.authority.clone(),
        // };

        // let cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), cpi_accounts);
        // set_authority(cpi_ctx, AuthorityType::MintTokens.into(), Some(pda_pubkey))?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(ingredients_count: u16, items_count: u16)]
pub struct CreateFormula<'info> {
    #[account(init,
        payer = authority,
        space = 8 + 32 + 1 + 34 * ingredients_count as usize + 33 * items_count as usize
    )]
    pub formula: Account<'info, Formula>,

    #[account(mut)]
    pub authority: Signer<'info>,

    // System program account
    pub system_program: Program<'info, System>,

    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
}

#[account]
pub struct Formula {
    // Vector of <Ingredient> items required to satisy the formula
    // Each <Ingredient> item is 33 bytes
    pub ingredients: Vec<Ingredient>,
    // Pubkey of the mint of the formula
    pub output_items: Vec<Item>
}

/// Size: 32 + 1 + 1 = 34 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Ingredient {
    /// Pubkey of the ingredient's token mint
    pub mint: Pubkey,
    /// Amount of the token required to satisy the "creation" of the ingredient
    pub amount: u8,
    /// Option that burns the ingredient when crafting
    pub burn_on_craft: bool,
}

/// Size: 32 + 1 = 33 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Item {
    /// Pubkey of the item's token mint
    pub mint: Pubkey,
    /// Amount of the token that will be minted on crat
    pub amount: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum AuthorityType {
    /// Authority to mint new tokens
    MintTokens,
    /// Authority to freeze any account associated with the Mint
    FreezeAccount,
    /// Owner of a given token account
    AccountOwner,
    /// Authority to close a token account
    CloseAccount,
}

impl From<AuthorityType> for spl_token::instruction::AuthorityType {
    fn from(authority_ty: AuthorityType) -> spl_token::instruction::AuthorityType {
        match authority_ty {
            AuthorityType::MintTokens => spl_token::instruction::AuthorityType::MintTokens,
            AuthorityType::FreezeAccount => spl_token::instruction::AuthorityType::FreezeAccount,
            AuthorityType::AccountOwner => spl_token::instruction::AuthorityType::AccountOwner,
            AuthorityType::CloseAccount => spl_token::instruction::AuthorityType::CloseAccount,
        }
    }
}
