"use strict";
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "30kb" }));
const PORT = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
  })
);
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = process.env.SMTP_PASS || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "arbazirfan14@gmail.com").trim();
if (!FRONTEND_ORIGIN || !SMTP_USER || !SMTP_PASS) {
  console.error("Missing required environment variables: FRONTEND_ORIGIN, SMTP_USER, SMTP_PASS.");
  process.exit(1);
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === FRONTEND_ORIGIN) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  optionsSuccessStatus: 204
}));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
});
function esc(v) { return String(v ?? "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
function val(v, fallback = "—") { const s = String(v ?? "").trim(); return s || fallback; }
function money(v) { const n = Number(v); return Number.isFinite(n) ? `PKR ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}` : "—"; }
function validEmail(v) { return typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function buildEmail(o) {
  const address = [o.addressLine1, o.addressLine2, o.city, o.state, o.postalCode].filter(Boolean).map(esc).join(", ");
  const rows = o.items.map(i => {
    const qty = Math.max(1, Math.min(999, Number.parseInt(i.quantity, 10) || 1));
    const opts = [i.colorVariant, i.shadeColor, i.bulbOption].filter(Boolean).map(esc).join(" / ");
    return `<tr><td style="padding:10px;border-bottom:1px solid #eee">${esc(val(i.name, "Product"))}${opts ? `<br><small>${opts}</small>` : ""}</td><td style="padding:10px;text-align:center;border-bottom:1px solid #eee">${qty}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #eee">${esc(money(i.unitPrice ?? i.price))}</td></tr>`;
  }).join("");
  const details = [["Order ID", val(o.orderId)], ["Customer", val(o.fullName)], ["Email", val(o.email)], ["Phone", val(o.phone)], ["Address", address || "—"], ["Payment method", val(o.paymentMethod)], ["Order status", val(o.status, "Placed")]]
    .map(([k, v]) => `<tr><td style="padding:7px 10px;color:#666">${esc(k)}</td><td style="padding:7px 10px">${v}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:720px;margin:auto"><h2>Lamp &amp; Glow — Order ${esc(o.orderId)}</h2><p>Thank you for shopping with Lamp &amp; Glow.</p><table style="border-collapse:collapse;width:100%;margin:18px 0">${details}</table><h3>Order items</h3><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:10px;text-align:left;border-bottom:2px solid #ddd">Product</th><th style="padding:10px;border-bottom:2px solid #ddd">Qty</th><th style="padding:10px;text-align:right;border-bottom:2px solid #ddd">Unit price</th></tr></thead><tbody>${rows}</tbody></table><table style="border-collapse:collapse;width:100%;margin-top:18px"><tr><td style="padding:6px 10px">Subtotal</td><td style="padding:6px 10px;text-align:right">${esc(money(o.subtotal))}</td></tr><tr><td style="padding:6px 10px">Discount</td><td style="padding:6px 10px;text-align:right">- ${esc(money(o.discountAmount || 0))}</td></tr><tr><td style="padding:6px 10px">Shipping</td><td style="padding:6px 10px;text-align:right">${esc(money(o.shipping || 0))}</td></tr><tr><td style="padding:10px;border-top:2px solid #222;font-weight:bold">Total</td><td style="padding:10px;border-top:2px solid #222;text-align:right;font-weight:bold">${esc(money(o.total))}</td></tr></table>${o.note ? `<p><strong>Order note:</strong> ${esc(o.note)}</p>` : ""}<p style="color:#777;font-size:12px">Automated message from Lamp &amp; Glow.</p></div>`;
  const plainItems = o.items.map(i => `- ${val(i.name, "Product")} x ${Number.parseInt(i.quantity, 10) || 1} — ${money(i.unitPrice ?? i.price)}`).join("\n");
  const text = [`Lamp & Glow — Order ${val(o.orderId)}`, `Customer: ${val(o.fullName)}`, `Email: ${val(o.email)}`, `Phone: ${val(o.phone)}`, `Address: ${address || "—"}`, `Payment: ${val(o.paymentMethod)}`, "", "Items:", plainItems, "", `Subtotal: ${money(o.subtotal)}`, `Discount: ${money(o.discountAmount || 0)}`, `Shipping: ${money(o.shipping || 0)}`, `Total: ${money(o.total)}`].join("\n");
  return { html, text };
}
app.get("/", (_req, res) => res.json({ success: true, service: "Lamp & Glow Email API", status: "running" }));
app.get("/health", (_req, res) => res.json({ success: true, status: "ok" }));
app.post("/api/notify-order", async (req, res) => {
  const o = req.body || {}, email = typeof o.email === "string" ? o.email.trim() : "", orderId = typeof o.orderId === "string" ? o.orderId.trim() : "";
  if (!orderId || orderId.length > 120) return res.status(400).json({ success: false, message: "A valid orderId is required." });
  if (!validEmail(email)) return res.status(400).json({ success: false, message: "A valid customer email is required." });
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 100) return res.status(400).json({ success: false, message: "Order must contain 1 to 100 items." });
  const { html, text } = buildEmail(o);
  try {
    await transporter.sendMail({ from: { name: "Lamp & Glow", address: SMTP_USER }, to: ADMIN_EMAIL, replyTo: email, subject: `New order received: ${orderId}`, text, html });
    await transporter.sendMail({ from: { name: "Lamp & Glow", address: SMTP_USER }, to: email, subject: `Order confirmation — ${orderId}`, text: `Hi ${val(o.fullName, "there")},\nThank you for your order. We have received it.\n\n${text}`, html: `<div style="font-family:Arial,sans-serif"><p>Hi ${esc(val(o.fullName, "there"))},</p><p>Thank you for your order. We have received it.</p>${html}</div>` });
    return res.json({ success: true, message: "Admin and customer emails sent." });
  } catch (e) {
    console.error("Email sending failed:", e?.message || e);
    return res.status(502).json({ success: false, message: "Could not send emails. Check SMTP configuration and server logs." });
  }
});
app.use((err, _req, res, _next) => {
  if (err?.message === "Origin not allowed by CORS") return res.status(403).json({ success: false, message: "Origin not allowed." });
  console.error("Request error:", err?.message || err); return res.status(400).json({ success: false, message: "Invalid request." });
});
app.listen(PORT, "0.0.0.0", () => console.log(`Lamp & Glow Email API listening on port ${PORT}`));
