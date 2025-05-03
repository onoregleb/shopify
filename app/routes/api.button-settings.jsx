import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This endpoint handles both GET and POST requests for button settings
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Retrieve settings from database
    const settings = await prisma.buttonSettings.findUnique({
      where: { shop },
    });

    // Return settings or default values
    return json({
      buttonText: settings?.buttonText || "Try On Virtually",
      buttonPosition: settings?.buttonPosition || "below_add_to_cart",
      isEnabled: settings?.isEnabled || false,
    });
  } catch (error) {
    console.error("Error fetching button settings:", error);
    return json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    
    // Update or create settings
    await prisma.buttonSettings.upsert({
      where: { shop },
      update: {
        buttonText: body.buttonText,
        buttonPosition: body.buttonPosition,
        isEnabled: body.isEnabled
      },
      create: {
        shop,
        buttonText: body.buttonText || "Try On Virtually",
        buttonPosition: body.buttonPosition || "below_add_to_cart",
        isEnabled: body.isEnabled || false
      }
    });

    return json({ success: true });
  } catch (error) {
    console.error("Error saving button settings:", error);
    return json({ error: "Failed to save settings" }, { status: 500 });
  }
} 