import { useState } from "react";
import { json } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Box,
  List,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // Получаем charge_id из URL
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  if (chargeId) {
    try {
      // Активируем подписку
      const activateResponse = await admin.graphql(
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
            id: chargeId
          }
        }
      );

      const activateData = await activateResponse.json();
      const userErrors = activateData.data?.appSubscriptionActivate?.userErrors;
      
      if (userErrors?.length > 0) {
        return json({ error: userErrors[0].message }, { status: 400 });
      }
    } catch (error) {
      console.error("Error activating subscription:", error);
      return json({ error: "Failed to activate subscription" }, { status: 500 });
    }
  }

  // Проверяем текущую подписку
  const response = await admin.graphql(
    `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `
  );

  const data = await response.json();
  return json({
    hasActiveSubscription: data?.currentAppInstallation?.activeSubscriptions?.length > 0,
    subscriptionStatus: data?.currentAppInstallation?.activeSubscriptions?.[0]?.status
  });
};

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "configure_theme") {
    // Здесь будет логика настройки темы
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function Integration() {
  const navigate = useNavigate();
  const [isConfiguring, setIsConfiguring] = useState(false);

  const handleConfigure = async () => {
    setIsConfiguring(true);
    // Добавьте здесь логику настройки темы
    setIsConfiguring(false);
  };

  const handleComplete = () => {
    // После завершения настройки возвращаемся на главную страницу
    navigate("/app");
  };

  return (
    <Page
      title="Final Setup"
      backAction={{ content: "Back", onAction: () => navigate(-1) }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Add Virtual Try-On to Your Store
                </Text>
                <Text as="p">
                  We'll help you integrate the virtual try-on experience into your store's product pages.
                </Text>
                <Banner status="info">
                  The virtual try-on button will be added to your product pages automatically.
                  Your customers will be able to:
                </Banner>
                <List type="bullet">
                  <List.Item>Try on products virtually using their device camera</List.Item>
                  <List.Item>See how products look from different angles</List.Item>
                  <List.Item>Share their virtual try-on experience</List.Item>
                </List>
                <BlockStack gap="300">
                  <Button
                    primary
                    loading={isConfiguring}
                    onClick={handleConfigure}
                  >
                    Configure Store Theme
                  </Button>
                  <Button
                    onClick={handleComplete}
                  >
                    Complete Setup
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}