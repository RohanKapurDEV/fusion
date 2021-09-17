use anchor_lang::prelude::*;
use anchor_spl::token::{self, set_authority, Mint, SetAuthority};

// Program ID
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crafting {
    use super::*;

    pub fn create(
        ctx: Context<Create>,
        items: Vec<Ingredient>,
        reversible: bool,
        bump: u8,             // Run `find_program_address` offchain for canonical bump
        _space_multiple: u16, // The number of ingredients in the formula
    ) -> ProgramResult {
        let formula = &mut ctx.accounts.formula;
        formula.items = items;
        formula.output_mint = *ctx.accounts.output_mint.to_account_info().key;
        formula.reversible = reversible;

        // Hand over control of the mint account to PDA
        let pda_pubkey = Pubkey::create_program_address(
            &[
                &"crafting".as_bytes(),
                &formula.to_account_info().key.to_bytes()[..32],
                &[bump],
            ],
            &ctx.program_id,
        )?;

        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.output_mint.to_account_info().clone(),
            current_authority: ctx.accounts.authority.clone(),
        };

        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), cpi_accounts);
        set_authority(cpi_ctx, AuthorityType::MintTokens.into(), Some(pda_pubkey))?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_space_multiple: u16)]
pub struct Create<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 1 + 33 * _space_multiple as usize)]
    pub formula: Account<'info, Formula>,

    #[account(mut)]
    pub output_mint: Account<'info, Mint>,

    #[account(signer)]
    pub authority: AccountInfo<'info>,

    // System program account
    pub system_program: Program<'info, System>,

    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
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
