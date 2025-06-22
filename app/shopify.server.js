import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { handleWebhooks } from "./webhooks";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.Custom,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: false,
    v3_authenticatePublic: true,
    v3_assetModule: true,
    removeRest: true,
    unstable_jwt: true
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
    },
  },
  isEmbeddedApp: true,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export const getSessionByShop = async (shop) => {
  const session = await prisma.session.findFirst({
    where: { shop },
  });

  if (!session || !session.accessToken) {
    throw new Error("No session found for shop: " + shop);
  }

  return session;
};

// Define subscription plans
export const SUBSCRIPTION_PLANS = {
  TREND: {
    name: "Trend",
    price: "19.99", 
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 100
  },
  RUNWAY: {
    name: "Runway",
    price: "49.99",
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 500
  },
  HIGH_FASHION: {
    name: "High Fashion",
    price: "299.99",
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 2000
  }
};

export async function checkSubscriptionStatus(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query getSubscriptionStatus {
          currentAppInstallation {
            activeSubscriptions {
              id
              status
              name
              currentPeriodEnd
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                  }
                }
              }
            }
          }
        }
      `
    );
    const data = await response.json();
    return data?.data?.currentAppInstallation?.activeSubscriptions?.[0] || null;
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return null;
  }
}