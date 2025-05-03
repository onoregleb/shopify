import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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
    
    // Verify session token
    // This would be more robust in a production app
    // For now, we'll just check that it's not empty
    
    // Get settings for the shop associated with this session
    try {
      // In a real implementation, you would verify the session token
      // and get the shop ID from it
      
      // Get the default settings or previously saved settings
      // In a production app, you would load this from a database
      const settings = {
        buttonText: "Try On Virtually",
        buttonPosition: "below_add_to_cart",
        isEnabled: true
      };
      
      return json(settings);
    } catch (error) {
      console.error("API Error retrieving button settings:", error);
      return json({ error: "Failed to retrieve settings" }, { status: 500 });
    }
  } catch (error) {
    console.error("API Button Settings Error:", error);
    return json({ error: "Server error" }, { status: 500 });
  }
}

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
    
    // Verify session token and get associated shop
    // In a real implementation, you would verify the token
    
    // Parse the request body
    const requestBody = await request.json();
    
    // Save the settings
    // In a production app, you would save this to a database
    // For this implementation, we'll just return success
    
    return json({ 
      success: true, 
      buttonText: requestBody.buttonText,
      buttonPosition: requestBody.buttonPosition,
      isEnabled: requestBody.isEnabled
    });
  } catch (error) {
    console.error("API Button Settings Error:", error);
    return json({ error: "Server error" }, { status: 500 });
  }
} 