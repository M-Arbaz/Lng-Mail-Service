
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();

// Allowed frontend origins
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Security middleware
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
  })
);

app.use(express.json({ limit: '100kb' }));

// Rate limiting
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Brand settings
const BRAND = {
  name: 'LAMP and GLOW',
  website: 'https://lampandglow.pk',
  email: 'info@lampandglow.pk',
  gold: '#C6A15B',
  dark: '#171717',
  muted: '#777777',
};

// Escape HTML
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format currency
function formatPrice(value) {
  const amount = Number(value);
  return `PKR ${Number.isFinite(amount) ? amount.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) : '0.00'}`;
}

// Reusable email header
function emailHeader() {
  return `
    <tr>
      <td style="background:${BRAND.dark};padding:32px 24px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:27px;letter-spacing:4px;color:#ffffff;font-weight:bold;">
          ${BRAND.name}
        </div>
        <div style="margin-top:9px;font-size:10px;letter-spacing:4px;color:${BRAND.gold};">
          LIGHT UP YOUR SPACE
        </div>
      </td>
    </tr>
  `;
}

// Reusable email footer
function emailFooter() {
  return `
    <tr>
      <td style="background:#f7f5f0;padding:28px 20px;text-align:center;">
        <p style="margin:0 0 10px;color:#555;font-size:13px;">
          Thank you for choosing ${BRAND.name}.
        </p>
        <a href="${BRAND.website}" style="color:${BRAND.gold};font-size:13px;text-decoration:none;">
          Visit Our Website
        </a>
        <p style="margin:15px 0 0;color:#999;font-size:11px;">
          ${BRAND.email}
        </p>
        <p style="margin:8px 0 0;color:#aaa;font-size:10px;">
          © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
        </p>
      </td>
    </tr>
  `;
}

// Main email wrapper
function emailLayout(content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${BRAND.name}</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f0ed;font-family:Arial,Helvetica,sans-serif;color:#292929;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f0ed;padding:25px 10px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border-collapse:collapse;">
              ${emailHeader()}
              <tr>
                <td style="padding:32px 28px;">
                  ${content}
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Order product rows
function productRows(items) {
  return items.map((item) => {
    const name = escapeHtml(item.name || item.title || 'Product');
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const price = Number(item.unitPrice ?? item.price ?? 0);
    const safePrice = Number.isFinite(price) ? price : 0;

    return `
      <tr>
        <td style="padding:15px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;">
          <strong>${name}</strong>
        </td>
        <td align="center" style="padding:15px 8px;border-bottom:1px solid #eee;font-size:13px;color:#555;">
          ${quantity}
        </td>
        <td align="right" style="padding:15px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;white-space:nowrap;">
          ${formatPrice(safePrice)}
        </td>
      </tr>
    `;
  }).join('');
}

// Order summary
function orderSummary({ subtotal, discountAmount, shipping, total }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      <tr>
        <td style="padding:8px 0;color:#777;font-size:13px;">Subtotal</td>
        <td align="right" style="padding:8px 0;color:#333;font-size:13px;">${formatPrice(subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#777;font-size:13px;">Discount</td>
        <td align="right" style="padding:8px 0;color:#26834a;font-size:13px;">- ${formatPrice(discountAmount)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#777;font-size:13px;">Shipping</td>
        <td align="right" style="padding:8px 0;color:#333;font-size:13px;">${formatPrice(shipping)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:15px;border-top:1px solid #ddd;"></td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:16px;font-weight:bold;color:#222;">Total</td>
        <td align="right" style="padding:5px 0;font-size:19px;font-weight:bold;color:${BRAND.gold};">
          ${formatPrice(total)}
        </td>
      </tr>
    </table>
  `;
}

// Product table
function productTable(items) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:25px;">
      <thead>
        <tr style="background:#f7f5f0;">
          <th align="left" style="padding:13px 8px;font-size:11px;color:#777;text-transform:uppercase;">Product</th>
          <th align="center" style="padding:13px 8px;font-size:11px;color:#777;text-transform:uppercase;">Qty</th>
          <th align="right" style="padding:13px 8px;font-size:11px;color:#777;text-transform:uppercase;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${productRows(items)}
      </tbody>
    </table>
  `;
}

// Customer and delivery information
function customerDetails(data) {
  const address = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.state,
    data.postalCode,
  ].filter(Boolean).map(escapeHtml).join(', ');

  return `
    <div style="margin-top:25px;padding:20px;background:#f8f7f4;border-left:3px solid ${BRAND.gold};">
      <h3 style="margin:0 0 15px;font-size:14px;color:#222;">CUSTOMER DETAILS</h3>

      <p style="margin:7px 0;font-size:13px;color:#555;">
        <strong>Name:</strong> ${escapeHtml(data.fullName || 'Not provided')}
      </p>

      <p style="margin:7px 0;font-size:13px;color:#555;">
        <strong>Email:</strong> ${escapeHtml(data.email)}
      </p>

      <p style="margin:7px 0;font-size:13px;color:#555;">
        <strong>Phone:</strong> ${escapeHtml(data.phone || 'Not provided')}
      </p>

      <p style="margin:7px 0;font-size:13px;color:#555;">
        <strong>Address:</strong> ${address || 'Not provided'}
      </p>

      <p style="margin:7px 0;font-size:13px;color:#555;">
        <strong>Payment:</strong> ${escapeHtml(data.paymentMethod || 'Not provided')}
      </p>

      ${data.note ? `
        <p style="margin:7px 0;font-size:13px;color:#555;">
          <strong>Order note:</strong> ${escapeHtml(data.note)}
        </p>
      ` : ''}
    </div>
  `;
}

// Status endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Lamp and Glow Email API is running',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Lamp and Glow Email API',
  });
});

