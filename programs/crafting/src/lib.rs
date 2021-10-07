pub mod token_metadata_utils;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, burn, mint_to, set_authority, Burn, MintTo, SetAuthority};

// Program ID
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crafting {
    use super::*;

    pub fn create_formula<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, CreateFormula<'info>>,
        ingredients: Vec<Ingredient>,
        output_items: Vec<Item>,
        bump: u8, // Run `find_program_address` offchain for canonical bump
    ) -> ProgramResult {
        let formula = &mut ctx.accounts.formula;
        formula.ingredients = ingredients;
        let mut new_output_items = output_items.clone();

        let output_authority_seeds = &[
            &"crafting".as_bytes(),
            &formula.to_account_info().key.to_bytes()[..32],
            &[bump],
        ];

        // Hand over control of the mint account to PDA
        let pda_pubkey = Pubkey::create_program_address(
            output_authority_seeds,
            &ctx.program_id,
        )?;

        let account_iter = &mut ctx.remaining_accounts.iter();

        for (index, item) in output_items.iter().enumerate() {
            let output_mint = next_account_info(account_iter)?;

            if item.is_master_edition {
                msg!("item.is_master_edition");
                let cur_master_edition_holder = next_account_info(account_iter)?;
                let program_master_token_acct = next_account_info(account_iter)?;

                // Validate the SPL Token program owns the accounts
                if *program_master_token_acct.owner != anchor_spl::token::ID || *cur_master_edition_holder.owner != anchor_spl::token::ID {
                    return Err(ProgramError::InvalidAccountData.into())
                }
                // validate the program_master_token_acct is owned by the output_authority
                let owner = token::accessor::authority(program_master_token_acct)?;
                if owner != pda_pubkey {
                    return Err(ErrorCode::TokenAccountOwnerMustBeOutputMintAuthority.into())
                }

                // Transfer the MasterEdition token
                let cpi_accounts = token::Transfer {
                    from: cur_master_edition_holder.clone(),
                    to: program_master_token_acct.clone(),
                    authority: ctx.accounts.authority.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), cpi_accounts);
                token::transfer(cpi_ctx, 1)?;

                // Update the master_token_account on item so it is correct
                new_output_items[index].master_token_account = *program_master_token_acct.key;

            } else {
                // If the item isn't a master edition, simply transfer mint authority to the PDA
                let cpi_accounts = SetAuthority {
                    account_or_mint: output_mint.clone(),
                    current_authority: ctx.accounts.authority.to_account_info().clone(),
                };
    
                let cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), cpi_accounts);
                set_authority(cpi_ctx, AuthorityType::MintTokens.into(), Some(pda_pubkey))?;    
            }

        }
        formula.output_items = new_output_items;
        Ok(())
    }

    pub fn craft<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Craft<'info>>,
        bump: u8,
    ) -> ProgramResult {
        let formula = &ctx.accounts.formula;
        let expected_remaining = formula.ingredients.len() * 2 + formula.output_items.len() * 2;
        let accounts_info_iter = &mut ctx.remaining_accounts.iter();

        msg!("remaining accounts length {:?}", ctx.remaining_accounts.len());
        // if ctx.remaining_accounts.len() != expected_remaining {
        //     return Err(ErrorCode::InvalidRemainingAccountsLength.into());
        // }

        for ingredient in formula.ingredients.iter() {
            let ingredient_token = next_account_info(accounts_info_iter)?;
            let ingredient_mint = next_account_info(accounts_info_iter)?;

            // these accounts are unchecked...check them
            if *ingredient_token.owner != anchor_spl::token::ID || *ingredient_mint.owner != anchor_spl::token::ID {
                return Err(ProgramError::InvalidAccountData.into())
            }
            let token_mint = token::accessor::mint(ingredient_token)?;
            let token_amount = token::accessor::amount(ingredient_token)? as u8;
            let token_authority = token::accessor::authority(ingredient_token)?;

            // Validate token mint
            if token_mint != ingredient.mint {
                return Err(ErrorCode::InvalidMint.into());
            }

            // Validate token balance
            if token_amount < ingredient.amount {
                return Err(ErrorCode::InvalidAmount.into());
            }

            // Validate token authority is signer
            if token_authority != *ctx.accounts.authority.key {
                return Err(ErrorCode::InvalidAuthority.into());
            }

            // If burn is true, burn the tokens
            if ingredient.burn_on_craft {
                let cpi_ctx = CpiContext::new(
                    ctx.accounts.token_program.clone(),
                    Burn {
                        mint: ingredient_mint.clone(),
                        to: ingredient_token.clone(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                );
                burn(cpi_ctx, ingredient.amount as u64)?;
            }
        }

        // Derive PDA signer
        let seeds = &[
            &"crafting".as_bytes(),
            &formula.to_account_info().key.to_bytes()[..32],
            &[bump],
        ];
        let signer = &[&seeds[..]];

        for item in formula.output_items.iter() {
            // handle case where the output Item is a master edition
            if item.is_master_edition {
                msg!("Item is a master edition! Print that mother F@#!$");
                token_metadata_utils::mint_new_edition_cpi(
                    accounts_info_iter,
                    &ctx.accounts.authority.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    &ctx.accounts.rent.to_account_info(),
                    signer
                )?;
            } else {
                let output_item_token = next_account_info(accounts_info_iter)?;
                let output_item_mint = next_account_info(accounts_info_iter)?;

                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone(),
                    MintTo {
                        mint: output_item_mint.clone(),
                        authority: ctx.accounts.pda_auth.clone(),
                        to: output_item_token.clone(),
                    },
                    signer,
                );
                mint_to(cpi_ctx, item.amount as u64)?;
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(
    ingredients: Vec<Ingredient>,
    output_items: Vec<Item>
)]
pub struct CreateFormula<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        // The 8 is to account for anchors hash prefix
        // The 4 is for the u32 Vec::len
        space = 8 + 4 + std::mem::size_of::<Ingredient>() * ingredients.len() as usize + 4 + std::mem::size_of::<Item>() * output_items.len() as usize
    )]
    pub formula: Account<'info, Formula>,
    /// The PDA that controls the out minting and transfering
    pub output_authority: AccountInfo<'info>,

    // Misc accounts
    pub system_program: Program<'info, System>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Craft<'info> {
    pub formula: Account<'info, Formula>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"crafting", &formula.to_account_info().key.to_bytes()[..32]],
        bump = bump
    )]
    pub pda_auth: AccountInfo<'info>,

    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>
}

