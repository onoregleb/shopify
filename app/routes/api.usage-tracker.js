import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function action({ request }) {
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
    
    // Parse the request body
    const { productId } = await request.json();
    
    if (!productId) {
      return json({ error: "Missing product ID" }, { status: 400 });
    }
    
    console.log(`Usage Tracker: Virtual try-on used for product ${productId}`);
    
    // In a real implementation, you would:
    // 1. Verify the session token
    // 2. Find the associated shop
    // 3. Log the usage in the database
    // 4. Update usage metrics for billing
    
    // For now, we'll simulate success
    return json({
      success: true,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("API Usage Tracker Error:", error);
    return json({ error: "Server error" }, { status: 500 });
  }
} 