require("dotenv").config();
const dayjs = require("dayjs");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { db } = require("../../utils/admin");

/*
 * Stripe
 */
// create a subscription
exports.createStripeSubscription = async (req, res) => {
  // gather data
  const data = {
    email: req.user.email,
  };
  data.customerID = await getStripeCustomerIDCore(data.email);

  const subscription = await stripe.subscriptions.create({
    customer: data.customerID,
    items: [
      {
        price: process.env.MONTHLY_STRIPE,
      },
    ],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });

  let result = {
    subscriptionID: subscription.id,
    clientSecret: subscription.latest_invoice.payment_intent.client_secret,
  };

  res.status(200).json({
    result: result,
  });
};

// create client secret
exports.createPaymentIntent = async (req, res) => {
  const data = {
    email: req.user.email,
  };
  data.customerID = await getStripeCustomerIDCore(data.email);

  const setupIntent = await stripe.setupIntents.create({
    customer: data.customerID,
    payment_method_types: ["card"],
  });

  // update stripeDoc
  const stripeDoc = db.doc(`/users/${data.email}/subscription/stripe`);
  stripeDoc.update({ setupIntentId: setupIntent.id });

  let result = {
    clientSecret: setupIntent.client_secret,
  };

  res.status(200).json({ result: result });
};

// cancel a subscription
exports.cancelStripeSubscription = async (req, res) => {
  const data = {
    email: req.user.email,
  };

  let result = await cancelStripeSubscriptionCore(data.email);

  if (result) return res.status(200).json({ result: true });
  return res
    .status(404)
    .json({ error: "The subscription is either deleted or no longer active." });
};

// webhook
exports.stripeWebhook = async (req, res) => {
  // Retrieve the event by verifying the signature using the raw body and secret.
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody.toString(),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log(err);
    console.log(`Webhook signature verification failed.`);
    console.log(`Check the env file and enter the correct webhook secret.`);
    return res.sendStatus(400);
  }

  // Extract the object from the event.
  let dataObject = event.data.object;

  // get all information from stripe
  const email = dataObject.customer_email;
  const subscription_id = dataObject.subscription;
  const payment_intent_id = dataObject.payment_intent;

  // Handle the event
  switch (event.type) {
    case "invoice.payment_succeeded":
      /* NEW SUBSCRIPTION */
      // for newly created subscription that is paid immediately (payment_intent_id)
      if (
        dataObject["billing_reason"] === "subscription_create" &&
        payment_intent_id
      ) {
        //get paymentIntent
        paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

        // update subscription
        subscription = await stripe.subscriptions.update(subscription_id, {
          default_payment_method: paymentIntent.payment_method,
        });

        // get payment method
        payment = await stripe.paymentMethods.retrieve(
          paymentIntent.payment_method
        );
        subscription.paymentInfo =
          payment.card.brand + " " + payment.card.last4;

        // record the first payment data
        await recordStripeSubscriptionCore(email, subscription);
      } else if (dataObject["billing_reason"] === "subscription_cycle") {
        /* RECURRING SUBSCRIPTION PAYMENT */
        // get subscription
        subscription = await stripe.subscriptions.retrieve(subscription_id);

        // record subscription info to storage
        await recordStripeSubscriptionCore(email, subscription);
      }

      break;
    case "invoice.payment_failed":
      // If the payment fails or the customer does not have a valid payment method,
      //  an invoice.payment_failed event is sent, the subscription becomes past_due.
      // Use this webhook to notify your user that their payment has
      // failed and to retrieve new card details.
      const userDoc = db.doc(`/users/${data.email}`);
      await userDoc.update({
        tier: "free",
        renewTime: "",
      });

      break;
    default:
      // Unexpected event type
      break;
  }
  res.sendStatus(200);
};

// first payment of a new subscription
exports.firstStripePayment = async (req, res) => {
  const data = {
    email: req.user.email,
    planName: req.body.planName,
  };

  // user doc
  const userDoc = db.doc(`/users/${data.email}`);
  await userDoc.update({
    tier: "premium",
    renewTime: dayjs().add(1, "month").format(),
  });

  res.status(200).json({ result: true });
};

/* Helper methods */
// store data for subscription
const recordStripeSubscriptionCore = async (email, subscription) => {
  // prepare all variables
  let currentTime = new Date(
    subscription.current_period_start * 1000
  ).toISOString();
  let renewTime = new Date(
    subscription.current_period_end * 1000
  ).toISOString();
  let plan = "Monthly";

  // prepare batch
  let batch = db.batch();

  // updates in all scenarios
  // first: user doc
  const userDoc = db.doc(`/users/${email}`);
  batch.update(userDoc, {
    tier: "premium",
    renewTime: renewTime,
  });

  // second: subscription doc
  const stripeDoc = db.doc(`/users/${email}/subscription/stripe`);
  batch.update(stripeDoc, {
    subscriptionID: subscription.id,
    paymentMethod: subscription.paymentInfo,
    canceled: false,
    plan: plan,
    priceTotal: 5,
    priceMonthly: 5,
    lastBilledAt: currentTime,
  });

  // third invoice doc
  const newInvoice = db.collection(`/users/${email}/invoices`).doc();
  batch.set(newInvoice, {
    subscriptionID: subscription.id,
    time: currentTime,
    timestamp: new Date(currentTime),
    status: "paid",
    amount: 5,
  });

  // Commit the batch
  await batch.commit();

  return true;
};

// cancel stripe subscription
const cancelStripeSubscriptionCore = async (email) => {
  const subscriptionDocPath = db.doc(`/users/${email}/subscription/stripe`);
  const subscriptionDoc = await subscriptionDocPath.get();

  if (
    !subscriptionDoc.exists ||
    subscriptionDoc.data().subscriptionID === undefined
  ) {
    return false;
  }

  const subscriptionID = subscriptionDoc.data().subscriptionID;
  const canceled = subscriptionDoc.data().canceled;

  if (canceled) {
    return false;
  }

  // Delete the subscription from stripe
  const deletedSubscription = await stripe.subscriptions.del(subscriptionID);

  // let local database know
  if (deletedSubscription.status === "canceled") {
    await subscriptionDocPath.update({
      canceled: true,
    });

    return true;
  } else {
    return false;
  }
};

// create a stripe customer
const getStripeCustomerIDCore = async (email) => {
  const stripeDoc = await db.doc(`/users/${email}/subscription/stripe`).get();

  if (stripeDoc.exists && stripeDoc.data().customerID) {
    // a customer exists
    return stripeDoc.data().customerID;
  } else {
    // Create a new customer object
    const customer = await stripe.customers.create({
      email: email,
    });

    // update local copy
    await db
      .doc(`/users/${email}/subscription/stripe`)
      .set({ customerID: customer.id });

    return customer.id;
  }
};