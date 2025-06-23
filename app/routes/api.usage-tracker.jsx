const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://test-modera.myshopify.com",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * This endpoint tracks usage of the Try-On feature
 * It's called each time a customer uses the virtual try-on functionality
 */
export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: CORS_HEADERS }
    );
  }

  try {
    // Get the request body
    const body = await request.json();
    const { productId, shop } = body;
    
    if (!productId || !shop) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: productId or shop" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Получаем актуальный subscriptionId (chargeId) для магазина
    const subscription = await prisma.subscription.findFirst({ where: { shop } });
    if (!subscription || !subscription.chargeId) {
      return new Response(
        JSON.stringify({ error: "No active subscription found for this shop" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const subscriptionId = subscription.chargeId;

    // Проверяем кредиты
    const credits = await prisma.credits.findUnique({ where: { shop } });
    if (!credits || credits.amount <= 0) {
      return new Response(
        JSON.stringify({ error: "No credits left" }),
        { status: 402, headers: CORS_HEADERS }
      );
    }
    // Списываем кредит
    await prisma.credits.update({
      where: { shop },
      data: { amount: { decrement: 1 } }
    });

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

    return new Response(
      JSON.stringify({ success: true, usageCount, usageId: usage.id }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Error tracking usage:", error);
    return new Response(
      JSON.stringify({ error: "Failed to track usage" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// Get the current usage stats for the store
export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

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