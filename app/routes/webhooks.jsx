import { authenticate } from "../shopify.server";
import { handleWebhooks } from "../webhooks";

export const action = async ({ request }) => {
  const { topic, shop, body } = await authenticate.webhook(request);
  
  try {
    await handleWebhooks(topic, shop, body);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`Error processing webhook ${topic}:`, error);
    return new Response(null, { status: 500 });
  }
}; 