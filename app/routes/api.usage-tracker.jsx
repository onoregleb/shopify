import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * This endpoint tracks usage of the Try-On feature
 * It's called each time a customer uses the virtual try-on functionality
 */
export async function action({ request }) {
  // Only accept POST requests for tracking usage
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get the request body
    const body = await request.json();
    const { productId } = body;
    
    if (!productId) {
      return json({ error: "Missing required parameter: productId" }, { status: 400 });
    }

    // Get current subscription information
    const response = await admin.graphql(
      `#graphql
        query getSubscription {
          currentAppInstallation {
            activeSubscriptions {
              id
              lineItems {
                id
              }
            }
          }
        }
      `
    );
    
    const data = await response.json();
    const activeSubscription = data?.data?.currentAppInstallation?.activeSubscriptions?.[0];
    
    if (!activeSubscription) {
      return json({ error: "No active subscription found" }, { status: 400 });
    }

    // Record usage for the subscription
    const subscriptionId = activeSubscription.id;
    const lineItemId = activeSubscription.lineItems[0].id;
    
    // Record this usage in our database to track against limits
    const usage = await prisma.tryOnUsage.create({
      data: {
        shop,
        productId,
        timestamp: new Date(),
        subscriptionId
      }
    });

    // Calculate current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usageCount = await prisma.tryOnUsage.count({
      where: {
        shop,
        timestamp: {
          gte: startOfMonth
        }
      }
    });

    // Record usage with Shopify
    await admin.graphql(
      `#graphql
        mutation createUsageRecord($subscriptionLineItemId: ID!, $description: String!, $quantity: Int!) {
          appUsageRecordCreate(
            subscriptionLineItemId: $subscriptionLineItemId
            description: $description
            quantity: 1
          ) {
            appUsageRecord {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          subscriptionLineItemId: lineItemId,
          description: `Virtual Try-On for product ${productId}`,
          quantity: 1
        }
      }
    );

    return json({ 
      success: true, 
      usageCount, 
      usageId: usage.id 
    });

  } catch (error) {
    console.error("Error tracking usage:", error);
    return json({ error: "Failed to track usage" }, { status: 500 });
  }
}

// Get the current usage stats for the store
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Calculate current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usageCount = await prisma.tryOnUsage.count({
      where: {
        shop,
        timestamp: {
          gte: startOfMonth
        }
      }
    });

    // Get the subscription details to determine limits
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
        query getSubscriptionDetails {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
            }
          }
        }
      `
    );
    
    const data = await response.json();
    const activeSubscription = data?.data?.currentAppInstallation?.activeSubscriptions?.[0];
    
    // Determine usage limit based on plan name
    let usageLimit = 100; // Default to lowest tier
    if (activeSubscription) {
      if (activeSubscription.name.includes("Runway")) {
        usageLimit = 500;
      } else if (activeSubscription.name.includes("High Fashion")) {
        usageLimit = 2000;
      }
    }

    return json({
      usageCount,
      usageLimit,
      percentageUsed: (usageCount / usageLimit) * 100,
      subscriptionName: activeSubscription?.name || "No active subscription"
    });
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
} 