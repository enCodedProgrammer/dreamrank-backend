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




app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    // 1️⃣ Verify webhook signature
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send("Webhook Error");
    }

    // 2️⃣ Handle successful payment
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;

      // 🔴 Safety check
      if (!paymentIntent.customer) {
        console.error("❌ No customer on PaymentIntent:", paymentIntent.id);
        return res.json({ received: true });
      }

      try {
        // 3️⃣ Prevent duplicate invoices (idempotency)
        const existingInvoices = await stripe.invoices.list({
          customer: paymentIntent.customer,
          limit: 10,
        });

        const alreadyInvoiced = existingInvoices.data.some(inv =>
          inv.metadata?.payment_intent === paymentIntent.id
        );

        if (alreadyInvoiced) {
          console.log("⚠️ Invoice already exists for:", paymentIntent.id);
          return res.json({ received: true });
        }

        // 4️⃣ Create invoice item
        await stripe.invoiceItems.create({
          customer: paymentIntent.customer,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          description: paymentIntent.metadata.productName,
        });

        // 5️⃣ Create & finalize invoice
        const invoice = await stripe.invoices.create({
          customer: paymentIntent.customer,
          auto_advance: false,
          metadata: {
            payment_intent: paymentIntent.id, // 🔥 idempotency marker
          },
        });

    //     const xanoUrl = "https://xano.io/api:YOUR_API_KEY/users"; // replace with your endpoint

    // // Make POST request to Xano
    // const response = await axios.post(xanoUrl, {
    //   invoiceId: invoice.id,
    //   invoicePdf: invoice.invoice_pdf,
    //   hostedInvoiceUrl: invoice.hosted_invoice_url,
    //   }, {
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Authorization": "Bearer YOUR_XANO_API_KEY" // if your API requires authentication
    //   }
    // });




        console.log("✅ Invoice created:", invoice);


        // 3️⃣ Finalize immediately (🔥 THIS sends the email)
        await stripe.invoices.finalizeInvoice(invoice.id);

        console.log("Invoice finalized & email sent:", invoice.id);


      } catch (err) {
        console.error("❌ Invoice creation failed:", err);
      }
    }

    res.json({ received: true });
  }
);






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








// // Expose a endpoint as a webhook handler for asynchronous events.
// // Configure your webhook in the stripe developer dashboard
// // https://dashboard.stripe.com/test/webhooks
// app.post('/webhook', async (req, res) => {
//   let data, eventType;

//   // Check if webhook signing is configured.
//   if (process.env.STRIPE_WEBHOOK_SECRET) {
//     // Retrieve the event by verifying the signature using the raw body and secret.
//     let event;
//     let signature = req.headers['stripe-signature'];
//     try {
//       event = stripe.webhooks.constructEvent(
//         req.rawBody,
//         signature,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.log(`⚠️  Webhook signature verification failed.`);
//       return res.sendStatus(400);
//     }
//     data = event.data;
//     eventType = event.type;
//   } else {
//     // Webhook signing is recommended, but if the secret is not configured in `config.js`,
//     // we can retrieve the event data directly from the request body....
//     data = req.body.data;
//     eventType = req.body.type;
//   }

//   if (eventType === 'payment_intent.succeeded') {
//     // Funds have been captured
//     // Fulfill any orders, e-mail receipts, etcc
//     // To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)

//       const paymentIntent = event.data.object;

//       // 1️⃣ Create invoice line item
//       await stripe.invoiceItems.create({
//         customer: paymentIntent.customer,
//         amount: paymentIntent.amount,
//         currency: paymentIntent.currency,
//         description: paymentIntent.metadata.productName,
//       });

//       // 2️⃣ Create & finalize invoice
//       const invoice = await stripe.invoices.create({
//         customer: paymentIntent.customer,
//         auto_advance: true, // 🔥 auto finalize
//       });

//       console.log("Invoice created:", invoice.id);

//     res.json({ received: true });




//     console.log('💰 Payment captured!');
//   } else if (eventType === 'payment_intent.payment_failed') {
//     console.log('❌ Payment failed.');
//   }
//   res.sendStatus(200);
// });














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
        const { accountId, name, price } = req.body; // price is in Euros (e.g., 100)

        // 1. Convert to cents to avoid floating point issues
        const baseCents = price * 100;

        // 2. Calculate fees
        const platformFee = baseCents * 0.10;          // 5% Dreamranks customers fee
        //const processingFee = ((baseCents + platformFee ) * 0.015) + 25; // 1.5% + 25 cents stripe fee
        // 3. Calculate total and round to nearest integer
        const totalAmountCents = Math.round(baseCents + platformFee);

        // CCreate the Product
        const product = await stripe.products.create({ name });

        // Create the Price with the bundled fees
        const priceObj = await stripe.prices.create({
            unit_amount: totalAmountCents,
            currency: "eur",
            product: product.id,
            // If this is a subscription, add: recurring: { interval: 'month' },
        });

        res.json({ 
            priceId: priceObj.id, 
            totalCharged: totalAmountCents / 100 // Returns total in EUR for your UI
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




// 1️⃣ Create a Payment Intent (Charge User)
app.post("/create-payment-intent", async (req, res) => {
  const priceId = req.body.priceId
  const paymentOption = req.body.paymentOption

  console.log("priceID", priceId)
  
  if (paymentOption == "paypal") {
  try {

      // Fetch price from Stripe
      const price = await stripe.prices.retrieve(priceId);
      const amount = price.unit_amount; // Get price amount in cents
      console.log("price", price)


      // 2️⃣ Fetch product details from Stripe to get the name
      const product = await stripe.products.retrieve(price.product);
      const productName = product.name;

      console.log("product", product)



      const customer = await stripe.customers.create({
        email: req.body.email,
        name: req.body.name,
      });



      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "eur",
          customer: customer.id,
          payment_method_types: [paymentOption],
          //automatic_payment_methods: {
          //  enabled: true,
          //}
            payment_method_data: {
            type: 'paypal',
          },
          metadata: { productName } // ✅ Store product name inside Stripe
      });

      res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.log(error)
      res.status(500).json({ error: error.message });
  } 

} else {

    try {

      // Fetch price from Stripe
      const price = await stripe.prices.retrieve(priceId);
      const amount = price.unit_amount; // Get price amount in cents
      console.log("price", price)


      // 2️⃣ Fetch product details from Stripe to get the name
      const product = await stripe.products.retrieve(price.product);
      const productName = product.name;

      console.log("product", product)



      const customer = await stripe.customers.create({
        email: req.body.email,
        name: req.body.name,
      });



      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "eur",
          customer: customer.id,
          payment_method_types: [paymentOption],
          //automatic_payment_methods: {
          //  enabled: true,
          //},
          metadata: { productName } // ✅ Store product name inside Stripe
      });

      res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.log(error)
      res.status(500).json({ error: error.message });
  }

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
                    currency: "eur",
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
