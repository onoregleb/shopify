import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { json } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { useEffect } from "react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  console.log('App loader: Starting authentication for URL', request.url);
  
  // Проверка наличия параметра shop в URL
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");
  
  console.log('App loader: URL parameters:', { 
    shop: shopParam, 
    host,
    embedded,
    pathname: url.pathname
  });
  
  try {
    // Используем улучшенный подход к аутентификации с дополнительным логированием
    const authOptions = {
      shop: shopParam,
      returnHeaders: true,
      isLogin: true,
      fallback: true // Добавляем fallback для более устойчивой аутентификации
    };
    
    console.log('App loader: Auth options:', JSON.stringify(authOptions));
    
    const { admin, session } = await authenticate.admin(request, authOptions);
    
    console.log('App loader: Authentication complete', {
      hasSession: !!session,
      hasShop: !!session?.shop,
      shop: session?.shop,
      hasAccessToken: !!session?.accessToken
    });

    return json({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
      host: host,
      embedded: embedded === "1"
    });
  } catch (error) {
    console.error('App loader: Authentication error:', error.stack || error);
    
    // Если это ошибка 302 (перенаправление на аутентификацию)
    if (error.status === 302) {
      const location = error.headers?.get('Location');
      console.log('App loader: 302 redirect detected to:', location);
      
      // Special case: if we're getting redirected to the Shopify admin 
      // after billing confirmation, handle it differently
      if (location?.includes('/admin/apps/')) {
        console.log('App loader: Detected redirect to admin, returning embedded params');
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
        console.log('App loader: Auth redirect detected');
        
        // Пропускаем перенаправление и вместо этого возвращаем информацию об ошибке
        if (shopParam) {
          // Create a return path that includes all current query parameters
          const returnPath = url.pathname + url.search;
          console.log('App loader: Returning auth error with shop parameter and return path:', shopParam, returnPath);
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
  console.log('App component: Rendering with:', { 
    apiKey: !!apiKey, 
    shop, 
    authError, 
    location, 
    host, 
    embedded,
    isAdminRedirect
  });

  // If this is a redirect from Shopify Admin after billing confirmation
  useEffect(() => {
    if (isAdminRedirect && shop && targetLocation) {
      console.log('App component: Handling admin redirect to', targetLocation);
      
      // We need to redirect to our app's URL, but maintain the session
      const appUrl = `${window.location.origin}${targetLocation}`;
      console.log('App component: Redirecting from admin to app URL:', appUrl);
      
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
      console.log('App component: Detected auth error, redirecting to:', location || `/?shop=${shop}`);
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
      isEmbeddedApp
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
