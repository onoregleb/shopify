import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function loader({ request }) {
  try {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing or invalid authorization token" }, { status: 401 });
    }
    
    const sessionToken = authHeader.split("Bearer ")[1];
    if (!sessionToken) {
      return json({ error: "Invalid session token format" }, { status: 401 });
    }
    
    // In a real implementation, you would:
    // 1. Verify the session token
    // 2. Find the associated shop
    // 3. Check if the shop has an active subscription
    
    // For now, we'll simulate success
    return json({
      isActive: true,
      subscriptionName: "Trend",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    });
    
  } catch (error) {
    console.error("API Subscription Status Error:", error);
    return json({ error: "Server error", isActive: false }, { status: 500 });
  }
} 