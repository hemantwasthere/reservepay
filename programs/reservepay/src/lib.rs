// Anchor's `Error` exceeds 128 bytes, which trips clippy::result_large_err on
// every handler; allow it crate-wide instead of per-function.
#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU");

const BPS_SCALE: u64 = 10_000;
const MAX_PROTECTION_WINDOW: i64 = 30 * 24 * 60 * 60;

#[program]
pub mod reservepay {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        resolver: Pubkey,
        default_reserve_bps: u16,
    ) -> Result<()> {
        require!(
            default_reserve_bps <= BPS_SCALE as u16,
            ReservePayError::InvalidReserveRate
        );
        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.resolver = resolver;
        protocol.default_reserve_bps = default_reserve_bps;
        protocol.bump = ctx.bumps.protocol;
        emit!(ProtocolInitialized {
            authority: protocol.authority,
            resolver,
            default_reserve_bps,
        });
        Ok(())
    }

    pub fn register_merchant(ctx: Context<RegisterMerchant>) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.authority = ctx.accounts.authority.key();
        merchant.mint = ctx.accounts.mint.key();
        merchant.reserve_vault = ctx.accounts.reserve_vault.key();
        merchant.reserve_bps = ctx.accounts.protocol.default_reserve_bps;
        merchant.locked_liability = 0;
        merchant.total_volume = 0;
        merchant.completed_orders = 0;
        merchant.refunded_orders = 0;
        merchant.bump = ctx.bumps.merchant;
        emit!(MerchantRegistered {
            merchant: merchant.key(),
            authority: merchant.authority,
            mint: merchant.mint,
            reserve_bps: merchant.reserve_bps,
        });
        Ok(())
    }

    pub fn fund_reserve(ctx: Context<FundReserve>, amount: u64) -> Result<()> {
        require!(amount > 0, ReservePayError::InvalidAmount);
        token::transfer(ctx.accounts.transfer_context(), amount)?;
        emit!(ReserveFunded {
            merchant: ctx.accounts.merchant.key(),
            amount,
        });
        Ok(())
    }

    pub fn create_order(
        ctx: Context<CreateOrder>,
        reference: [u8; 16],
        amount: u64,
        protection_window: i64,
    ) -> Result<()> {
        require!(amount > 0, ReservePayError::InvalidAmount);
        require!(
            protection_window > 0 && protection_window <= MAX_PROTECTION_WINDOW,
            ReservePayError::InvalidProtectionWindow
        );
        let reserve_amount = amount
            .checked_mul(ctx.accounts.merchant.reserve_bps as u64)
            .and_then(|value| value.checked_add(BPS_SCALE - 1))
            .and_then(|value| value.checked_div(BPS_SCALE))
            .ok_or(ReservePayError::MathOverflow)?;
        let merchant_amount = amount
            .checked_sub(reserve_amount)
            .ok_or(ReservePayError::MathOverflow)?;
        let required_coverage = ctx
            .accounts
            .merchant
            .locked_liability
            .checked_add(amount)
            .ok_or(ReservePayError::MathOverflow)?;
        let available_coverage = ctx
            .accounts
            .reserve_vault
            .amount
            .checked_add(reserve_amount)
            .ok_or(ReservePayError::MathOverflow)?;
        require!(
            available_coverage >= required_coverage,
            ReservePayError::InsufficientCoverage
        );
        if merchant_amount > 0 {
            token::transfer(ctx.accounts.merchant_payment_context(), merchant_amount)?;
        }
        if reserve_amount > 0 {
            token::transfer(ctx.accounts.reserve_payment_context(), reserve_amount)?;
        }
        let now = Clock::get()?.unix_timestamp;
        let order = &mut ctx.accounts.order;
        order.merchant = ctx.accounts.merchant.key();
        order.buyer = ctx.accounts.buyer.key();
        order.buyer_token_account = ctx.accounts.buyer_token_account.key();
        order.reference = reference;
        order.amount = amount;
        order.reserve_amount = reserve_amount;
        order.created_at = now;
        order.expires_at = now
            .checked_add(protection_window)
            .ok_or(ReservePayError::MathOverflow)?;
        order.status = OrderStatus::Open;
        order.bump = ctx.bumps.order;
        let merchant = &mut ctx.accounts.merchant;
        merchant.locked_liability = required_coverage;
        emit!(OrderCreated {
            order: order.key(),
            merchant: merchant.key(),
            buyer: order.buyer,
            reference,
            amount,
            reserve_amount,
            expires_at: order.expires_at,
        });
        Ok(())
    }

    pub fn complete_order(ctx: Context<CompleteOrder>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let caller = ctx.accounts.caller.key();
        require!(
            caller == ctx.accounts.protocol.resolver || now >= ctx.accounts.order.expires_at,
            ReservePayError::OrderStillProtected
        );
        require!(
            ctx.accounts.order.status == OrderStatus::Open,
            ReservePayError::OrderClosed
        );
        let signer_seeds: &[&[u8]] = &[
            b"merchant",
            ctx.accounts.merchant.authority.as_ref(),
            ctx.accounts.merchant.mint.as_ref(),
            &[ctx.accounts.merchant.bump],
        ];
        if ctx.accounts.order.reserve_amount > 0 {
            token::transfer(
                ctx.accounts.release_context().with_signer(&[signer_seeds]),
                ctx.accounts.order.reserve_amount,
            )?;
        }
        let amount = ctx.accounts.order.amount;
        let merchant = &mut ctx.accounts.merchant;
        merchant.locked_liability = merchant
            .locked_liability
            .checked_sub(amount)
            .ok_or(ReservePayError::MathOverflow)?;
        merchant.total_volume = merchant
            .total_volume
            .checked_add(amount)
            .ok_or(ReservePayError::MathOverflow)?;
        merchant.completed_orders = merchant
            .completed_orders
            .checked_add(1)
            .ok_or(ReservePayError::MathOverflow)?;
        ctx.accounts.order.status = OrderStatus::Completed;
        emit!(OrderCompleted {
            order: ctx.accounts.order.key(),
            merchant: merchant.key(),
            amount,
        });
        Ok(())
    }

    pub fn refund_order(ctx: Context<RefundOrder>) -> Result<()> {
        require!(
            ctx.accounts.order.status == OrderStatus::Open,
            ReservePayError::OrderClosed
        );
        let signer_seeds: &[&[u8]] = &[
            b"merchant",
            ctx.accounts.merchant.authority.as_ref(),
            ctx.accounts.merchant.mint.as_ref(),
            &[ctx.accounts.merchant.bump],
        ];
        let amount = ctx.accounts.order.amount;
        token::transfer(
            ctx.accounts.refund_context().with_signer(&[signer_seeds]),
            amount,
        )?;
        let merchant = &mut ctx.accounts.merchant;
        merchant.locked_liability = merchant
            .locked_liability
            .checked_sub(amount)
            .ok_or(ReservePayError::MathOverflow)?;
        merchant.total_volume = merchant
            .total_volume
            .checked_add(amount)
            .ok_or(ReservePayError::MathOverflow)?;
        merchant.refunded_orders = merchant
            .refunded_orders
            .checked_add(1)
            .ok_or(ReservePayError::MathOverflow)?;
        ctx.accounts.order.status = OrderStatus::Refunded;
        emit!(OrderRefunded {
            order: ctx.accounts.order.key(),
            merchant: merchant.key(),
            buyer: ctx.accounts.order.buyer,
            amount,
        });
        Ok(())
    }

    pub fn withdraw_reserve(ctx: Context<WithdrawReserve>, amount: u64) -> Result<()> {
        require!(amount > 0, ReservePayError::InvalidAmount);
        let remaining = ctx
            .accounts
            .reserve_vault
            .amount
            .checked_sub(amount)
            .ok_or(ReservePayError::InsufficientCoverage)?;
        require!(
            remaining >= ctx.accounts.merchant.locked_liability,
            ReservePayError::InsufficientCoverage
        );
        let signer_seeds: &[&[u8]] = &[
            b"merchant",
            ctx.accounts.merchant.authority.as_ref(),
            ctx.accounts.merchant.mint.as_ref(),
            &[ctx.accounts.merchant.bump],
        ];
        token::transfer(
            ctx.accounts.withdraw_context().with_signer(&[signer_seeds]),
            amount,
        )?;
        emit!(ReserveWithdrawn {
            merchant: ctx.accounts.merchant.key(),
            amount,
        });
        Ok(())
    }

    pub fn set_merchant_reserve_rate(
        ctx: Context<SetMerchantReserveRate>,
        reserve_bps: u16,
    ) -> Result<()> {
        require!(
            reserve_bps <= BPS_SCALE as u16,
            ReservePayError::InvalidReserveRate
        );
        ctx.accounts.merchant.reserve_bps = reserve_bps;
        emit!(MerchantReserveRateChanged {
            merchant: ctx.accounts.merchant.key(),
            reserve_bps,
        });
        Ok(())
    }

    pub fn set_resolver(ctx: Context<SetResolver>, resolver: Pubkey) -> Result<()> {
        ctx.accounts.protocol.resolver = resolver;
        emit!(ResolverChanged { resolver });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = authority, space = 8 + Protocol::INIT_SPACE, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = authority, space = 8 + Merchant::INIT_SPACE, seeds = [b"merchant", authority.key().as_ref(), mint.key().as_ref()], bump)]
    pub merchant: Account<'info, Merchant>,
    #[account(init, payer = authority, associated_token::mint = mint, associated_token::authority = merchant)]
    pub reserve_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundReserve<'info> {
    #[account(seeds = [b"merchant", authority.key().as_ref(), merchant.mint.as_ref()], bump = merchant.bump, has_one = authority, has_one = reserve_vault)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut, token::mint = merchant.mint, token::authority = authority)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> FundReserve<'info> {
    fn transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.source.to_account_info(),
                to: self.reserve_vault.to_account_info(),
                authority: self.authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(reference: [u8; 16])]
