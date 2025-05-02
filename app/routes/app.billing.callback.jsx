import { redirect } from "@remix-run/node";
import { getSessionByShop } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  console.log("Billing Callback: Starting callback processing");

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  console.log("Billing Callback: URL parameters:", params);

  const shop = params.shop;
  const chargeId = params.charge_id;
  if (!shop || !chargeId) {
    console.error("Missing required parameters", { shop, charge_id: chargeId });
    return redirect("/app");
  }

  // Build the GID for the subscription
  const subscriptionGID = `gid://shopify/AppSubscription/${chargeId}`;
  console.log(`Looking up subscription with GID: ${subscriptionGID}`);

  try {
    // Retrieve the session and token
    const session = await getSessionByShop(shop);
    if (!session?.accessToken) {
      console.error("Session or accessToken not found for shop:", shop);
      return redirect(`/app?error=session_missing&shop=${shop}`);
    }
    const accessToken = session.accessToken;
    console.log("Billing Callback: Session found for shop:", shop);

    // Query the subscription status (no activation mutation available)
    const graphqlUrl = `https://${shop}/admin/api/2024-07/graphql.json`;
    const query = `
      query getSubscription($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            status
            name
            test
          }
        }
      }
    `;
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { id: subscriptionGID },
      }),
    });

    const text = await response.text();
    console.log(`Raw Shopify API Response Text (Status: ${response.status}):`, text);
    if (!response.ok) {
      console.error("Failed to fetch subscription via Admin API", {
        status: response.status,
        errorText: text,
        shop,
        charge_id: subscriptionGID,
      });
      return redirect(`/app/billing?error=api_fetch_failed&shop=${shop}`);
    }

    const data = JSON.parse(text);
    if (data.errors?.length) {
      console.error("GraphQL errors fetching subscription:", data.errors);
      return redirect(
        `/app/billing?error=graphql_error&details=${encodeURIComponent(
          data.errors[0].message
        )}&shop=${shop}`
      );
    }

    const subscription = data.data.node;
    console.log("Fetched Subscription:", subscription);

    // Update your database record as needed
    // await prisma.subscription.update({ where: { id: chargeId }, data: { status: subscription.status } });

    if (subscription.status === "ACTIVE") {
      console.log(
        `✅ Subscription ${subscription.id} is ACTIVE for shop ${shop}. Name: ${subscription.name}, Test: ${subscription.test}`
      );
    } else {
      console.warn(
        `Subscription ${subscription.id} status is ${subscription.status}.`
      );
    }

    // Redirect the merchant back into the app
    const appUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    console.log(`Redirecting user back to app: ${appUrl}`);
    return redirect(appUrl);
  } catch (error) {
    console.error("🚨 Billing Callback Error:", error);
    return redirect(`/app/billing?error=callback_processing_failed&shop=${shop}`);
  }
};
