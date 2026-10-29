
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
      // Allow requests without Origin, such as server-side health checks
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

// Basic status endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Lamp & Glow Email API is running',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Lamp & Glow Email API',
  });
});

// Send order notification emails
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

    // Format order items for email
    const itemsHtml = items
      .map((item) => {
        const name = String(item.name || item.title || 'Product')
          .slice(0, 200);
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);

        return `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td>${Number.isFinite(quantity) ? quantity : 1}</td>
            <td>${Number.isFinite(price) ? price.toFixed(2) : '0.00'}</td>
          </tr>
        `;
      })
      .join('');

    const safe = (value) => escapeHtml(
      value === undefined || value === null ? '' : String(value)
    );

    const address = [
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
    ]
      .filter(Boolean)
      .map(safe)
      .join(', ');

    const orderDetailsHtml = `
      <h2>Order #${safe(orderId)}</h2>
      <p><strong>Customer:</strong> ${safe(fullName)}</p>
      <p><strong>Email:</strong> ${safe(email)}</p>
      <p><strong>Phone:</strong> ${safe(phone)}</p>
      <p><strong>Address:</strong> ${address || 'Not provided'}</p>
      <p><strong>Payment method:</strong> ${safe(paymentMethod)}</p>
      <p><strong>Order status:</strong> ${safe(status || 'pending')}</p>
      ${note ? `<p><strong>Note:</strong> ${safe(note)}</p>` : ''}

      <table border="1" cellpadding="8" cellspacing="0">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <p><strong>Subtotal:</strong> ${safe(subtotal)}</p>
      <p><strong>Discount:</strong> ${safe(discountAmount)}</p>
      <p><strong>Shipping:</strong> ${safe(shipping)}</p>
      <p><strong>Total:</strong> ${safe(total)}</p>
    `;

    // Send admin notification
    await transporter.sendMail({
      from: `"Lamp & Glow" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Order #${orderId}`,
      html: `
        <h1>New order received</h1>
        ${orderDetailsHtml}
      `,
    });

    // Send customer confirmation
    await transporter.sendMail({
      from: `"Lamp & Glow" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Order Confirmation #${orderId}`,
      html: `
        <h1>Thank you for your order, ${safe(fullName || 'Customer')}!</h1>
        <p>We have received your order. Here are your order details:</p>
        ${orderDetailsHtml}
        <p>If you have any questions, please contact info@lampandglow.pk.</p>
      `,
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

// Escape user-provided text before inserting it into HTML
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Handle malformed JSON and other errors
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

// Start server using Hostinger's assigned port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Lamp & Glow Email API running on port ${PORT}`);
});