pub struct CreateOrder<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"merchant", merchant.authority.as_ref(), mint.key().as_ref()], bump = merchant.bump, has_one = mint, has_one = reserve_vault)]
    pub merchant: Box<Account<'info, Merchant>>,
    #[account(init, payer = buyer, space = 8 + Order::INIT_SPACE, seeds = [b"order", merchant.key().as_ref(), reference.as_ref()], bump)]
    pub order: Box<Account<'info, Order>>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = merchant.authority)]
    pub merchant_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub reserve_vault: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateOrder<'info> {
    fn merchant_payment_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.buyer_token_account.to_account_info(),
                to: self.merchant_token_account.to_account_info(),
                authority: self.buyer.to_account_info(),
            },
        )
    }

    fn reserve_payment_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.buyer_token_account.to_account_info(),
                to: self.reserve_vault.to_account_info(),
                authority: self.buyer.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct CompleteOrder<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"merchant", merchant.authority.as_ref(), merchant.mint.as_ref()], bump = merchant.bump, has_one = reserve_vault)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut, has_one = merchant)]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = merchant.mint, token::authority = merchant.authority)]
    pub merchant_token_account: Account<'info, TokenAccount>,
    pub caller: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> CompleteOrder<'info> {
    fn release_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reserve_vault.to_account_info(),
                to: self.merchant_token_account.to_account_info(),
                authority: self.merchant.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct RefundOrder<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = resolver)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"merchant", merchant.authority.as_ref(), merchant.mint.as_ref()], bump = merchant.bump, has_one = reserve_vault)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut, has_one = merchant, has_one = buyer_token_account)]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = merchant.mint, token::authority = order.buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub resolver: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> RefundOrder<'info> {
    fn refund_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reserve_vault.to_account_info(),
                to: self.buyer_token_account.to_account_info(),
                authority: self.merchant.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct WithdrawReserve<'info> {
    #[account(seeds = [b"merchant", authority.key().as_ref(), merchant.mint.as_ref()], bump = merchant.bump, has_one = authority, has_one = reserve_vault)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = merchant.mint, token::authority = authority)]
    pub destination: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawReserve<'info> {
    fn withdraw_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reserve_vault.to_account_info(),
                to: self.destination.to_account_info(),
                authority: self.merchant.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct SetMerchantReserveRate<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub merchant: Account<'info, Merchant>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetResolver<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Account<'info, Protocol>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub authority: Pubkey,
    pub resolver: Pubkey,
    pub default_reserve_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub reserve_vault: Pubkey,
    pub reserve_bps: u16,
    pub locked_liability: u64,
    pub total_volume: u64,
    pub completed_orders: u64,
    pub refunded_orders: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Order {
    pub merchant: Pubkey,
    pub buyer: Pubkey,
    pub buyer_token_account: Pubkey,
    pub reference: [u8; 16],
    pub amount: u64,
    pub reserve_amount: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub status: OrderStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum OrderStatus {
    Open,
    Completed,
    Refunded,
}

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub resolver: Pubkey,
    pub default_reserve_bps: u16,
}

#[event]
pub struct MerchantRegistered {
    pub merchant: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub reserve_bps: u16,
}

#[event]
pub struct ReserveFunded {
    pub merchant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrderCreated {
    pub order: Pubkey,
    pub merchant: Pubkey,
    pub buyer: Pubkey,
    pub reference: [u8; 16],
    pub amount: u64,
    pub reserve_amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct OrderCompleted {
    pub order: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub merchant: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ReserveWithdrawn {
    pub merchant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MerchantReserveRateChanged {
    pub merchant: Pubkey,
    pub reserve_bps: u16,
}

#[event]
pub struct ResolverChanged {
    pub resolver: Pubkey,
}

#[error_code]
pub enum ReservePayError {
    #[msg("The amount must be greater than zero")]
    InvalidAmount,
    #[msg("The reserve rate must be between zero and 10,000 basis points")]
    InvalidReserveRate,
    #[msg("The protection window is outside the supported range")]
    InvalidProtectionWindow,
    #[msg("The merchant reserve cannot cover all open orders")]
    InsufficientCoverage,
    #[msg("The protection window is still open")]
    OrderStillProtected,
    #[msg("The order has already been resolved")]
    OrderClosed,
    #[msg("A numeric operation overflowed")]
    MathOverflow,
}
