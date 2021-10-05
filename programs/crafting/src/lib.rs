use anchor_lang::prelude::*;
use anchor_spl::token::{self, burn, mint_to, set_authority, Burn, MintTo, SetAuthority};

// Program ID
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crafting {
    use super::*;

    pub fn create_formula<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, CreateFormula<'info>>,
        _ingredients_count: u16, // The number of ingredients in the formula
        _items_count: u16,       // The number of items output by the formula
        ingredients: Vec<Ingredient>,
        output_items: Vec<Item>,
        bump: u8, // Run `find_program_address` offchain for canonical bump
    ) -> ProgramResult {
        let formula = &mut ctx.accounts.formula;
        formula.ingredients = ingredients;
        formula.output_items = output_items.clone();

        // Hand over control of the mint account to PDA
        let pda_pubkey = Pubkey::create_program_address(
            &[
                &"crafting".as_bytes(),
                &formula.to_account_info().key.to_bytes()[..32],
                &[bump],
            ],
            &ctx.program_id,
        )?;

        let account_iter = &mut ctx.remaining_accounts.iter();

        for item in output_items {
            let output_mint = next_account_info(account_iter)?;

            if item.is_master_edition {
                msg!("item.is_master_edition");
                let cur_master_edition_holder = next_account_info(account_iter)?;
                let program_master_token_acct = next_account_info(account_iter)?;

                // Create the new TokenAccount for the program
                let cpi_ctx = token::InitializeAccount {
                    account: program_master_token_acct.clone(),
                    mint: output_mint.clone(),
                    authority: ctx.accounts.output_authority.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                };
    
                // let auth_cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), auth_cpi_accounts);
                // set_authority(auth_cpi_ctx, AuthorityType::MintTokens.into(), Some(pda_pubkey))?; 

                // let create_cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), create_cpi_accounts);
                // anchor_spl::associated_token::create(create_cpi_ctx)?;

                // let transfer_cpi_accounts = anchor_spl::token::Transfer {
                //     from: cur_master_edition_holder.clone(),
                //     to: program_master_token_acct.clone(),
                //     authority: ctx.accounts.authority.to_account_info(),
                // };

                // let transfer_cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), transfer_cpi_accounts);
                // anchor_spl::token::transfer(transfer_cpi_ctx, 1)?;
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
        Ok(())
    }

    pub fn craft<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Craft<'info>>,
        bump: u8,
    ) -> ProgramResult {
        let formula = &ctx.accounts.formula;
        let expected_remaining = formula.ingredients.len() * 2 + formula.output_items.len() * 2;
        let accounts_info_iter = &mut ctx.remaining_accounts.iter();

        if ctx.remaining_accounts.len() != expected_remaining {
            return Err(ErrorCode::InvalidRemainingAccountsLength.into());
        }

        for ingredient in formula.ingredients.iter() {
            let ingredient_token = next_account_info(accounts_info_iter)?;
            let ingredient_mint = next_account_info(accounts_info_iter)?;

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

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(ingredients_count: u16, items_count: u16)]
pub struct CreateFormula<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 34 * ingredients_count as usize + 33 * items_count as usize
    )]
    pub formula: Account<'info, Formula>,
    /// The PDA that controls the out minting and transfering
    pub output_authority: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

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

/// Size: 32 + 1 = 33 bytes
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Item {
    /// Pubkey of the item's token mint
    pub mint: Pubkey,
    /// Amount of the token that will be minted on craft
    pub amount: u8,
    /// Boolean indicating whether or not output mint is a MasterEdition
    pub is_master_edition: bool
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
}
