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
        console.error("❌ No customer on PaymentIntent:", paymentIntent.id, paymentIntent);
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
          collection_method: 'send_invoice', // 🔥 Required to use sendInvoice()
          days_until_due: 30,
          auto_advance: false,
          metadata: {
            payment_intent: paymentIntent.id, // 🔥 idempotency marker
          },
        });




                console.log("✅ Invoice created:", invoice);


        // 3️⃣ Finalize immediately (🔥 THIS sends the email)
        await stripe.invoices.finalizeInvoice(invoice.id);
        await stripe.invoices.sendInvoice(invoice.id);


        console.log("Invoice finalized & email sent:", invoice.id);




        const xanoUrl = `https://xrrb-7twc-ygpm.n7e.xano.io/api:lNR00Q5X/orders/1`; // replace with your endpoint

    // Make POST request to Xano
    const response = await axios.put(xanoUrl, {
      userId: paymentIntent.metadata.userId,
      invoicePdf: invoice.invoice_pdf,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      }, {
      headers: {
        "Content-Type": "application/json",
      }
    });


    console.log("xnao invoice sent", response)






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
      console.error("Stripe Error:", error);
      res.status(500).json({ 
        message: error.message,
        type: error.type,
        raw: error.raw
    });
        //res.status(500).json({ error: error.message });
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



app.post("/update-price", async(req, res)=> {
  const product = req.body.product;


    let data = []

      for (let prod=0; prod<product.length; prod++) {

      const editedPriceId = product[prod].editedPriceId
      const id = product[prod].id
      const duration = product[prod].duration
      const description = product[prod].description



      const price = await stripe.prices.retrieve(editedPriceId);

      const productId = price.product; 

      console.log("The Product ID is:", productId);


   // 1. Convert to cents to avoid floating point issues
        const baseCents = product[prod].editedPrice * 100;

        // 2. Calculate fees
        const platformFee = baseCents * 0.10;          // 5% Dreamranks customers fee
        //const processingFee = ((baseCents + platformFee ) * 0.015) + 25; // 1.5% + 25 cents stripe fee
        // 3. Calculate total and round to nearest integer
        totalAmountCents = Math.round(baseCents + platformFee);

        newPrice = await stripe.prices.create({
          unit_amount: totalAmountCents,
          currency: "eur",
          product: productId,
        })
        const newData = {
          id,
          duration,
          description,
          priceId: newPrice.id,
          //newPriceId: newPrice.id,
          amount: totalAmountCents /100
        }
        data.push(newData)

      }

        res.json(data)

})



// 1️⃣ Create a Payment Intent (Charge User)
app.post("/create-payment-intent", async (req, res) => {
  const priceId = req.body.priceId
  const paymentOption = req.body.paymentOption
  const userId = req.body.userId

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



      const paymentMethods = await stripe.paymentMethods.list({
  customer: customer.id,
  type: 'paypal',
});



      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "eur",
          customer: customer.id,
          payment_method_types: [paymentOption],
          metadata: {
            userId: userId, 
          },
          //automatic_payment_methods: {
          //  enabled: true,
          //}
          payment_method: paymentMethods.id,
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
          metadata: {
            userId: userId
          },
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
