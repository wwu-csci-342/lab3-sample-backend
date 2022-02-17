const { db } = require("../../utils/admin");

exports.getSubscription = async (req, res) => {
  // gather data
  const data = {
    email: req.user.email,
  };

  let result = {};

  const user = await db.doc(`/users/${data.email}`).get();
  // olde user
  if (user.exists && user.data() && user.data().tier) {
    result.tier = user.data().tier;
    result.renewTime = user.data().renewTime;
  } else {
    // new user
    await user.ref.set({
      tier: "free",
      renewTime: "",
    });

    result.tier = "free";
    result.renewTime = "";
  }

  const subscription = await db
    .doc(`/users/${data.email}/subscription/stripe`)
    .get();
  if (subscription.exists) result.canceled = subscription.data().canceled;

  return res.status(200).json({
    result: result,
  });
};
