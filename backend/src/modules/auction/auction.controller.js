const Auction = require('./auction.model');
const Bid = require('./bid.model');
const Website = require('../website/website.model');
const User = require('../user/user.model');
const emailService = require('../../services/email.service');
const { WEBSITE_STATUS } = require('../../shared/utils/constants');
const { getAuctionTimings } = require('../../shared/utils/envHelper');

/**
 * @route   POST /api/auction/:websiteId/start
 * @desc    Start auction for exclusive website (Admin only)
 * @access  Admin
 */
const startAuction = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { 
      startingPrice, 
      minimumBidIncrement = 100, 
      reservePrice = 0
    } = req.body;
    
    const { bidWaitHours: firstBidWaitingPeriodHours } = getAuctionTimings();

    // Find website
    const website = await Website.findById(websiteId);

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Check if exclusive
    if (website.category !== 'exclusive') {
      return res.status(400).json({
        success: false,
        message: 'Only exclusive websites can be auctioned',
      });
    }

    // Check if already in auction
    const existingAuction = await Auction.findOne({
      websiteId,
      status: { $in: ['active', 'first_bid_waiting', 'awaiting_payment'] },
    });

    if (existingAuction) {
      return res.status(400).json({
        success: false,
        message: 'Website is already in auction',
      });
    }

    // Create auction
    const auction = new Auction({
      websiteId,
      startTime: new Date(),
      startingPrice: startingPrice || website.price,
      minimumBidIncrement,
      reservePrice,
      firstBidWaitingPeriodHours,
      status: 'active',
    });

    await auction.save();

    // Update website status
    website.status = 'in_auction';
    website.auctionId = auction._id;
    await website.save();

    res.status(201).json({
      success: true,
      message: 'Auction started successfully',
      data: {
        auction,
        howItWorks: {
          step1: 'First person to bid gets the item',
          step2: `After first bid, ${firstBidWaitingPeriodHours} hours waiting period starts`,
          step3: 'If no one else bids in that time, first bidder wins',
          step4: 'If someone outbids, new waiting period starts',
          step5: 'Winner has limited time to pay after winning',
        },
      },
    });
  } catch (error) {
    console.error('Start auction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting auction',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/auction/:websiteId/bid
 * @desc    Place bid on exclusive website
 * @access  Private (Verified users)
 */
const placeBid = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { bidAmount } = req.body;
    const bidderId = req.userId;

    // Find auction
    const auction = await Auction.findOne({
      websiteId,
      status: { $in: ['active', 'first_bid_waiting'] },
    }).populate('websiteId');

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'No active auction found for this website',
      });
    }

    // Validate bid amount
    const minimumBid = auction.currentBidAmount > 0
      ? auction.currentBidAmount + auction.minimumBidIncrement
      : auction.startingPrice;

    if (bidAmount < minimumBid) {
      return res.status(400).json({
        success: false,
        message: `Minimum bid is ₹${minimumBid}`,
        minimumBid,
      });
    }

    // Check if bidder is the seller
    if (auction.websiteId.sellerId.toString() === bidderId) {
      return res.status(400).json({
        success: false,
        message: 'Sellers cannot bid on their own websites',
      });
    }

    // Check if bidder is already the current bidder
    if (auction.currentBidderId && auction.currentBidderId.toString() === bidderId) {
      return res.status(400).json({
        success: false,
        message: 'You are already the highest bidder',
      });
    }

    const previousBidderId = auction.currentBidderId;
    const isFirstBid = !auction.firstBidPlacedAt;

    // Mark previous bid as outbid (if exists)
    if (auction.currentBidId) {
      await Bid.updateOne(
        { _id: auction.currentBidId },
        { $set: { status: 'outbid' } }
      );
    }

    // Create new bid
    const bid = new Bid({
      websiteId,
      bidderId,
      bidAmount,
      status: 'winning',
      bidPlacedAt: new Date(),
    });

    await bid.save();

    // Update auction
    auction.currentBidAmount = bidAmount;
    auction.currentBidderId = bidderId;
    auction.currentBidId = bid._id;
    auction.lastBidPlacedAt = new Date();
    auction.totalBids += 1;

    // If this is the FIRST bid
    const { bidWaitHours: waitHours } = getAuctionTimings();
    if (isFirstBid) {
      auction.firstBidPlacedAt = new Date();
      auction.firstBidDeadline = new Date(
        Date.now() + waitHours * 60 * 60 * 1000
      );
      auction.status = 'first_bid_waiting';
      
      console.log(`🎯 FIRST BID placed by user ${bidderId}`);
      console.log(`⏰ If no one bids higher by ${auction.firstBidDeadline}, this bidder wins!`);
    } else {
      // New bid placed - reset timer
      auction.firstBidDeadline = new Date(
        Date.now() + waitHours * 60 * 60 * 1000
      );
      
      console.log(`🔥 New bid placed! Timer RESET`);
      console.log(`⏰ New deadline: ${auction.firstBidDeadline}`);
    }

    // Update unique bidders count
    const uniqueBidders = await Bid.distinct('bidderId', { websiteId });
    auction.uniqueBidders = uniqueBidders.length;

    // Check reserve price
    if (auction.reservePrice > 0 && bidAmount >= auction.reservePrice) {
      auction.reserveMet = true;
    }

    await auction.save();

    // Populate bidder info
    await bid.populate('bidderId', 'name email');

    // Send email to previous bidder (they've been outbid)
    if (previousBidderId) {
      try {
        const previousBidder = await User.findById(previousBidderId);
        if (previousBidder) {
          const websiteData = auction.websiteId; // already populated above
          console.log(`📧 Sending outbid notification to ${previousBidder.email}`);
          // Fire-and-forget: don't block bid response on email delivery
          emailService.sendOutbidNotification(previousBidder, websiteData, bidAmount)
            .catch(err => console.error('Failed to send outbid email:', err));
        }
      } catch (emailError) {
        console.error('Failed to send outbid email:', emailError);
      }
    }

    res.status(201).json({
      success: true,
      message: isFirstBid 
        ? `First bid placed! If no one bids higher in ${auction.firstBidWaitingPeriodHours} hours, you win!`
        : `Bid placed successfully! ${auction.firstBidWaitingPeriodHours}-hour timer reset.`,
      data: {
        bid,
        auction: {
          currentBidAmount: auction.currentBidAmount,
          totalBids: auction.totalBids,
          uniqueBidders: auction.uniqueBidders,
          status: auction.status,
          firstBidDeadline: auction.firstBidDeadline,
          hoursRemaining: Math.round(
            (auction.firstBidDeadline - new Date()) / (1000 * 60 * 60)
          ),
          minimumNextBid: auction.currentBidAmount + auction.minimumBidIncrement,
        },
      },
    });
  } catch (error) {
    console.error('Place bid error:', error);
    res.status(500).json({
      success: false,
      message: 'Error placing bid',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/auction/:websiteId
 * @desc    Get auction details and bids
 * @access  Public
 */
const getAuction = async (req, res) => {
  try {
    const { websiteId } = req.params;

    const auction = await Auction.findOne({ websiteId })
      .populate('websiteId', 'name description deployedUrl previewVideoUrl')
      .populate('currentBidderId', 'name');

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'No auction found for this website',
      });
    }

    // Dynamically recalculate deadlines from current .env settings (reads file fresh)
    const timings = getAuctionTimings();
    if (auction.status === 'first_bid_waiting') {
      const baseDate = auction.lastBidPlacedAt || auction.firstBidPlacedAt;
      if (baseDate) auction.firstBidDeadline = new Date(baseDate.getTime() + timings.bidWaitHours * 60 * 60 * 1000);
    } else if (auction.status === 'awaiting_payment') {
      // Ensure paymentDeadline is always set for awaiting_payment auctions.
      if (!auction.paymentDeadline) {
        if (auction.updatedAt) {
          auction.paymentDeadline = new Date(auction.updatedAt.getTime() + timings.paymentHours * 60 * 60 * 1000);
        } else {
          // Fallback: set from now
          auction.paymentDeadline = new Date(Date.now() + timings.paymentHours * 60 * 60 * 1000);
        }
      }
      // Auto-transition to awaiting_payment if deadline has passed
      if (auction.status === 'first_bid_waiting' && auction.hasFirstBidWaitingPassed && auction.hasFirstBidWaitingPassed()) {
        const paymentHours = timings.paymentHours;
        auction.status = 'awaiting_payment';
        auction.paymentDeadline = new Date(Date.now() + paymentHours * 60 * 60 * 1000);
        await auction.save();
      } else if (
        (auction.status === 'awaiting_payment' && auction.hasPaymentDeadlinePassed && auction.hasPaymentDeadlinePassed()) ||
        auction.status === 'payment_failed'
      ) {
        // Store previous attempt data
        auction.previousAttempts.push({
          bidderId: auction.currentBidderId,
          bidAmount: auction.currentBidAmount,
          failedAt: new Date(),
          failureReason: 'Payment not received within deadline',
        });
        // Reset auction
        auction.attemptNumber += 1;
        auction.startTime = new Date();
        auction.firstBidPlacedAt = null;
        auction.firstBidDeadline = null;
        auction.currentBidId = null;
        auction.currentBidderId = null;
        auction.currentBidAmount = 0;
        auction.lastBidPlacedAt = null;
        auction.totalBids = 0;
        auction.uniqueBidders = 0;
        auction.status = 'active';
        auction.paymentDeadline = null;
        auction.paymentReminderSent = false;
        await auction.save();
        // Mark all previous bids as expired
        await Bid.updateMany(
          { websiteId: auction.websiteId._id || auction.websiteId },
          { $set: { status: 'expired' } }
        );
      }
    }

    // Auto-transition to awaiting_payment if deadline has passed
    if (auction.status === 'first_bid_waiting' && auction.hasFirstBidWaitingPassed && auction.hasFirstBidWaitingPassed()) {
      const paymentHours = timings.paymentHours;
      auction.status = 'awaiting_payment';
      auction.paymentDeadline = new Date(Date.now() + paymentHours * 60 * 60 * 1000);
      await auction.save();
    } else if (
      (auction.status === 'awaiting_payment' && auction.hasPaymentDeadlinePassed && auction.hasPaymentDeadlinePassed()) ||
      auction.status === 'payment_failed'
    ) {
      // Store previous attempt data
      auction.previousAttempts.push({
        bidderId: auction.currentBidderId,
        bidAmount: auction.currentBidAmount,
        failedAt: new Date(),
        failureReason: 'Payment not received within deadline',
      });

      // Reset auction
      auction.attemptNumber += 1;
      auction.startTime = new Date();
      auction.firstBidPlacedAt = null;
      auction.firstBidDeadline = null;
      auction.currentBidId = null;
      auction.currentBidderId = null;
      auction.currentBidAmount = 0;
      auction.lastBidPlacedAt = null;
      auction.totalBids = 0;
      auction.uniqueBidders = 0;
      auction.status = 'active';
      auction.paymentDeadline = null;
      auction.paymentReminderSent = false;

      await auction.save();

      // Mark all previous bids as expired
      await Bid.updateMany(
        { websiteId: auction.websiteId._id || auction.websiteId },
        { $set: { status: 'expired' } }
      );
    }

    // Get bid history (without showing bidder names for privacy)
    const bids = await Bid.find({ websiteId, status: { $ne: 'expired' } })
      .sort({ bidAmount: -1, createdAt: -1 })
      .limit(20)
      .select('bidAmount bidPlacedAt status');

    // Calculate time remaining
    let timeInfo = {};
    if (auction.status === 'first_bid_waiting') {
      const hoursRemaining = Math.max(
        0,
        Math.round((auction.firstBidDeadline - new Date()) / (1000 * 60 * 60))
      );
      timeInfo = {
        hoursRemaining,
        deadline: auction.firstBidDeadline,
        message: hoursRemaining > 0 
          ? `${hoursRemaining} hours left for others to bid higher`
          : 'Waiting period expired, finalizing winner...',
      };
    } else if (auction.status === 'awaiting_payment') {
      const hoursRemaining = Math.max(
        0,
        Math.round((auction.paymentDeadline - new Date()) / (1000 * 60 * 60))
      );
      timeInfo = {
        hoursRemaining,
        deadline: auction.paymentDeadline,
        message: `Winner has ${hoursRemaining} hours to pay`,
      };
    }

    res.json({
      success: true,
      data: {
        auction: {
          ...auction.toObject(),
          timeInfo,
        },
        bids,
        minimumNextBid: auction.currentBidAmount > 0
          ? auction.currentBidAmount + auction.minimumBidIncrement
          : auction.startingPrice,
        howItWorks: {
          current: auction.totalBids === 0 
            ? 'Waiting for first bid'
            : auction.status === 'first_bid_waiting'
            ? `First bidder wins if no one outbids in ${Math.round((auction.firstBidDeadline - new Date()) / (1000 * 60 * 60))} hours`
            : auction.status === 'awaiting_payment'
            ? `Winner must pay within ${timings.paymentHours} hours`
            : auction.status,
        },
      },
    });
  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching auction',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/auction/my/bids
 * @desc    Get user's bid history
 * @access  Private
 */
const getMyBids = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const bids = await Bid.find({ bidderId: req.userId })
      .populate('websiteId', 'name deployedUrl previewVideoUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Bid.countDocuments({ bidderId: req.userId });

    // Get auction status for each bid
    const bidsWithStatus = await Promise.all(
      bids.map(async (bid) => {
        const auction = await Auction.findOne({ websiteId: bid.websiteId._id });
        return {
          ...bid.toObject(),
          auctionStatus: auction ? auction.status : 'unknown',
          isWinning: auction && auction.currentBidId 
            ? auction.currentBidId.toString() === bid._id.toString()
            : false,
        };
      })
    );

    res.json({
      success: true,
      data: bidsWithStatus,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get my bids error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bids',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/auction/:auctionId/reopen
 * @desc    Reopen auction if winner didn't pay (Admin only)
 * @access  Admin
 */
const reopenAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId).populate('websiteId');

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    if (auction.status !== 'payment_failed') {
      return res.status(400).json({
        success: false,
        message: 'Can only reopen auctions with failed payment',
      });
    }

    // Store previous attempt data
    auction.previousAttempts.push({
      bidderId: auction.currentBidderId,
      bidAmount: auction.currentBidAmount,
      failedAt: new Date(),
      failureReason: 'Payment not received within deadline',
    });

    // Reset auction
    auction.attemptNumber += 1;
    auction.startTime = new Date();
    auction.firstBidPlacedAt = null;
    auction.firstBidDeadline = null;
    auction.currentBidId = null;
    auction.currentBidderId = null;
    auction.currentBidAmount = 0;
    auction.lastBidPlacedAt = null;
    auction.totalBids = 0;
    auction.uniqueBidders = 0;
    auction.status = 'active';
    auction.paymentDeadline = null;
    auction.paymentReminderSent = false;

    await auction.save();

    // Update website status
    auction.websiteId.status = 'in_auction';
    auction.websiteId.auctionWinnerId = null;
    await auction.websiteId.save();

    // Mark all previous bids as expired
    await Bid.updateMany(
      { websiteId: auction.websiteId._id },
      { $set: { status: 'expired' } }
    );

    res.json({
      success: true,
      message: 'Auction reopened successfully',
      data: {
        auction,
        attemptNumber: auction.attemptNumber,
      },
    });
  } catch (error) {
    console.error('Reopen auction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error reopening auction',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/auction/active
 * @desc    Get all active auctions
 * @access  Public
 */
const getActiveAuctions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const auctions = await Auction.find({
      status: { $in: ['active', 'first_bid_waiting'] },
    })
      .populate('websiteId', 'name description deployedUrl previewVideoUrl technologies')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Auction.countDocuments({
      status: { $in: ['active', 'first_bid_waiting'] },
    });

    const auctionsWithInfo = auctions.map(auction => {
      let timeInfo = 'No bids yet';
      if (auction.status === 'first_bid_waiting') {
        const { bidWaitHours: waitHours } = getAuctionTimings();
        const baseDate = auction.lastBidPlacedAt || auction.firstBidPlacedAt;
        if (baseDate) auction.firstBidDeadline = new Date(baseDate.getTime() + waitHours * 60 * 60 * 1000);

        if (auction.firstBidDeadline) {
          const hoursRemaining = Math.max(
            0,
            Math.round((auction.firstBidDeadline - new Date()) / (1000 * 60 * 60))
          );
          timeInfo = `${hoursRemaining} hours left to outbid`;
        }
      }

      return {
        ...auction.toObject(),
        timeInfo,
      };
    });

    res.json({
      success: true,
      data: auctionsWithInfo,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get active auctions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active auctions',
      error: error.message,
    });
  }
};

const endAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({
        success:false,
        message:"Auction not found"
      });
    }

    if (auction.status !== "first_bid_waiting") {
      return res.status(400).json({
        success:false,
        message:"Auction is not ready to end"
      });
    }

    const { paymentHours } = getAuctionTimings();
    auction.status = "awaiting_payment";
    auction.paymentDeadline = new Date(
      Date.now() + paymentHours * 60 * 60 * 1000
    );

    await auction.save();

    res.json({
      success:true,
      message:"Winner declared. Awaiting payment.",
      winner: auction.currentBidderId,
      amount: auction.currentBidAmount
    });

  } catch(err){
    res.status(500).json({
      success:false,
      message:"Error ending auction"
    });
  }
};



module.exports = {
  startAuction,
  placeBid,
  getAuction,
  getMyBids,
  reopenAuction,
  getActiveAuctions,
  endAuction,
};