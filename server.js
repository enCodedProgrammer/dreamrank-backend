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

    if (event.type === "payment_intent.succeeded") {


      const paymentIntent = event.data.object;
        const metadata = paymentIntent.metadata;

        if (metadata.creatorAccountId && metadata.creatorAccountId !== "none") {
            try {
                const transfer = await stripe.transfers.create({
                    amount: parseInt(metadata.creatorCutCents), 
                    currency: 'eur',
                    destination: metadata.creatorAccountId,
                    description: `Creator commission for ${metadata.productName}`,
                    transfer_group: paymentIntent.transfer_group 
                });

                console.log(`✅ Creator Payout Successful: ${transfer.id}`);
            } catch (transferError) {
                console.error("❌ Creator Payout Failed:", transferError.message);
            }
        }




      // 🔴 Safety check
      if (!paymentIntent.customer) {
        console.error("❌ No customer on PaymentIntent:", paymentIntent.id, paymentIntent);
        return res.json({ received: true });
      }
      

      try {

        const metadata = paymentIntent.metadata;

            const {
              userId,
              productName,
              coachName,
              coachEmail,
              planId,
              coachId,
              planName,
              startTime,
              price,
              endTime,
              username
            } = metadata;

                      const charge = await stripe.charges.retrieve(
              paymentIntent.latest_charge
            );

            console.log(charge.receipt_url);

        console.log(`Updating payment ${paymentIntent.id} for User ${userId}`);
        
        const updatePayment = await axios.post(`https://xrrb-7twc-ygpm.n7e.xano.io/api:Z2-WZuPJ/payments_`,  {
                user_id: userId,
                payment_id: paymentIntent.id,
                amount: price,
                coach_id: coachId,
            }, {
          headers: {
          "Content-Type": "application/json",
          }
          });




          const postOrder = await axios.post(`https://xrrb-7twc-ygpm.n7e.xano.io/api:Z2-WZuPJ/orders`,  {
          user_id: userId,
          payment_id: paymentIntent.id,
          price: price,
          coach_id: coachId,
          offers_id: planId,
          status: "Bestellt",
          startDateTime: startTime,
          endDateTime: endTime,
          user: username,
          offer: planName,
          receiptUrl: charge.receipt_url
          }, {
          headers: {
          "Content-Type": "application/json",
          }
          });
        

        // 4. Send success back to Wized
        res.json({ 
            success: true, 
            message: "Payment record updated successfully",
            receivedData: { userId, price, coachId }
        });












        // // 3️⃣ Prevent duplicate invoices (idempotency)
        // const existingInvoices = await stripe.invoices.list({
        //   customer: paymentIntent.customer,
        //   limit: 10,
        // });

        // const alreadyInvoiced = existingInvoices.data.some(inv =>
        //   inv.metadata?.payment_intent === paymentIntent.id
        // );

        // if (alreadyInvoiced) {
        //   console.log("⚠️ Invoice already exists for:", paymentIntent.id);
        //   return res.json({ received: true });
        // }

        // // 4️⃣ Create invoice item
        // await stripe.invoiceItems.create({
        //   customer: paymentIntent.customer,
        //   amount: paymentIntent.amount,
        //   currency: paymentIntent.currency,
        //   description: paymentIntent.metadata.productName,
        // });

        // // 5️⃣ Create & finalize invoice
        // const invoice = await stripe.invoices.create({
        //   customer: paymentIntent.customer,
        //   collection_method: 'send_invoice', // 🔥 Required to use sendInvoice()
        //   days_until_due: 30,
        //   auto_advance: false,
        //   metadata: {
        //     payment_intent: paymentIntent.id, // 🔥 idempotency marker
        //   },
        // });




        //         console.log("✅ Invoice created:", invoice);


        // // 3️⃣ Finalize immediately (🔥 THIS sends the email)
        // await stripe.invoices.finalizeInvoice(invoice.id);
        // await stripe.invoices.sendInvoice(invoice.id);


        // console.log("Invoice finalized & email sent:", invoice.id);




    //     const xanoUrl = `https://xrrb-7twc-ygpm.n7e.xano.io/api:lNR00Q5X/orders/1`; // replace with your endpoint

    // // Make POST request to Xano
    // const response = await axios.put(xanoUrl, {
    //   userId: paymentIntent.metadata.userId,
    //   receiptUrl: charge.receipt_url,
    //   }, {
    //   headers: {
    //     "Content-Type": "application/json",
    //   }
    // });


    // console.log("xnao invoice sent", response)






      } catch (err) {
        console.error("❌ Error updating order:", err);
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
        const { email, coachId, coachToken } = req.body;
        const account = await stripe.accounts.create({
            type: "express",
            email: email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        });

        coaches.push({ email, accountId: account.id, earnings: 0 });

        //res.json({ accountId: account.id });

        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: "https://www.dreamranks.de/coach/dashboard",
          return_url: "https://www.dreamranks.de/coach/dashboard",
          type: "account_onboarding"
        });





        const patchCoachStripe = await axios.patch(`https://xrrb-7twc-ygpm.n7e.xano.io/api:HFnfW3ex/coach_stripe/${coachId}`,  {
          coach_id: coachId,
          stripe_account_id: account.id,
          onboardingUrl: accountLink.url 
     
          }, {
          headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${coachToken}`,
          }
          });





        res.json({
          accountId: account.id,
          onboardingUrl: accountLink.url
        });

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
        const { planList, coachName, coachEmail, group, name, description, duration, coach_id, aktiv, coachToken } = req.body; // price is in Euros (e.g., 100)
        console.log("req.body", req.body)
        let response = []

        for (let i=0; i<planList.length; i++) {
        // 1. Convert to cents to avoid floating point issues
        const baseCents = planList[i].price * 100;

        // 2. Calculate fees
        const platformFee = baseCents * 0.10;          // 10% Dreamranks customers fee
        //const processingFee = ((baseCents + platformFee ) * 0.015) + 25; // 1.5% + 25 cents stripe fee
        // 3. Calculate total and round to nearest integer
        const totalAmountCents = Math.round(baseCents + platformFee);

        // CCreate the Product
        const product = await stripe.products.create({
          //name: planList[i].name,
          name: `${planList[i].bundle}X - ${group} ${name} Discount: ${planList[i].discount}%`,
          metadata: {
            coachName: coachName ,
            coachEmail: coachEmail
          } // 👈 Tag it here        
        });

        // Create the Price with the bundled fees
        const priceObj = await stripe.prices.create({
            unit_amount: totalAmountCents,
            currency: "eur",
            product: product.id,
        });


        response.push({priceId: priceObj.id, totalCharged: totalAmountCents / 100})


          const postPlan = await axios.post(`https://xrrb-7twc-ygpm.n7e.xano.io/api:HFnfW3ex/createplan`,  {
          price_id: priceObj.id,
          name: `${group} ${name}`,
          group: group,
          topic: name,
          bundle: planList[i].bundle,
          discount: planList[i].discount,
          description: description,
          price: planList[i].price,
          duration: duration,
          coach_id: coach_id,
          aktiv: aktiv,        
          }, {
          headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${coachToken}`,
          }
          });

      }

      res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
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
  const coachId = req.body.coachId
  const planId = req.body.planId
 const  planName = req.body.planName
 const  startTime = req.body.startTime
 const endTime = req.body.endTime
 const xanoPrice = req.body.price
 const username = req.body.username
 const coachStripeAccountId = req.body.coachStripeAccountId
 const coachFees = req.body.coachFees / 100
 const creatorStripeAccountId = req.body?.creatorStripeAccountId

const validCreatorAccount = creatorStripeAccountId !== "null" ? true : false

  console.log("body", req.body)
  
  if (paymentOption == "paypal") {
  try {

      // Fetch price from Stripe
      const price = await stripe.prices.retrieve(priceId);
      const amount = price.unit_amount; // Get price amount in cents
      console.log("price", price)


      // 2️⃣ Fetch product details from Stripe to get the name
      const product = await stripe.products.retrieve(price.product);


      // 2. Extract coachName from product metadata
        const coachName = product.metadata.coachName || "Unknown Coach";
        const coachEmail = product.metadata.coachEmail || "Unknown Email"
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


      const creatorCutCents = validCreatorAccount ? Math.round(amount * 0.05) : 0;

      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "eur",
          customer: customer.id,
          payment_method_types: [paymentOption],

            // ✅ PLATFORM FEE (your 10%)
          application_fee_amount: Math.round((amount * 0.10) + (amount * coachFees)),

          // ✅ SEND REMAINDER TO COACH
          transfer_data: {
            destination: coachStripeAccountId,
          },

          //payment_method: paymentMethods.id,
          metadata: { 
                userId: userId,
                productName: productName,
                coachName: coachName, // 👈 Now it shows in the payment!
                coachEmail: coachEmail,
                planId: planId,
                price: xanoPrice,
                coachId: coachId,
                planName: planName,
                startTime: startTime,
                endTime: endTime,
                username: username,
                creatorAccountId: validCreatorAccount ? creatorStripeAccountId : "none",
                creatorCutCents: creatorCutCents

            }
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
            // 2. Extract coachName from product metadata
        const coachName = product.metadata.coachName || "Unknown Coach";
        const coachEmail = product.metadata.coachEmail || "Unknown Email"
        const productName = product.name;

      console.log("product", product)



      const customer = await stripe.customers.create({
        email: req.body.email,
        name: req.body.name,
      });



            const creatorCutCents = creatorStripeAccountId ? Math.round(amount * 0.05) : 0;

      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "eur",
          customer: customer.id,
          payment_method_types: [paymentOption],

            // ✅ PLATFORM FEE (your 10%)
          application_fee_amount: Math.round(amount * 0.10 + amount * 0.90 * coachFees + creatorCutCents),

          // ✅ SEND REMAINDER TO COACH
          transfer_data: {
            destination: coachStripeAccountId,
          },

          //payment_method: paymentMethods.id,
          metadata: { 
                userId: userId,
                productName: productName,
                coachName: coachName, // 👈 Now it shows in the payment!
                coachEmail: coachEmail,
                planId: planId,
                price: xanoPrice,
                coachId: coachId,
                planName: planName,
                startTime: startTime,
                endTime: endTime,
                username: username,
                creatorAccountId: validCreatorAccount ? creatorStripeAccountId : "none",
                creatorCutCents: creatorCutCents

            }
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



app.post("/withdraw", async (req, res) => {
  try {
    const { accountId, amount } = req.body; // amount in EUR

    // Convert to cents
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100),
        currency: "eur"
      },
      {
        stripeAccount: accountId
      }
    );

    res.json({
      success: true,
      payout
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});








// 1️⃣ Create Stripe Connect Account
app.post("/create-stripe-account-creator", async (req, res) => {
    try {
        const { email, creatorId, creatorToken } = req.body;
        const account = await stripe.accounts.create({
            type: "express",
            email: email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        });

        //coaches.push({ email, accountId: account.id, earnings: 0 });

        //res.json({ accountId: account.id });

        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: "https://www.dreamranks.de/creator/dashboard",
          return_url: "https://www.dreamranks.de/creator/dashboard?onboarded=true",
          type: "account_onboarding"
        });





        const patchCreatorStripe = await axios.patch(`https://xrrb-7twc-ygpm.n7e.xano.io/api:2CH26AKL/creator_stripe/${creatorId}`,  {
          creator_id: creatorId,
          stripe_account_id: account.id,
          onboardingUrl: accountLink.url 
     
          }, {
          headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${creatorToken}`,
          }
          });





        res.json({
          accountId: account.id,
          onboardingUrl: accountLink.url
        });

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


app.post("/creator-reauth", async (req, res) => {
  try {
    console.log("body", req.body)
    const accountId = req.body.accountId; // or get from session/database

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://www.dreamranks.de/creator/dashboard",
      return_url: "https://www.dreamranks.de/creator/dashboard?onboarded=true",
      type: "account_onboarding"
    });

    res.json({url: accountLink.url});

  } catch (error) {
  console.error("Stripe Error:", {
    message: error.message,
    type: error.type,
    code: error.code,
    param: error.param,
    raw: error.raw
  });

  res.status(500).json({
    message: error.message,
    code: error.code
  });
}
});



app.post("/reauth", async (req, res) => {
  try {
    console.log("body", req.body)
    const accountId = req.body.accountId; // or get from session/database

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://www.dreamranks.de/coach/dashboard",
      return_url: "https://www.dreamranks.de/coach/dashboard?onboarded=true",
      type: "account_onboarding"
    });

    res.json({url: accountLink.url});

  } catch (error) {
  console.error("Stripe Error:", {
    message: error.message,
    type: error.type,
    code: error.code,
    param: error.param,
    raw: error.raw
  });

  res.status(500).json({
    message: error.message,
    code: error.code
  });
}
});





// On your Vercel backend (e.g., /verify-creator-status)
app.post("/verify-stripe-account", async(req, res) => {
  const { accountId, client, token, id } = req.body;

  console.log("body", req.body)

  try {
    // 1️⃣ Ask Stripe for the real account data
    const account = await stripe.accounts.retrieve(accountId);

    // 2️⃣ Check if they actually finished onboarding
    if (account.details_submitted) {
      
      // 3️⃣ Securely update your Xano database here!
          if (client == "coach") {
          const patchCoachOnboarded = await axios.put(`https://xrrb-7twc-ygpm.n7e.xano.io/api:HFnfW3ex/coach_onboarded/${id}`,  {
          coach_id: id,
          onboarded: true,
     
          }, {
          headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          }
          });

        } else {

          const patchCreatorOnboarded = await axios.put(`https://xrrb-7twc-ygpm.n7e.xano.io/api:2CH26AKL/creator-onboarded/${id}`,  {
          creator_id: id,
          onboarded: true,
     
          }, {
          headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          }
          });

        }

      // await updateXanoCreatorStatus(accountId, true);
      
      res.status(200).json({ onboarded: true, message: "Onboarding complete!" });
    } else {
      res.status(200).json({ onboarded: false, message: "Onboarding incomplete." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})





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
