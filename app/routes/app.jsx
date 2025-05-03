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
  
  console.log('App loader: Shop parameter from URL:', shopParam);
  
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
    });
  } catch (error) {
    console.error('App loader: Authentication error:', error.stack || error);
    
    // Если это ошибка 302 (перенаправление на аутентификацию)
    if (error.status === 302 && error.headers?.get('Location')?.includes('/auth/login')) {
      console.log('App loader: 302 redirect to auth detected');
      
      // Пропускаем перенаправление и вместо этого возвращаем информацию об ошибке
      if (shopParam) {
        console.log('App loader: Returning auth error with shop parameter:', shopParam);
        return json({
          apiKey: process.env.SHOPIFY_API_KEY || "",
          shop: shopParam,
          authError: true,
          location: error.headers?.get('Location')
        });
      }
    }
    
    // Если это не 302 или нет shopParam, пробрасываем ошибку дальше
    throw error;
  }
};

export default function App() {
  const { apiKey, shop, authError, location } = useLoaderData();
  console.log('App component: Rendering with:', { apiKey: !!apiKey, shop, authError, location });

  // Используем useEffect для выполнения редиректа только на клиенте
  useEffect(() => {
    // Если произошла ошибка аутентификации и у нас есть параметр shop
    if (authError && shop) {
      console.log('App component: Detected auth error, redirecting to:', location || `/?shop=${shop}`);
      // Выполняем перенаправление на страницу авторизации
      window.location.href = location || `/?shop=${shop}`;
    }
  }, [authError, shop, location]);

  // Если есть ошибка аутентификации, просто рендерим заглушку до редиректа на клиенте
  if (authError) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Redirecting to authentication...</p>
      </div>
    );
  }

  return (
    <AppProvider 
      isEmbeddedApp
      apiKey={apiKey}
      shop={shop}
      forceRedirect
      iframeRefresh={false}
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
