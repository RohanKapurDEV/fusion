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
        formula.output_items = output_items;

        // Hand over control of the mint account to PDA
        let pda_pubkey = Pubkey::create_program_address(
            &[
                &"crafting".as_bytes(),
                &formula.to_account_info().key.to_bytes()[..32],
                &[bump],
            ],
            &ctx.program_id,
        )?;

        // Transfer authority of all output item mints to PDA specific to formula
        for output_mint in ctx.remaining_accounts {
            let cpi_accounts = SetAuthority {
                account_or_mint: output_mint.clone(),
                current_authority: ctx.accounts.authority.to_account_info().clone(),
            };

            let cpi_ctx = CpiContext::new(ctx.accounts.token_program.clone(), cpi_accounts);
            set_authority(cpi_ctx, AuthorityType::MintTokens.into(), Some(pda_pubkey))?;
        }

        Ok(())
    }

    pub fn craft<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Craft<'info>>,
        bump: u8,
    ) -> ProgramResult {
        let formula = &ctx.accounts.formula;

        // ctx.remaining_accounts should be the token and mint accounts for each ingredient
        // and output item. Basically two accounts for each ingredient and output item
        let output_items_flag = formula.ingredients.len() * 2;
        let output_ata_flag = output_items_flag + formula.output_items.len();

        // Split up remaining_accounts into 4 distinct slices
        let ingredient_token_accounts = &ctx.remaining_accounts[..formula.ingredients.len()];
        let ingredient_mint_accounts =
            &ctx.remaining_accounts[formula.ingredients.len()..output_items_flag];
        let output_item_mint_accounts = &ctx.remaining_accounts[output_items_flag..output_ata_flag];
        let output_item_token_accounts = &ctx.remaining_accounts[output_ata_flag..];

        // Enforce the size of the remaining acconuts array
        let expected_remaining = output_items_flag + formula.output_items.len() * 2;
        if ctx.remaining_accounts.len() != expected_remaining {
            return Err(ErrorCode::InvalidLength.into());
        }

        if ingredient_token_accounts.len() != ingredient_mint_accounts.len() {
            return Err(ErrorCode::InvalidLength.into());
        }

        if output_item_token_accounts.len() != output_item_mint_accounts.len() {
            return Err(ErrorCode::InvalidLength.into());
        }

        // For this bit to work, the order in which the Formula account stores ingredients
        // should be reflected in the order of the token and mint accounts passed into
        // the instruction
        for (index, ingredient) in formula.ingredients.iter().enumerate() {
            let ingredient_token = &ingredient_token_accounts[index];
            let ingredient_mint = &ingredient_mint_accounts[index];

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
                token::burn(cpi_ctx, ingredient.amount as u64)?;
            }
        }

        // Derive PDA signer
        let seeds = &[
            &"crafting".as_bytes(),
            &formula.to_account_info().key.to_bytes()[..32],
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Mint output items to user address
        for (index, item) in formula.output_items.iter().enumerate() {
            // Validate mint order and validity
            if item.mint != *output_item_mint_accounts[index].key {
                return Err(ErrorCode::InvalidMint.into());
            }

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                MintTo {
                    mint: output_item_mint_accounts[index].clone(),
                    authority: ctx.accounts.pda_auth.clone(),
                    to: output_item_token_accounts[index].clone(),
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

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Craft<'info> {
    pub formula: Account<'info, Formula>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"crafting", &formula.to_account_info().key.to_bytes()[..32]], bump = bump)]
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
    #[msg("Length of ingredients != number of token accounts")]
    InvalidLength,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid token amount")]
    InvalidAmount,
    #[msg("Invalid token authority")]
    InvalidAuthority,
}
