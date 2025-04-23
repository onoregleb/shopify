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
  MediaCard,
  InlineStack,
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

  return (
    <Page fullWidth>
      <TitleBar title="Virtual Try-On Solution" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="200">
                <Text as="h1" variant="headingXl">
                  Transform Your Shopping Experience with AI Virtual Try-On
                </Text>
                <Text variant="bodyLg" as="p">
                  Elevate your store with our cutting-edge AI virtual try-on technology. Let customers see themselves in your products before they buy, increasing confidence in purchases and reducing returns.
                </Text>
              </BlockStack>
              
              <MediaCard
                title="Key Benefits"
                description={`
                  • Instant virtual try-ons from a single photo
                  • Increase conversion rates and reduce returns
                  • Easy integration with your store
                  • Real-time analytics and insights
                  • Customizable try-on experience
                `}
                size="medium"
              >
                <div style={{ 
                  width: '100%', 
                  height: '100%',
                  maxHeight: '400px',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <img
                    alt="Virtual try-on preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      maxHeight: '400px'
                    }}
                    src="/images/virtual-tryon-demo.jpg"
                  />
                </div>
              </MediaCard>

              <Box paddingBlockEnd="800">
                <InlineStack align="end">
                  <Button 
                    primary 
                    size="large"
                    onClick={() => navigate('/app/billing')}
                  >
                    Next
                  </Button>
                </InlineStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
