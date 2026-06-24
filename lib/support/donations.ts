export type DonationOption = {
  id: "paypal" | "coffee" | "bitcoin" | "ethereum";
  label: string;
  description: string;
  value: string;
  href?: string;
  kind: "link" | "address";
};

export const DEFAULT_PAYPAL_URL = "https://www.paypal.com/ncp/payment/8JHGP7DSZ28XW";

export function getDonationOptions(env: NodeJS.ProcessEnv = process.env): DonationOption[] {
  const buyMeACoffeeUrl = normalizeEnvValue(env["BUY_ME_A_COFFEE_URL"]);
  const paypalUrl = normalizeEnvValue(env["PAYPAL_URL"]) || DEFAULT_PAYPAL_URL;
  const bitcoinAddress = normalizeEnvValue(env["BITCOIN_ADDRESS"]);
  const ethereumAddress = normalizeEnvValue(env["ETHEREUM_ADDRESS"]);

  const options: Array<DonationOption | null> = [
    paypalUrl
      ? {
          id: "paypal" as const,
          label: "Support via PayPal",
          description: "Support PaperStraw through the primary project donation link.",
          value: paypalUrl,
          href: paypalUrl,
          kind: "link" as const
        }
      : null,
    buyMeACoffeeUrl
      ? {
          id: "coffee" as const,
          label: "Buy me a coffee",
          description: "A small one-time contribution toward hosting, data checks, and maintenance.",
          value: buyMeACoffeeUrl,
          href: buyMeACoffeeUrl,
          kind: "link" as const
        }
      : null,
    bitcoinAddress
      ? {
          id: "bitcoin" as const,
          label: "Bitcoin",
          description: "Use this address if you prefer to support the project with Bitcoin.",
          value: bitcoinAddress,
          href: `bitcoin:${bitcoinAddress}`,
          kind: "address" as const
        }
      : null,
    ethereumAddress
      ? {
          id: "ethereum" as const,
          label: "Ethereum",
          description: "Use this address if you prefer to support the project with Ethereum.",
          value: ethereumAddress,
          kind: "address" as const
        }
      : null
  ];

  return options.filter((option): option is DonationOption => Boolean(option));
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed;
}
