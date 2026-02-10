const cron = require('node-cron');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Website = require('../models/Website');

/**
 * Check if first bid waiting period expired
 * Runs every 5 minutes
 */
const checkFirstBidWaitingPeriod = cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('⏰ Checking expired first-bid auctions...');

    while (true) {

      // ATOMIC winner selection (prevents double processing)
      const auction = await Auction.findOneAndUpdate(
        {
          status: 'first_bid_waiting',
          firstBidDeadline: { $lte: new Date() },
        },
        {
          $set: {
            status: 'awaiting_payment',
            paymentDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          },
        },
        { new: true }
      )
        .populate('websiteId')
        .populate('currentBidderId', 'name email');

      // No more expired auctions
      if (!auction) break;

      try {
        console.log(`\n🎯 Auction ended: ${auction._id}`);
        console.log(
          `Winner: ${auction.currentBidderId?.email || 'Unknown User'}`
        );
        console.log(`Winning bid: ₹${auction.currentBidAmount}`);

        // Mark bid as won
        if (auction.currentBidId) {
          await Bid.updateOne(
            { _id: auction.currentBidId },
            { $set: { status: 'won' } }
          );
        }

        // Update website
        if (auction.websiteId) {
          auction.websiteId.status = 'auction_won';
          auction.websiteId.auctionWinnerId = auction.currentBidderId?._id;
          await auction.websiteId.save();
        }

        console.log(
          `✅ Winner must pay before ${auction.paymentDeadline}`
        );

        // TODO → send winner email

      } catch (err) {
        console.error(`❌ Error finalizing auction ${auction._id}`, err);
      }
    }

  } catch (error) {
    console.error('❌ First bid cron error:', error);
  }
});


/**
 * Check payment deadline expiration
 * Runs every hour
 */
const checkPaymentDeadlines = cron.schedule('0 * * * *', async () => {
  try {
    console.log('⏰ Checking expired payment deadlines...');

    while (true) {

      const auction = await Auction.findOneAndUpdate(
        {
          status: 'awaiting_payment',
          paymentDeadline: { $lte: new Date() },
        },
        {
          $set: { status: 'payment_failed' },
        },
        { new: true }
      )
        .populate('websiteId')
        .populate('currentBidderId', 'name email');

      if (!auction) break;

      console.log(`❌ Payment failed for auction ${auction._id}`);
      console.log(
        `Winner: ${auction.currentBidderId?.email || 'Unknown User'}`
      );
      console.log(`Amount unpaid: ₹${auction.currentBidAmount}`);

      // OPTIONAL:
      // Auto-reopen logic could go here later

      // TODO → send payment failure email
    }

  } catch (error) {
    console.error('❌ Payment deadline cron error:', error);
  }
});


/**
 * Send payment reminders
 * Runs every 6 hours
 */
const sendPaymentReminders = cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('⏰ Checking payment reminders...');

    const now = new Date();
    const next24hrs = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const reminders = await Auction.find({
      status: 'awaiting_payment',
      paymentDeadline: {
        $gt: now,
        $lte: next24hrs,
      },
      paymentReminderSent: false,
    }).populate('currentBidderId', 'name email');

    if (!reminders.length) {
      console.log('✅ No reminders needed');
      return;
    }

    console.log(`📧 Sending ${reminders.length} reminder(s)...`);

    for (const auction of reminders) {

      console.log(
        `Reminder → ${auction.currentBidderId?.email || 'Unknown User'}`
      );

      console.log(`Deadline: ${auction.paymentDeadline}`);
      console.log(`Amount: ₹${auction.currentBidAmount}`);

      auction.paymentReminderSent = true;
      await auction.save();

      // TODO → send reminder email
    }

  } catch (error) {
    console.error('❌ Reminder cron error:', error);
  }
});


/**
 * Start cron jobs
 */
const startCronJobs = () => {

  console.log('🚀 Starting auction cron jobs...\n');

  checkFirstBidWaitingPeriod.start();
  console.log('✅ Winner selector running every 5 minutes');

  checkPaymentDeadlines.start();
  console.log('✅ Payment failure checker running hourly');

  sendPaymentReminders.start();
  console.log('✅ Reminder service running every 6 hours\n');
};



/**
 * Stop cron jobs
 */
const stopCronJobs = () => {

  checkFirstBidWaitingPeriod.stop();
  checkPaymentDeadlines.stop();
  sendPaymentReminders.stop();

  console.log('🛑 Auction cron jobs stopped');
};


module.exports = {
  startCronJobs,
  stopCronJobs,
};

