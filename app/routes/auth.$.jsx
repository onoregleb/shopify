import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log('Auth: Starting authentication process');
  const url = new URL(request.url);
  
  try {
    const { admin, session } = await authenticate.admin(request);
    console.log('Auth: Authentication successful', { 
      hasSession: !!session,
      shop: session?.shop 
    });

    // Получаем параметры возврата
    const returnUrl = url.searchParams.get("returnUrl") || url.searchParams.get("return_to");
    const chargeId = url.searchParams.get("charge_id");
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");

    console.log('Auth: Return parameters:', { returnUrl, chargeId, shop, host });

    // Если есть параметры для возврата к процессу оплаты
    if (chargeId && shop) {
      console.log('Auth: Redirecting back to billing callback');
      const callbackUrl = new URL("/app/billing/callback", process.env.SHOPIFY_APP_URL);
      callbackUrl.searchParams.set("charge_id", chargeId);
      callbackUrl.searchParams.set("shop", shop);
      if (host) callbackUrl.searchParams.set("host", host);

      return redirect(callbackUrl.toString());
    }

    // Если есть returnUrl, перенаправляем туда
    if (returnUrl) {
      console.log('Auth: Redirecting to return URL');
      const finalUrl = new URL(returnUrl, process.env.SHOPIFY_APP_URL);
      if (shop) finalUrl.searchParams.set("shop", shop);
      if (host) finalUrl.searchParams.set("host", host);

      return redirect(finalUrl.toString());
    }

    // По умолчанию перенаправляем на главную страницу приложения
    return redirect(`/app?shop=${session.shop}`);
  } catch (error) {
    console.error('Auth: Authentication error:', error);
    throw error;
  }
};