// Send order emails
app.post('/api/notify-order', async (req, res) => {
  try {
    const {
      orderId,
      fullName,
      email,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      note,
      paymentMethod,
      status,
      items,
      subtotal,
      discountAmount,
      shipping,
      total,
    } = req.body || {};

    // Validate required fields
    if (
      !orderId ||
      typeof orderId !== 'string' ||
      orderId.length > 200 ||
      !email ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid orderId, email and items are required.',
      });
    }

    const order = {
      orderId,
      fullName,
      email,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      note,
      paymentMethod,
      status,
      items,
      subtotal,
      discountAmount,
      shipping,
      total,
    };

    const orderHeading = `
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;padding:8px 18px;background:#f7f5f0;color:${BRAND.gold};font-size:10px;letter-spacing:2px;font-weight:bold;">
          ORDER #${escapeHtml(orderId)}
        </div>
      </div>
    `;

    // ADMIN EMAIL
    const adminContent = `
      ${orderHeading}

      <h1 style="margin:0 0 10px;text-align:center;font-family:Georgia,serif;font-size:27px;font-weight:normal;color:#222;">
        New Order Received!
      </h1>

      <p style="margin:0;text-align:center;color:#888;font-size:13px;line-height:1.7;">
        A new order has been placed on your Lamp and Glow store.
      </p>

      <div style="margin-top:25px;padding:15px;background:#f7f5f0;text-align:center;">
        <span style="font-size:11px;color:#888;">ORDER STATUS</span>
        <div style="margin-top:6px;font-size:15px;font-weight:bold;color:${BRAND.gold};">
          ${escapeHtml(status || 'Pending')}
        </div>
      </div>

      ${customerDetails(order)}

      <h3 style="margin:30px 0 0;font-size:14px;color:#222;">
        ORDER ITEMS
      </h3>

      ${productTable(items)}

      ${orderSummary(order)}

      <p style="margin:25px 0 0;color:#999;font-size:11px;text-align:center;">
        This is an automated notification from your Lamp and Glow store.
      </p>
    `;

    // CUSTOMER EMAIL
    const customerContent = `
      <div style="text-align:center;margin-bottom:25px;">
        <div style="width:58px;height:58px;line-height:58px;margin:0 auto 18px;border-radius:50%;background:#f7f5f0;color:${BRAND.gold};font-size:28px;">
          &#10003;
        </div>

        <h1 style="margin:0;font-family:Georgia,serif;font-size:29px;font-weight:normal;color:#222;">
          Thank You${fullName ? `, ${escapeHtml(fullName)}` : ''}!
        </h1>

        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#777;">
          Your order has been received successfully. We're delighted that you chose Lamp and Glow.
        </p>
      </div>

      ${orderHeading}

      <div style="padding:18px;background:#f7f5f0;text-align:center;">
        <p style="margin:0;color:#888;font-size:11px;letter-spacing:1px;">
          YOUR ORDER NUMBER
        </p>
        <p style="margin:8px 0 0;color:#222;font-size:20px;font-weight:bold;">
          #${escapeHtml(orderId)}
        </p>
      </div>

      <h3 style="margin:30px 0 0;font-size:14px;color:#222;">
        YOUR ORDER
      </h3>

      ${productTable(items)}

      ${orderSummary(order)}

      ${customerDetails(order)}

      <p style="margin:25px 0 0;text-align:center;font-size:13px;line-height:1.8;color:#777;">
        We'll keep you updated as your order progresses.<br>
        If you have any questions, contact us at
        <a href="mailto:${BRAND.email}" style="color:${BRAND.gold};text-decoration:none;">
          ${BRAND.email}
        </a>.
      </p>

      <div style="text-align:center;margin-top:25px;">
        <a href="${BRAND.website}" style="display:inline-block;background:${BRAND.dark};color:#fff;text-decoration:none;padding:14px 28px;font-size:11px;letter-spacing:2px;">
          CONTINUE SHOPPING
        </a>
      </div>
    `;

    // Send admin notification
    await transporter.sendMail({
      from: `"Lamp and Glow" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Order #${orderId} | Lamp and Glow`,
      html: emailLayout(adminContent),
    });

    // Send customer confirmation
    await transporter.sendMail({
      from: `"Lamp and Glow" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Your Order #${orderId} is Confirmed | Lamp and Glow`,
      html: emailLayout(customerContent),
    });

    return res.status(200).json({
      success: true,
      message: 'Order notification and customer confirmation emails sent.',
      orderId,
    });

  } catch (error) {
    console.error('Order email error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to send order emails.',
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed.',
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON body.',
    });
  }

  console.error('Application error:', err.message);

  return res.status(500).json({
    success: false,
    message: 'Internal server error.',
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Lamp and Glow Email API running on port ${PORT}`);
});