#[account]
pub struct Formula {
    // Vector of <Ingredient> objects required to satisy the formula
    // Each <Ingredient> item is 33 bytes
    pub ingredients: Vec<Ingredient>,
    // Vector of <Item> objects to be minted on craft
    pub output_items: Vec<Item>,
}

/// Size: 32 + 1 + 1 = 34 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Ingredient {
    /// Pubkey of the ingredient's token mint
    pub mint: Pubkey,
    /// Amount of the token required to satisy the creation of the ingredient
    pub amount: u8,
    /// Option that burns the ingredient when crafting
    pub burn_on_craft: bool,
}

/// Size: 32 + 1 + 1 + 32 = 66 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Item {
    /// Pubkey of the item's token mint
    pub mint: Pubkey,
    /// Amount of the token that will be minted on craft
    pub amount: u8,
    /// Boolean indicating whether or not output mint is a MasterEdition
    pub is_master_edition: bool,
    // TODO: This could be removed if using a PDA
    /// The key for the token account that holds the master edition token
    pub master_token_account: Pubkey,
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

#[error]
pub enum ErrorCode {
    #[msg("Invalid remaining accounts length")]
    InvalidRemainingAccountsLength,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid token amount")]
    InvalidAmount,
    #[msg("Invalid token authority")]
    InvalidAuthority,
    #[msg("TokenAccount must be owned by the output mint authority PDA")]
    TokenAccountOwnerMustBeOutputMintAuthority
}
