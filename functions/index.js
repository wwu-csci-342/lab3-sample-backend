// firebase and framework
const functions = require("firebase-functions");
const app = require("express")();
const cors = require("cors");
const { errorHandle, authenticate } = require("./utils/middleware");

const {
  getTasks,
  addTask,
  getTask,
  updateTask,
  deleteTask,
} = require("./handlers/tasks");

const {
  getSubscription,
  createStripeSubscription,
  createPaymentIntent,
  firstStripePayment,
  cancelStripeSubscription,
  stripeWebhook,
} = require("./handlers/payment");

// stripe webhook - can not have any security rules
app.post("/subscription/stripe/webhook", stripeWebhook);

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  })
);

app.use(authenticate);

// tasks
app.get("/tasks", getTasks);
app.post("/tasks", addTask);
app.get("/tasks/:id", getTask);
app.put("/tasks/:id", updateTask);
app.delete("/tasks/:id", deleteTask);

// subscription
app.get("/subscription", getSubscription);

// payment: stripe
app.get("/subscription/stripe/create", createStripeSubscription);
app.get("/subscription/stripe/paymentIntent", createPaymentIntent);
app.get("/subscription/stripe/cancel", cancelStripeSubscription);
app.post("/subscription/stripe/firstpay", firstStripePayment);

app.use(errorHandle);

exports.api = functions.https.onRequest(app);
