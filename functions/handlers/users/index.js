const { db } = require("../../utils/admin");

exports.setUser = async (req, res) => {
  // gather data
  const data = {
    email: req.user.email,
  };

  const userDoc = db.doc(`/users/${data.email}`);
  await userDoc.set({
    tier: "free",
    renewTime: "",
  });

  return res.status(200).json({
    result: true,
  });
};
