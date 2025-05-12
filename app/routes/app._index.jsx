import { useEffect } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineGrid,
  CalloutCard,
  Banner,
  LegacyCard,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      console.log("Product created");
    }
  }, [productId]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const benefits = [
    {
      title: "Reduce Returns",
      description: "Lower return rates by helping customers pick the right items the first time",
      icon: "↺", // Exchange symbol
      color: "#8C68CD" // Purple
    },
    {
      title: "Boost Conversions",
      description: "Increase sales by up to 40% with confidence-building try-before-you-buy experience",
      icon: "👍", // Thumbs up symbol
      color: "#00A0AC" // Teal
    },
    {
      title: "Enhance Engagement",
      description: "Keep customers on your site longer with interactive shopping experiences",
      icon: "✓", // Check symbol
      color: "#F49342" // Orange
    },
    {
      title: "Data Insights",
      description: "Gain valuable data on customer preferences and behavior",
      icon: "📊", // Chart symbol
      color: "#006FBB" // Blue
    }
  ];

  return (
    <Page fullWidth>
      <TitleBar title="Virtual Try-On Solution" />
      <Layout>
        <Layout.Section>
          {/* Hero Section */}
          <Card>
            <div style={{ 
              padding: '40px 20px', 
              textAlign: 'center', 
              background: 'linear-gradient(135deg, #f6f9fc 0%, #e9f0f7 100%)'
            }}>
              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <BlockStack gap="600">
                  <BlockStack gap="400">
                    <div style={{ marginBottom: '8px', fontSize: '24px' }}>
                      📷
                    </div>
                    <Text as="h1" variant="heading2xl" fontWeight="bold">
                      Transform Your Shopping Experience with AI Virtual Try-On
                    </Text>
                    <Text variant="headingLg" as="p" color="subdued">
                      Let customers see themselves in your products before purchase, 
                      boosting confidence and reducing returns
                    </Text>
                  </BlockStack>
                  
                  <div style={{ textAlign: 'center' }}>
                    <Button 
                      primary 
                      size="large"
                      onClick={() => navigate('/app/billing')}
                    >
                      Get Started with a 3-Day Free Trial
                    </Button>
                  </div>
                </BlockStack>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Demo Image Section */}
        <Layout.Section>
          <CalloutCard
            title="See it in action"
            illustration="https://cdn.shopify.com/s/files/1/0728/0253/4803/files/Screenshot_2023-12-13_at_21.01.36.png?v=1702497784"
            primaryAction={{
              content: 'Watch demo video',
              onAction: () => {},
            }}
          >
            <p>
              Our virtual try-on technology allows customers to see how products look on them before purchasing.
              This increases buyer confidence and reduces return rates.
            </p>
          </CalloutCard>
        </Layout.Section>

        {/* How It Works Banner */}
        <Layout.Section>
          <Banner title="How It Works" tone="info">
            <p>Install the app, select your plan, and add the try-on button to your product pages. That's it!</p>
          </Banner>
        </Layout.Section>

        {/* Benefits Section */}
        <Layout.Section>
          <Text as="h2" variant="heading2xl" fontWeight="bold" alignment="center">
            Benefits for Your Business
          </Text>
          
          <Box paddingBlockStart="500" paddingBlockEnd="500">
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="500">
              {benefits.map((benefit, index) => (
                <Card key={index} padding="500">
                  <BlockStack gap="400">
                    <div style={{ color: benefit.color }}>
                      {benefit.icon}
                    </div>
                    <Text variant="headingMd" fontWeight="semibold" as="h3">
                      {benefit.title}
                    </Text>
                    <Text variant="bodyMd" as="p">
                      {benefit.description}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </Box>
        </Layout.Section>

        {/* CTA Section */}
        <Layout.Section>
          <Card>
            <div style={{ 
              padding: '40px 20px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #eaf6f9 0%, #d5e6f7 100%)'
            }}>
              <BlockStack gap="500">
                <Text variant="headingXl" as="h2">
                  Ready to transform your customer experience?
                </Text>
                <div>
                  <Button 
                    primary 
                    size="large"
                    onClick={() => navigate('/app/billing')}
                  >
                    Choose Your Plan
                  </Button>
                </div>
              </BlockStack>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
