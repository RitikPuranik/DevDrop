'use strict';

const jobs = require('./emailJobs');

// Token minting stays on the request path (DB only); delivery is queued.
// A new token invalidates the previous one, so we never mint inside the cooldown window.

const requestVerificationEmail = async (user) => {
  if (await jobs.verificationEmailRecentlyRequested(user._id)) return { throttled: true };
  const token = user.generateVerificationToken();
  await user.save();
  const queued = await jobs.enqueueVerificationEmail(user, token);
  return { throttled: false, ...queued };
};

const requestPasswordResetEmail = async (user) => {
  const token = user.generateResetPasswordToken();
  await user.save();
  return jobs.enqueuePasswordResetEmail(user, token);
};

const isQueueUnavailable = (error) => error?.code === 'QUEUE_UNAVAILABLE';

module.exports = { requestVerificationEmail, requestPasswordResetEmail, isQueueUnavailable };
