# Lamp & Glow Email API

Node.js/Express API to send an order notification to the admin and confirmation to the customer using Hostinger SMTP.

## Hostinger deployment
1. Create a Node.js Web App for `email.lampandglow.pk`.
2. Upload this ZIP. Use `server.js` as startup file if asked.
3. Configure the environment variables below in hPanel. Do not put the real SMTP password in the ZIP.
4. Set `FRONTEND_ORIGIN` to your exact public frontend origin (e.g. `https://lampandglow.pk`, no trailing slash).
5. Deploy/install dependencies through Hostinger's Node.js app panel.
6. Test `https://email.lampandglow.pk/health`; expected JSON: `{"success":true,"status":"ok"}`.

Required environment variables:
- `FRONTEND_ORIGIN`: exact frontend origin
- `SMTP_HOST`: `smtp.hostinger.com`
- `SMTP_PORT`: `465`
- `SMTP_USER`: `info@lampandglow.pk`
- `SMTP_PASS`: your Hostinger mailbox password
- `ADMIN_EMAIL`: `arbazirfan14@gmail.com`
- `PORT`: let Hostinger provide it if required by its platform

## Endpoint
`POST https://email.lampandglow.pk/api/notify-order` with `Content-Type: application/json`.
Example payload:
```json
{
  "orderId": "ORDER-123",
  "fullName": "Customer Name",
  "email": "customer@example.com",
  "phone": "+92...",
  "addressLine1": "Street address",
  "addressLine2": "",
  "city": "Lahore",
  "state": "Punjab",
  "postalCode": "",
  "note": "",
  "paymentMethod": "Cash on Delivery",
  "status": "Placed",
  "items": [{"name":"Lamp","quantity":2,"unitPrice":2500,"colorVariant":"Black"}],
  "subtotal": 5000,
  "discountAmount": 0,
  "shipping": 200,
  "total": 5200
}
```
Call the endpoint only after Firestore confirms the order is saved, and pass the actual Firestore order ID.

## Production security note
This starter restricts browser CORS to the configured frontend, limits JSON size and rate-limits requests. CORS is not authentication: non-browser clients can still call this endpoint. Before production, verify the saved order server-side (e.g. via a restricted Firebase service account) or add another trusted server-side authorization mechanism. Never put a secret API key in frontend JavaScript. Admin email is sent first, then customer confirmation.
