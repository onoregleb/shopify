import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { json } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { useEffect } from "react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  
  // Проверка наличия параметра shop в URL
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");
  
  
  try {
    // Используем улучшенный подход к аутентификации с дополнительным логированием
    const authOptions = {
      shop: shopParam,
      returnHeaders: true,
      isLogin: true,
      fallback: true // Добавляем fallback для более устойчивой аутентификации
    };
    
    const { admin, session } = await authenticate.admin(request, authOptions);
    

    return json({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
      host: host,
      embedded: embedded === "1"
    });
  } catch (error) {
    
    // Если это ошибка 302 (перенаправление на аутентификацию)
    if (error.status === 302) {
      const location = error.headers?.get('Location');
      
      // Special case: if we're getting redirected to the Shopify admin 
      // after billing confirmation, handle it differently
      if (location?.includes('/admin/apps/')) {
        // This happens when Shopify tries to load the app in the admin
        // We'll render a minimal container to trigger app bridge embedding
        return json({
          apiKey: process.env.SHOPIFY_API_KEY || "",
          shop: shopParam,
          host: host,
          embedded: true,
          isAdminRedirect: true,
          targetLocation: url.pathname + url.search
        });
      }
      
      // Handle standard auth redirects
      if (location?.includes('/auth/login')) {
        
        // Пропускаем перенаправление и вместо этого возвращаем информацию об ошибке
        if (shopParam) {
          // Create a return path that includes all current query parameters
          const returnPath = url.pathname + url.search;
          return json({
            apiKey: process.env.SHOPIFY_API_KEY || "",
            shop: shopParam,
            authError: true,
            location: `/auth/login?shop=${shopParam}&returnTo=${encodeURIComponent(returnPath)}`,
            returnPath
          });
        }
      }
    }
    
    // Если это не 302 или нет shopParam, пробрасываем ошибку дальше
    throw error;
  }
};

export default function App() {
  const { apiKey, shop, authError, location, returnPath, host, embedded, isAdminRedirect, targetLocation } = useLoaderData();
  

  // Handle billing-related redirects from Shopify Admin
  useEffect(() => {
    // Listen for messages from the billing callback window
    function handleMessage(event) {
      // Verify the message source and type
      if (event.data && event.data.type === "BILLING_COMPLETED") {
        if (event.data.url) {
          window.location.href = event.data.url;
        }
      }
    }
    
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // If this is a redirect from Shopify Admin after billing confirmation
  useEffect(() => {
    if (isAdminRedirect && shop && targetLocation) {
      
      // We need to redirect to our app's URL, but maintain the session
      const appUrl = `${window.location.origin}${targetLocation}`;
      
      // Use app bridge to navigate if possible
      if (window.shopify && window.shopify.navigate) {
        window.shopify.navigate(appUrl);
      } else {
        // Fallback to direct navigation
        window.location.href = appUrl;
      }
    }
  }, [isAdminRedirect, shop, targetLocation]);

  // Используем useEffect для выполнения редиректа только на клиенте
  useEffect(() => {
    // Если произошла ошибка аутентификации и у нас есть параметр shop
    if (authError && shop) {
      // Instead of using the direct window.location, create a form POST to maintain session
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/auth/login';
      
      // Add shop parameter
      const shopInput = document.createElement('input');
      shopInput.type = 'hidden';
      shopInput.name = 'shop';
      shopInput.value = shop;
      form.appendChild(shopInput);
      
      // Add return path if available
      if (returnPath) {
        const returnInput = document.createElement('input');
        returnInput.type = 'hidden';
        returnInput.name = 'returnTo';
        returnInput.value = returnPath;
        form.appendChild(returnInput);
      }
      
      document.body.appendChild(form);
      form.submit();
    }
  }, [authError, shop, location, returnPath]);

  // Если есть ошибка аутентификации или это перенаправление из админки, просто рендерим заглушку до редиректа на клиенте
  if (authError || isAdminRedirect) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Redirecting...</p>
      </div>
    );
  }

  return (
    <AppProvider 
      isEmbeddedApp={true} // Always treat as embedded app for consistency
      apiKey={apiKey}
      shop={shop}
      host={host}
      forceRedirect={!embedded}
    >
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error('App error boundary:', error);
  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
