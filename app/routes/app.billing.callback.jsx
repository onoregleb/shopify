// app/routes/app.billing.callback.jsx

import { getSessionByShop } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { json, redirect } from "@remix-run/node";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  console.log("Billing Callback: Starting callback processing with URL", request.url);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  console.log("Billing Callback: Parameters:", { shop, chargeId });

  if (!shop || !chargeId) {
    console.error("Billing Callback: Missing required parameters", { shop, chargeId });
    return new Response(
      `<html><body><script>window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    // 1. Получаем сессию и токен
    console.log("Billing Callback: Getting session for shop", shop);
    const session = await getSessionByShop(shop);
    
    if (!session?.accessToken) {
      console.error("Billing Callback: Session or accessToken not found for shop:", shop);
      return new Response(
        `<html><body>
          <h2>Authentication Error</h2>
          <p>Unable to find session for shop: ${shop}</p>
          <p>Please <a href="/?shop=${shop}">login again</a>.</p>
          <script>
            setTimeout(function() {
              window.location.href = "/?shop=${shop}";
            }, 3000);
          </script>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
    
    console.log("Billing Callback: Successfully retrieved session with accessToken");
    const accessToken = session.accessToken;

    // 2. Запрашиваем статус подписки у Shopify
    const subscriptionGID = `gid://shopify/AppSubscription/${chargeId}`;
    const graphqlUrl = `https://${shop}/admin/api/2024-07/graphql.json`;
    
    console.log("Billing Callback: Querying subscription status from Shopify", { subscriptionGID, graphqlUrl });
    
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
    console.log("Billing Callback: Subscription query result:", { data, errors });

    if (errors || data.node?.status !== "ACTIVE") {
      console.warn("Billing Callback: Subscription not active or GraphQL error:", errors);
    }

    // 3. Сохраняем или обновляем запись в БД
    try {
      console.log("Billing Callback: Upserting subscription record in database");
      await prisma.subscription.upsert({
        where: { chargeId: chargeId },
        update: {
          status: data.node.status,
        },
        create: {
          chargeId: chargeId,
          status: data.node.status,
          name: data.node.name,
          test: data.node.test,
          shop: shop,
          sessionId: session.id,
        },
      });
      console.log("Billing Callback: Subscription record successfully upserted in database");

      // Обновляем лимиты и кредиты при активации подписки
      let limit = 100;
      let planName = data.node.name || "Trend";
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
    } catch (dbError) {
      console.error("Billing Callback: Failed to upsert subscription record:", dbError);
    }

    // 4. Возвращаем HTML со скриптом: обновляем родительское окно и закрываем текущее
    // Используем тот же подход, что и при переходе на страницу оплаты
    const baseUrl = process.env.SHOPIFY_APP_URL || url.origin;
    const redirectUrl = new URL("/app/integration", baseUrl);
    redirectUrl.searchParams.set("shop", shop);
    
    // Add embedding params for Shopify App Bridge
    const apiKey = process.env.SHOPIFY_API_KEY;
    const host = btoa(`${shop}/admin`);
    redirectUrl.searchParams.set("host", host);
    redirectUrl.searchParams.set("embedded", "1");  // Force embedded mode
    if (apiKey) {
      redirectUrl.searchParams.set("apiKey", apiKey);
    }
    
    console.log("Billing Callback: Setting redirect URL with shop parameter:", redirectUrl.toString());
    
    // Если есть открывшее окно, перенаправляем его, иначе закрываем текущее
    return new Response(
      `
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px;">
          <h2>Payment Successful!</h2>
          <p>Your subscription has been activated.</p>
          <div style="margin: 30px 0;">
            <button id="continueBtn" style="padding: 10px 20px; background-color: #008060; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
              Continue to Setup
            </button>
          </div>
          <p><small>This window will automatically close after redirecting.</small></p>
          
          <script>
            // Direct function to handle redirection via auth
            function redirectToApp() {
              const targetUrl = "${redirectUrl.toString()}";
              console.log("Redirecting to:", targetUrl);
              
              // Create a redirect form with POST to maintain session
              function createRedirectForm(url) {
                const form = document.createElement('form');
                form.method = 'GET';  // Using GET instead of POST for better compatibility
                form.action = url;
                
                // Add all URL parameters as hidden inputs
                const urlObj = new URL(url);
                for (const [key, value] of urlObj.searchParams.entries()) {
                  const input = document.createElement('input');
                  input.type = 'hidden';
                  input.name = key;
                  input.value = value;
                  form.appendChild(input);
                }
                
                return form;
              }
              
              // If we have an opener, update it and close this window
              if (window.opener && !window.opener.closed) {
                try {
                  // First try to redirect the opener directly
                  window.opener.location.href = targetUrl;
                  console.log("Redirected opener window");
                  setTimeout(() => window.close(), 500);
                } catch (e) {
                  console.error("Error redirecting opener:", e);
                  
                  // If direct redirect fails, try with a form
                  try {
                    const form = createRedirectForm(targetUrl);
                    document.body.appendChild(form);
                    window.opener.document.body.appendChild(form);
                    form.submit();
                    setTimeout(() => window.close(), 500);
                  } catch (formError) {
                    console.error("Form redirect failed:", formError);
                    // If that also fails, redirect this window
                    window.location.href = targetUrl;
                  }
                }
              } else {
                // No opener, redirect this window
                window.location.href = targetUrl;
              }
            }
            
            // Add click handler to the button
            document.getElementById('continueBtn').addEventListener('click', redirectToApp);
            
            // Also redirect automatically after a delay
            setTimeout(redirectToApp, 3000);
          </script>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  } catch (error) {
    console.error("Billing Callback: Error processing billing callback:", error.stack || error);
    return new Response(
      `<html><body>
        <h2>Error processing your subscription</h2>
        <p>Please try again or contact support.</p>
        <p>Error details: ${error.message || 'Unknown error'}</p>
        <p><a href="/?shop=${shop}">Return to app</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
};
