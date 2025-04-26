import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log('Billing Callback: Starting callback processing');
  const url = new URL(request.url);
  console.log('Billing Callback: URL parameters:', Object.fromEntries(url.searchParams));
  
  const shop = url.searchParams.get("shop");
  const charge_id = url.searchParams.get("charge_id");
  const apiKey = url.searchParams.get("apiKey") || process.env.SHOPIFY_API_KEY;

  if (!shop || !charge_id) {
    console.error('Billing Callback: Missing required parameters', { shop, charge_id });
    return redirect("/app");
  }

  try {
    // Если нет сессии, перенаправляем на OAuth с сохранением параметров
    if (!request.headers.get("Authorization")) {
      console.log('Billing Callback: No Authorization header, redirecting to OAuth');
      const adminUrl = `https://admin.shopify.com/store/${shop.split('.')[0]}/oauth/authorize`;
      const params = new URLSearchParams({
        client_id: apiKey,
        scope: process.env.SCOPES,
        redirect_uri: `${process.env.SHOPIFY_APP_URL}/auth/callback`,
        state: JSON.stringify({
          charge_id,
          shop,
          returnTo: `/app/billing/callback?charge_id=${charge_id}&shop=${shop}`
        })
      });
      
      return redirect(`${adminUrl}?${params.toString()}`);
    }

    console.log('Billing Callback: Attempting authentication');
    const { admin, session } = await authenticate.admin(request);
    console.log('Billing Callback: Authentication successful', {
      hasSession: !!session,
      shop: session?.shop,
      accessToken: !!session?.accessToken
    });

    try {
      console.log('Billing Callback: Activating subscription', { charge_id });
      const response = await admin.graphql(
        `#graphql
          mutation activateSubscription($id: ID!) {
            appSubscriptionActivate(id: $id) {
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
        {
          variables: {
            id: charge_id
          }
        }
      );

      const responseData = await response.json();
      console.log('Billing Callback: Activation response:', responseData);

      const userErrors = responseData.data?.appSubscriptionActivate?.userErrors;
      if (userErrors?.length > 0) {
        console.error('Billing Callback: Activation errors:', userErrors);
        return redirect(`/app/billing?activation_error=${encodeURIComponent(userErrors[0].message)}&shop=${shop}`);
      }

      console.log('Billing Callback: Subscription activated successfully');
      
      // После успешной активации перенаправляем в приложение
      const redirectUrl = `https://${shop}/admin/apps/${apiKey}`;
      return redirect(redirectUrl);
    } catch (error) {
      console.error('Billing Callback: GraphQL error:', error);
      return redirect(`/app/billing?error=activation_failed&shop=${shop}`);
    }
  } catch (error) {
    console.error('Billing Callback: Authentication error:', error);
    // При ошибке аутентификации перенаправляем на вход с сохранением параметров
    const params = new URLSearchParams({
      shop,
      charge_id,
      returnTo: `/app/billing/callback`
    });
    return redirect(`/auth/login?${params.toString()}`);
  }
};