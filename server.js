const express = require('express');
const app = express();
const Cors = require("cors");
const bodyParser = require("body-parser");
const {resolve} = require('path');
const { WebflowClient } = require("webflow-api");
const { google } = require('googleapis');
const axios = require('axios'); // You may need to install axios using npm or include it via CDN
const { hkdfSync } = require('crypto');
const fetch = require('node-fetch');
const { setTimeout } = require('timers');
const moment = require('moment');


// Replace if using a different env file or config
const env = require('dotenv').config({path: './.env'});

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27;link_beta=v1',
  appInfo: { // For sample support and debugging, not required for production:
    name: "stripe-samples/accept-a-payment/payment-element",
    version: "0.0.2",
    url: "https://github.com/stripe-samples"
  }
});


app.use(Cors({}))
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
//app.use(express.static(process.env.STATIC_DIR));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    },
  })
);




app.get('/a', (req, res) => {
res.send({drug: "drug"})
})





app.get('/config', (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});





// Expose a endpoint as a webhook handler for asynchronous events.
// Configure your webhook in the stripe developer dashboard
// https://dashboard.stripe.com/test/webhooks
app.post('/webhook', async (req, res) => {
  let data, eventType;

  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body....
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === 'payment_intent.succeeded') {
    // Funds have been captured
    // Fulfill any orders, e-mail receipts, etcc
    // To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)
    console.log('💰 Payment captured!');
  } else if (eventType === 'payment_intent.payment_failed') {
    console.log('❌ Payment failed.');
  }
  res.sendStatus(200);
});














let coaches = []; // Store coach details in memory

// 1️⃣ Create Stripe Connect Account
app.post("/create-stripe-account", async (req, res) => {
    try {
        const { email } = req.body;
        const account = await stripe.accounts.create({
            type: "express",
            email: email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        });

        coaches.push({ email, accountId: account.id, earnings: 0 });

        res.json({ accountId: account.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2️⃣ Create a Plan
app.post("/create-plan", async (req, res) => {
    try {
        const { accountId, name, price } = req.body;

        const product = await stripe.products.create({ name });
        const priceObj = await stripe.prices.create({
            unit_amount: price * 100,
            currency: "usd",
            product: product.id,
        });

        res.json({ priceId: priceObj.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3️⃣ Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
    try {
        const { priceId } = req.body;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "payment",
            success_url: "http://localhost:3000/success",
            cancel_url: "http://localhost:3000/cancel",
        });

        res.json({ checkoutUrl: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4️⃣ Pay Coaches (Send 80%)
app.post("/pay-coaches", async (req, res) => {
    try {
        for (let coach of coaches) {
            if (coach.earnings > 0) {
                await stripe.transfers.create({
                    amount: Math.round(coach.earnings * 0.8 * 100), // 80% payout
                    currency: "usd",
                    destination: coach.accountId,
                });

                coach.earnings = 0; // Reset after payout
            }
        }

        res.json({ success: true, message: "Coaches paid!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});





let  port = process.env.PORT;
if (port == null || port == "") {
 port = 3000;
}


app.listen(port, function () {
   console.log("server started onn", port)
})
