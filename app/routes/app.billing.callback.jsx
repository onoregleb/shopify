// app/routes/app.billing.callback.jsx

import { getSessionByShop } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { json } from "@remix-run/node";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  console.log("Billing Callback: Starting callback processing");

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (!shop || !chargeId) {
    console.error("Missing required parameters", { shop, charge_id: chargeId });
    return new Response(
      `<html><body><script>window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // 1. Получаем сессию и токен
  const session = await getSessionByShop(shop);
  if (!session?.accessToken) {
    console.error("Session or accessToken not found for shop:", shop);
    return new Response(
      `<html><body><script>window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
  const accessToken = session.accessToken;

  // 2. Запрашиваем статус подписки у Shopify
  const subscriptionGID = `gid://shopify/AppSubscription/${chargeId}`;
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
  const resp = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables: { id: subscriptionGID } }),
  });
  const { data, errors } = await resp.json();

  if (errors || data.node?.status !== "ACTIVE") {
    console.warn("Subscription not active or GraphQL error:", errors);
    // Можно здесь послать parent на страницу ошибки, но продолжаем дальше
  }

  // 3. Сохраняем или обновляем запись в БД
  try {
    await prisma.subscription.upsert({
      where: { chargeId: chargeId },       // уникальный фильтр по GID :contentReference[oaicite:2]{index=2}
      update: {
        status: data.node.status,          // обновляем текущий статус :contentReference[oaicite:3]{index=3}
      },
      create: {
        chargeId: chargeId,                // GID подписки
        status: data.node.status,          // статус (ACTIVE, etc.)
        name: data.node.name,              // имя плана
        test: data.node.test,              // флаг тестовой подписки
        shop: shop,                        // домен магазина для удобных запросов
        sessionId: session.id,             // связь с Session
      },
    });
    console.log("Subscription record upserted in database");
  } catch (dbError) {
    console.error("Failed to upsert subscription record:", dbError);
    // здесь можно уведомить parent или залогировать, но всё равно закрываем окно
  }

  // 4. Возвращаем HTML со скриптом: обновляем родительское окно и закрываем текущее
  return new Response(
    `
    <html>
      <body>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.location.href = "/app/next-step";
          }
          window.close();
        </script>
      </body>
    </html>
    `,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
};
