import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { json } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  console.log('App loader: Starting authentication');
  const { admin, session } = await authenticate.admin(request);
  
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
};

export default function App() {
  const { apiKey, shop } = useLoaderData();
  console.log('App component: Rendering with:', { apiKey: !!apiKey, shop });

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
