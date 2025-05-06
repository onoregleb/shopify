# Virtual Try-On Button Theme Extension

This extension adds a Virtual Try-On button to your Shopify store in two ways:

## 1. App Embed Button (Global)

The App Embed button appears as a floating button on all product pages. You can customize:
- Button position (top-right, top-left, bottom-right, bottom-left)
- Button text
- Button and text colors

This is automatically enabled when you install the app.

## 2. Product Section Button (Under Buy Buttons)

This button integrates directly with your product page template, appearing under the "Buy buttons" section.

### How to Add the Product Section Button:

1. Go to your Shopify admin
2. Navigate to Online Store > Themes
3. Click "Customize" on your active theme
4. Navigate to a product page
5. In the sidebar, find the "Product information" or "Main product" section
6. Click "Add block"
7. Under "Apps", select "Virtual Try-On Button"
8. Drag the block to position it directly under the Buy buttons
9. Save your changes

Alternatively, you can use this direct link to add the button:
```
https://{your-shop}.myshopify.com/admin/themes/{theme_id}/editor?context=add-block&block=virtual-try-on-button&section=main-product&template=product
```

## Troubleshooting

If the button doesn't appear:
1. Make sure your theme supports App Blocks (all OS 2.0 themes do)
2. Verify you're adding the block to a product template
3. Try refreshing the page or clearing your cache
4. Contact support if issues persist

## Need Help?

Contact support@modera-fashion.com for assistance.

## Features

- Automatically adds a "Try On" button to product pages
- Configurable position, text, and colors for the button
- Opens a modal with the virtual try-on experience
- Tracks usage for your subscription plan

## Installation

The extension is automatically installed when merchants install the Modera Fashion app. However, the button **will not appear** until the merchant activates it in their theme editor.

## Local Development

For local development and testing the extension:

```bash
# Navigate to your app root directory
cd modera-fashion

# Run extension development server
shopify extension dev

# Or for this specific extension only
shopify extension dev --extension=theme-button
```

This will:
1. Deploy the extension to your development store
2. Open the theme editor in your browser
3. Allow you to preview and test the extension

## Activation Instructions for Merchants

After installing the Modera Fashion app, activate the Try-On button in your theme:

1. Go to your Shopify admin → **Online Store** → **Themes**
2. Click **Customize** on your active theme
3. In the theme editor, click on **Theme settings** (bottom left corner)
4. Select **App embeds**
5. Find the **Virtual Try-On Button** and toggle it ON
6. Customize the button settings as needed:
   - Button Position: Choose where the button appears on product pages
   - Button Text: Customize the text that appears on the button
   - Button Color: Set the background color
   - Text Color: Set the text color
7. Click **Save** to activate

## Deep Link for Merchants

For easier activation, provide this link to merchants after they install your app:

```
https://{{shop}}.myshopify.com/admin/themes/{{theme_id}}/editor?context=apps-embed-blocks&activate=virtual-try-on-button
```

Replace `{{shop}}` with the merchant's shop name and `{{theme_id}}` with their active theme ID.

## Technical Details

- The button appears only on product pages
- The button opens a modal with an iframe pointing to the app's try-on experience
- The extension tracks usage for billing purposes
- Compatible with all Shopify themes, including vintage themes and Online Store 2.0 