const Auction = require('../modules/auction/auction.model');
const Bid     = require('../modules/auction/bid.model');
const emailService = require('./email.service');

const processEndedAuctions = async () => {
  try {
    const now = new Date();
    const endedAuctions = await Auction.find({ status: 'active', endTime: { $lte: now } }).populate('websiteId').populate('sellerId');

    for (const auction of endedAuctions) {
      const highestBid = await Bid.findOne({ auctionId: auction._id }).sort({ amount: -1 }).populate('bidderId');

      if (highestBid) {
        auction.status = 'ended';
        auction.winnerId = highestBid.bidderId._id;
        auction.finalPrice = highestBid.amount;
        await auction.save();
        console.log(`✅ Auction ended: ${auction._id}, winner: ${highestBid.bidderId.email}`);
      } else {
        auction.status = 'ended';
        await auction.save();
        console.log(`ℹ️  Auction ended with no bids: ${auction._id}`);
      }
    }
  } catch (error) {
    console.error('Process ended auctions error:', error);
  }
};

const startAuctionCron = () => {
  // Check every minute
  setInterval(processEndedAuctions, 60 * 1000);
  console.log('✅ Auction cron started');
};

module.exports = { startAuctionCron, processEndedAuctions };
