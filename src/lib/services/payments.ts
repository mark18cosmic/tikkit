export type WalletPayResult = { status: 'paid'; reference: string } | { status: 'cancelled' | 'unavailable' };

export interface WalletPayService {
  isAvailable(): Promise<boolean>;
  pay(amountMinor: number, currency: string, label: string): Promise<WalletPayResult>;
}

// Stub until a payment provider (e.g. Stripe) is chosen. When unavailable,
// checkout must fall back to card entry rather than block.
export const walletPayService: WalletPayService = {
  async isAvailable() {
    return false;
  },
  async pay() {
    return { status: 'unavailable' };
  },
};
