const { db } = require("../../utils/admin");

// get all tasks
exports.getTasks = async (req, res) => {
  const email = req.user.email;

  let result = [];

  let taskCollection = await db.collection(`/users/${email}/tasks`).get();

  for (let doc of taskCollection.docs) {
    // prepare result
    result.push({
      id: doc.id,
      ...doc.data(),
    });
  }
  return res.status(200).json({ result: result });
};

// get a single task
exports.getTask = async (req, res) => {
  const email = req.user.email;

  let id = req.params.id;

  let taskDoc = await db.doc(`/users/${email}/tasks/${id}`).get();
  if (!taskDoc.exists) return res.status(200).json({ result: {} });

  // prepare result
  let result = taskDoc.data();
  // make sure id is added before return
  result.id = taskDoc.id;

  return res.status(200).json({ result: result });
};

// add a single task
exports.addTask = async (req, res) => {
  const email = req.user.email;

  let task = req.body.task;

  let taskDoc = db.collection(`/users/${email}/tasks`).doc();
  taskDoc.set({
    text: task.text,
    reminder: task.reminder,
    day: task.day,
  });
  // make sure id is added before return
  task.id = taskDoc.id;

  return res.status(200).json({ result: task });
};

// update a single task
exports.updateTask = async (req, res) => {
  const email = req.user.email;

  let id = req.params.id;
  let reminder = req.body.reminder;

  let taskDocRef = db.doc(`/users/${email}/tasks/${id}`);
  await taskDocRef.update({
    reminder: reminder,
  });

  let taskDoc = await taskDocRef.get();
  let result = taskDoc.data();
  result.id = taskDoc.id;

  return res.status(200).json({ result: result });
};

// delete a task
exports.deleteTask = async (req, res) => {
  const email = req.user.email;
  let id = req.params.id;

  let taskDocRef = db.doc(`/users/${email}/tasks/${id}`);
  await taskDocRef.delete();

  return res.status(200).json({ result: true });
};
