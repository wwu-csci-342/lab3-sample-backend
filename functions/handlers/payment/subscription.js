const { db } = require("../../utils/admin");

exports.getSubscription = async (req, res) => {
  // gather data
  const data = {
    email: req.user.email,
  };

  let result = {};

  const user = await db.doc(`/users/${data.email}`).get();
  result.tier = user.data().tier;
  result.renewTime = user.data().renewTime;

  const subscription = await db
    .doc(`/users/${data.email}/subscription/stripe`)
    .get();
  if (subscription.exists) result.canceled = subscription.data().canceled;

  return res.status(200).json({
    result: result,
  });
};
