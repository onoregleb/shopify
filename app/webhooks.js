import { PrismaClient } from "@prisma/client";
import { authenticate } from "./shopify.server";

const prisma = new PrismaClient();

export const handleWebhooks = async (topic, shop, body) => {
  const payload = JSON.parse(body);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Handle app uninstallation
      if (shop) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;

    case "APP_SUBSCRIPTIONS_UPDATE":
      // Handle subscription updates
      await handleSubscriptionUpdate(topic, shop, payload);
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // Handle GDPR data requests
      // These should be implemented properly for privacy compliance
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
      break;
  }

  return { success: true };
};

async function handleSubscriptionUpdate(topic, shop, payload) {
  try {
    console.log(`Processing subscription update for ${shop}`);
    
    // The subscription ID from the webhook payload
    const subscriptionId = payload.app_subscription.id;
    const subscriptionStatus = payload.app_subscription.status;
    
    console.log(`Subscription ${subscriptionId} status: ${subscriptionStatus}`);

    // Determine the type of event
    let eventType = "updated";
    if (payload.app_subscription.admin_graphql_api_id && !payload.app_subscription.cancelled_on) {
      eventType = "created";
    } else if (payload.app_subscription.cancelled_on) {
      eventType = "cancelled";
    } else if (subscriptionStatus === "EXPIRED") {
      eventType = "expired";
    } else if (subscriptionStatus === "ACTIVE" && payload.app_subscription.created_at !== payload.app_subscription.updated_at) {
      eventType = "renewed";
    }

    // Record the subscription event
    await prisma.subscriptionEvent.create({
      data: {
        shop,
        subscriptionId,
        event: eventType,
        status: subscriptionStatus
      }
    });

    // Update the button settings based on subscription status
    const isEnabled = subscriptionStatus === "ACTIVE";
    
    // When a subscription is activated or updated, update the app settings
    if (subscriptionStatus === "ACTIVE") {
      // Get the admin API access
      const session = await prisma.session.findFirst({
        where: { shop },
      });
      
      if (!session?.accessToken) {
        console.error("No session found for shop:", shop);
        return;
      }

      // Update the button settings to enable/disable features based on subscription
      await prisma.buttonSettings.upsert({
        where: { shop },
        update: {
          isEnabled: true,
        },
        create: {
          shop,
          buttonText: "Try On Virtually",
          buttonPosition: "below_add_to_cart",
          isEnabled: true,
        }
      });

      // Обновляем лимиты и кредиты при активации подписки
      let limit = 100;
      let planName = payload.app_subscription.name || "Trend";
      if (planName.includes("Runway")) limit = 500;
      if (planName.includes("High Fashion")) limit = 2000;
      await prisma.usageLimit.upsert({
        where: { shop },
        update: { limit, planName },
        create: { shop, limit, planName }
      });
      await prisma.credits.upsert({
        where: { shop },
        update: { amount: limit },
        create: { shop, amount: limit }
      });
    } else if (subscriptionStatus === "CANCELLED" || subscriptionStatus === "EXPIRED") {
      // Disable features when subscription is cancelled
      await prisma.buttonSettings.updateMany({
        where: { shop },
        data: { isEnabled: false }
      });
    }
    
    console.log(`Successfully processed subscription update for ${shop}`);
    return { success: true };
  } catch (error) {
    console.error("Error handling subscription update:", error);
    return { success: false, error: error.message };
  }
} 