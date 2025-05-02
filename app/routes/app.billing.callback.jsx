import { redirect } from "@remix-run/node";
// Убрали authenticate, так как он здесь не подходит
// import { authenticate } from "../shopify.server";
import { getSessionByShop } from "../shopify.server"; // Используем для получения сессии
import { PrismaClient } from '@prisma/client'; // Если используется Prisma для хранения сессий

const prisma = new PrismaClient(); // Если используется Prisma

// Убрали функцию ensureValidAdmin, т.к. она использовала authenticate.admin

// Убрали функцию redirectToOAuth, т.к. логика получения сессии будет основной

export const loader = async ({ request }) => {
  console.log('Billing Callback: Starting callback processing');

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  console.log('Billing Callback: URL parameters:', params);

  const shop = params.shop;
  // ВАЖНО: ID подписки в GraphQL часто передается как полный GID,
  // который может выглядеть как "gid://shopify/AppSubscription/12345".
  // Убедитесь, что charge_id, который вы передаете в мутацию,
  // имеет правильный формат ID, ожидаемый мутацией appSubscriptionActivate.
  // Shopify обычно возвращает числовой ID в параметрах URL, который нужно
  // сконвертировать в GID или использовать мутацию, которая принимает числовой ID.
  // Давайте предположим, что мутация ожидает GID.
  const charge_id_from_url = params.charge_id; // Числовой ID из URL

  if (!shop || !charge_id_from_url) {
    console.error('Missing required parameters', { shop, charge_id: charge_id_from_url });
    return redirect("/app"); // Или на страницу с ошибкой
  }

  // Формируем GID подписки (стандартный формат)
  const subscriptionId = `gid://shopify/AppSubscription/${charge_id_from_url}`;

  try {
    // 1. Получаем сессию из БД
    const session = await getSessionByShop(shop);
    if (!session || !session.accessToken) {
       console.error('Billing Callback: Session or accessToken not found for shop:', shop);
       // Возможно, здесь стоит перенаправить на OAuth для получения нового токена,
       // но это усложнит поток. Проще показать ошибку или отправить в /app.
       return redirect(`/app?error=session_missing&shop=${shop}`);
    }
    console.log('Billing Callback: Session found for shop:', shop);
    const accessToken = session.accessToken;

    // 2. Формируем URL для GraphQL запроса
    // Используйте актуальную или стабильную версию API
    const graphqlUrl = `https://${shop}/admin/api/2024-07/graphql.json`;

    // 3. Делаем прямой GraphQL-запрос к Shopify Admin API для активации подписки
    const response = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken, // Используем токен из сессии
        },
        body: JSON.stringify({
          // Используем стандартную мутацию activate
          // Убедитесь, что используете правильное имя мутации и ID
          query: `
            mutation appSubscriptionActivate($subscriptionId: ID!) {
              appSubscriptionActivate(id: $subscriptionId) {
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
            subscriptionId: subscriptionId, // Передаем GID
          },
        }),
      });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to activate subscription via Admin API", {
          status: response.status,
          errorText,
          shop,
          charge_id: subscriptionId
      });
      // Можно перенаправить на страницу биллинга с параметром ошибки
      return redirect(`/app/billing?error=api_activation_failed&shop=${shop}`);
    }

    const responseData = await response.json();
    console.log('Activation response:', responseData);

    const userErrors = responseData.data?.appSubscriptionActivate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error('Activation user errors:', userErrors);
      // Перенаправляем с сообщением об ошибке
      return redirect(`/app/billing?activation_error=${encodeURIComponent(userErrors[0].message)}&shop=${shop}`);
    }

    // Проверяем статус активации (опционально, но рекомендуется)
    const activatedSubscription = responseData.data?.appSubscriptionActivate?.appSubscription;
    if (activatedSubscription?.status === 'ACTIVE') {
        console.log(`✅ Subscription ${activatedSubscription.id} activated successfully for shop ${shop}`);
         // Здесь можно обновить статус подписки в вашей БД, если нужно

    } else {
        console.warn(`Subscription activation initiated but status is not ACTIVE: ${activatedSubscription?.status}`, activatedSubscription);
        // Решить, как обрабатывать неактивные статусы (PENDING и т.д.)
    }

    // 4. Перенаправляем пользователя обратно в приложение внутри Shopify Admin
    // Это стандартный способ вернуть пользователя в приложение после действия вне его iframe.
    const appUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    console.log(`Redirecting user back to app: ${appUrl}`);
    return redirect(appUrl);

  } catch (error) {
    console.error('🚨 Billing Callback Error:', error);
    // Общая ошибка при обработке колбэка
    return redirect(`/app/billing?error=callback_processing_failed&shop=${shop}`);
  }
};