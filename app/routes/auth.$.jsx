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
    const returnUrl = url.searchParams.get("returnUrl") || url.searchParams.get("return_to") || url.searchParams.get("returnTo");
    const chargeId = url.searchParams.get("charge_id");
    const shop = url.searchParams.get("shop") || session?.shop;
    const host = url.searchParams.get("host");

    console.log('Auth: Return parameters:', { returnUrl, chargeId, shop, host });

    // Если есть параметры для возврата к процессу оплаты
    if (chargeId && shop) {
      console.log('Auth: Redirecting back to billing callback');
      const callbackUrl = new URL("/app/billing/callback", process.env.SHOPIFY_APP_URL || url.origin);
      callbackUrl.searchParams.set("charge_id", chargeId);
      callbackUrl.searchParams.set("shop", shop);
      if (host) callbackUrl.searchParams.set("host", host);

      return redirect(callbackUrl.toString());
    }

    // Если есть returnUrl, перенаправляем туда
    if (returnUrl) {
      console.log('Auth: Redirecting to return URL:', returnUrl);
      
      // Handle both absolute and relative URLs
      let finalUrl;
      try {
        // Check if it's a valid absolute URL
        new URL(returnUrl); // Just test if it's valid
        finalUrl = new URL(returnUrl);
      } catch (e) {
        // It's a relative URL, make it absolute
        finalUrl = new URL(returnUrl, process.env.SHOPIFY_APP_URL || url.origin);
      }
      
      // Make sure the shop parameter is present
      if (shop && !finalUrl.searchParams.has("shop")) {
        finalUrl.searchParams.set("shop", shop);
      }
      
      // Add host parameter if available and not already in the URL
      if (host && !finalUrl.searchParams.has("host")) {
        finalUrl.searchParams.set("host", host);
      }

      console.log('Auth: Final redirect URL:', finalUrl.toString());
      return redirect(finalUrl.toString());
    }

    // По умолчанию перенаправляем на главную страницу приложения
    const appUrl = new URL("/app", process.env.SHOPIFY_APP_URL || url.origin);
    appUrl.searchParams.set("shop", session.shop);
    return redirect(appUrl.toString());
  } catch (error) {
    console.error('Auth: Authentication error:', error);
    throw error;
  }
};

// Handle POST requests for better authentication flow
export async function action({ request }) {
  console.log('Auth: Handling POST request');
  
  try {
    const url = new URL(request.url);
    // Extract form data
    const formData = await request.formData();
    const shop = formData.get("shop");
    const returnTo = formData.get("returnTo") || formData.get("redirectUrl");
    
    console.log('Auth: POST parameters:', { shop, returnTo });
    
    if (!shop) {
      console.error('Auth: Missing shop parameter in POST');
      return redirect("/");
    }
    
    // First try direct authentication
    try {
      const { admin, session } = await authenticate.admin(request, { shop });
      console.log('Auth POST: Direct authentication successful');
      
      // If authentication succeeded, redirect to the return URL or app home
      if (returnTo) {
        let finalUrl;
        try {
          new URL(returnTo); // Just test if it's valid
          finalUrl = returnTo;
        } catch (e) {
          // It's a relative URL, make it absolute
          finalUrl = new URL(returnTo, process.env.SHOPIFY_APP_URL || url.origin).toString();
        }
        console.log('Auth POST: Redirecting to return URL after successful auth:', finalUrl);
        return redirect(finalUrl);
      }
      
      // Default redirect to app home
      return redirect(`/app?shop=${session.shop}`);
    } catch (authError) {
      console.log('Auth POST: Direct authentication failed, proceeding with regular auth flow');
    }
    
    // Create authentication URL
    const authUrl = new URL("/auth", process.env.SHOPIFY_APP_URL || url.origin);
    authUrl.searchParams.set("shop", shop);
    
    if (returnTo) {
      authUrl.searchParams.set("returnTo", returnTo);
    }
    
    console.log('Auth: Redirecting to shopify auth:', authUrl.toString());
    return redirect(authUrl.toString());
  } catch (error) {
    console.error('Auth: Error in action:', error);
    return redirect("/");
  }
}
