import { json } from "@remix-run/node";
import { getSessionByShop } from "../shopify.server"; // Получаем сессию из БД
import { prisma } from "../db.server"; // Импортируем prisma

export const loader = async ({ request }) => {
  console.log("Billing Callback: Processing callback");

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const shop = url.searchParams.get("shop");

  if (!chargeId || !shop) {
    return json({ error: "Missing charge_id or shop" }, { status: 400 });
  }

  try {
    // 1. Получаем сохранённую сессию из БД
    const session = await getSessionByShop(shop);
    const accessToken = session.accessToken;

    if (!accessToken) {
      throw new Error("No access token found for shop: " + shop);
    }

    // 2. Формируем URL для GraphQL запроса
    const graphqlUrl = `https://${shop}/admin/api/2025-01/graphql.json`;

    // 3. Делаем прямой GraphQL-запрос к Shopify Admin API
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          mutation appSubscriptionActivateV2($subscriptionId: ID!) {
            appSubscriptionActivateV2(id: $subscriptionId) {
              appSubscription {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          subscriptionId: chargeId,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to activate subscription:", errorText);
      return json({ error: "Network error when calling Shopify API" }, { status: 500 });
    }

    const data = await response.json();

    // Проверяем на наличие ошибок
    if (data?.errors) {
      console.error("GraphQL errors:", data.errors);
      return json({ error: "GraphQL error", details: data.errors }, { status: 500 });
    }

    const activationResult = data.data.appSubscriptionActivateV2;

    if (activationResult.userErrors && activationResult.userErrors.length > 0) {
      console.error("User errors:", activationResult.userErrors);
      return json(
        { error: "Failed to activate subscription", details: activationResult.userErrors },
        { status: 400 }
      );
    }

    console.log("✅ Subscription activated successfully:", activationResult);

    // После успешной активации подписки обновляем лимиты и кредиты
    if (activationResult.appSubscription?.status === "ACTIVE") {
      let limit = 100;
      let planName = activationResult.appSubscription?.name || "Trend";
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
    }

    // Возвращаем HTML для закрытия окна
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Subscription Activated</title>
          <script>
            window.opener.postMessage({ type: 'subscription-activated', success: true }, '*');
            window.close();
          </script>
        </head>
        <body>
          <p>Subscription activated successfully. You can close this window.</p>
        </body>
      </html>`,
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  } catch (error) {
    console.error("🚨 Billing Callback Error:", error.message);
    return json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
};