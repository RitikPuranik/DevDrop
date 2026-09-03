import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Upload,
  ShoppingBag,
  Rocket,
  Heart,
  Landmark,
  Package,
  ExternalLink,
  Trash2,
  Loader2,
  Plus,
  AlertCircle,
  ArrowLeft,
  Download,
  CheckCircle,
  Eye,
  ArrowUpRight,
  TrendingUp,
  Terminal,
  ChevronRight,
} from 'lucide-react';

import { userAPI } from '../../api/user';
import { sellerAPI } from '../../api/seller';
import { buyerAPI } from '../../api/buyer';
import { wishlistAPI } from '../../api/wishlist';
import { authAPI } from '../../api/auth';
import { deploymentAPI } from '../../api/deployment';

import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import ProviderConnectCard from '../../components/deployment/ProviderConnectCard';
import DeploymentCard from '../../components/deployment/DeploymentCard';
import WorkspaceShell, {
  WorkspaceLoading,
} from '../../components/account/WorkspaceShell';

import { useAccentTheme } from '../../hooks/useAccentTheme';

import {
  TECH_OPTIONS,
  LISTING_TYPES,
  getListingIssue,
  WishlistPreview,
  getListingPreviewFallback,
  StatusBadge,
  CardGridSkeleton,
  BankDetailsSkeleton,
  EmptyState,
  GuidancePanel,
} from '../../components/account/shared';


const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'listings', label: 'My Listings', icon: Upload },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  {
    id: 'deploy-own',
    label: 'Deploy Your Own',
    icon: Terminal,
    badge: 'NEW',
    external: '/deploy-own',
  },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'payouts', label: 'Payout Details', icon: Landmark },
];


const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.22 },
};


const cardClass =
  'bg-[#111214] border border-white/[0.075] rounded-2xl';


const inputClass =
  'w-full bg-[#0c0d0f] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20 transition-all';


export default function Workspace() {
  const navigate = useNavigate();
  const { cssVars } = useAccentTheme();

  const [activeSection, setActiveSection] = useState('overview');

  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  const [loading, setLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  // Deployments
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentProviders, setDeploymentProviders] = useState(null);
  const [deploymentFilter, setDeploymentFilter] = useState('all');

  // Payout
  const [bankDetails, setBankDetails] = useState({
    upiId: '',
    phoneNumber: '',
  });

  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [savingBankDetails, setSavingBankDetails] = useState(false);

  // Listing form
  const [isAddingListing, setIsAddingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [listingIssue, setListingIssue] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'free',
    price: 0,
    deployedUrl: '',
    githubUrl: '',
  });

  const [techStack, setTechStack] = useState({
    frontend: [],
    backend: [],
    database: [],
    devops: [],
  });


  // -------------------------------------------------------
  // AUTH
  // -------------------------------------------------------

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/');
      return;
    }

    fetchProfile();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // -------------------------------------------------------
  // SECTION DATA
  // -------------------------------------------------------

  useEffect(() => {
    if (activeSection === 'listings') {
      fetchListings();
    }

    if (activeSection === 'purchases') {
      fetchPurchases();
    }

    if (activeSection === 'deployments') {
      fetchDeployments();
    }

    if (activeSection === 'wishlist') {
      fetchWishlist();
    }

    if (activeSection === 'payouts') {
      fetchBankDetails();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);


  useEffect(() => {
    if (activeSection === 'deployments') {
      fetchDeployments();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentFilter]);


  // -------------------------------------------------------
  // API
  // -------------------------------------------------------

  const fetchProfile = async () => {
    try {
      setLoading(true);

      const [profileRes, dashRes] = await Promise.allSettled([
        userAPI.getProfile(),
        userAPI.getDashboard(),
      ]);

      if (profileRes.status === 'fulfilled') {
        const profileData = profileRes.value.data?.data;

        setProfile(
          profileData?.user
            ? {
                ...profileData.user,
                hasBankDetails: profileData.hasBankDetails,
              }
            : profileData
        );
      } else {
        const err = profileRes.reason;

        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');

          window.dispatchEvent(new Event('auth-changed'));

          toast.error(
            'Your session expired. Please login again.'
          );

          navigate('/', { replace: true });
          return;
        }

        toast.error(
          err.response?.data?.message ||
            'Failed to load profile'
        );
      }

      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data?.data);
      } else {
        setDashboard({
          uploadedWebsites: 0,
          purchases: 0,
          wishlistCount: 0,
          totalEarnings: 0,
          pendingPayouts: 0,
        });
      }
    } finally {
      setLoading(false);
    }
  };


  const fetchListings = async () => {
    try {
      setListingsLoading(true);

      const res = await sellerAPI.getMyWebsites();

      setListings(res.data?.data || []);
    } catch {
      setListings([]);
    } finally {
      setListingsLoading(false);
    }
  };


  const fetchPurchases = async () => {
    try {
      setPurchasesLoading(true);

      const res = await buyerAPI.getMyPurchases();

      setPurchases(res.data?.data || []);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  };


  const fetchDeployments = async () => {
    try {
      setDeploymentsLoading(true);

      const [deploymentsRes, providersRes] =
        await Promise.all([
          deploymentAPI.list({
            status:
              deploymentFilter === 'all'
                ? undefined
                : deploymentFilter,
            limit: 20,
          }),
          deploymentAPI.getProviders(),
        ]);

      setDeployments(
        deploymentsRes.data?.data || []
      );

      setDeploymentProviders(
        providersRes.data?.data || null
      );
    } catch {
      setDeployments([]);
    } finally {
      setDeploymentsLoading(false);
    }
  };


  const fetchWishlist = async () => {
    try {
      setWishlistLoading(true);

      const res = await wishlistAPI.getWishlist();

      setWishlist(res.data?.data || []);
    } catch {
      setWishlist([]);
    } finally {
      setWishlistLoading(false);
    }
  };


  const fetchBankDetails = async () => {
    try {
      setLoadingBankDetails(true);

      const res = await userAPI.getBankDetails();

      if (res.data?.data) {
        setBankDetails(res.data.data);
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error(
          'Failed to load bank details'
        );
      }
    } finally {
      setLoadingBankDetails(false);
    }
  };


  // -------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------

  const handleSaveBankDetails = async (e) => {
    e.preventDefault();

    try {
      setSavingBankDetails(true);

      await userAPI.saveBankDetails(bankDetails);

      toast.success(
        'Payout details saved successfully'
      );

      setProfile((prev) => ({
        ...prev,
        hasBankDetails: true,
      }));
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          'Failed to save bank details'
      );
    } finally {
      setSavingBankDetails(false);
    }
  };


  const handleAddListing = async (e) => {
    e.preventDefault();

    try {
      setListingIssue(null);
      setSubmitting(true);

      const normalizedPrice =
        form.category === 'free'
          ? 0
          : Number(form.price);

      await sellerAPI.submitWebsite({
        ...form,
        price: normalizedPrice,
        techStack,
      });

      toast.success(
        'Website submitted for review!'
      );

      setIsAddingListing(false);
      setListingIssue(null);

      setForm({
        name: '',
        description: '',
        category: 'free',
        price: 0,
        deployedUrl: '',
        githubUrl: '',
      });

      setTechStack({
        frontend: [],
        backend: [],
        database: [],
        devops: [],
      });

      fetchListings();
    } catch (err) {
      const issue = getListingIssue(err);

      setListingIssue(issue);

      toast.error(
        issue.messages[0] || issue.title
      );
    } finally {
      setSubmitting(false);
    }
  };


  const handleCategorySelect = (category) => {
    setListingIssue(null);

    setForm((prev) => ({
      ...prev,
      category,
      price:
        category === 'free'
          ? 0
          : prev.category === 'free' ||
            prev.price === 0
          ? ''
          : prev.price,
    }));
  };


  const handleSendVerification = async () => {
    try {
      setSendingVerification(true);

      await authAPI.sendVerification();

      const issue = {
        tone: 'warning',
        title: 'Verification email sent',
        messages: [
          'Check your inbox and spam folder for the verification email.',
          'After verifying your account, come back here and submit your project again.',
        ],
      };

      setListingIssue(issue);

      toast.success(
        'Verification email sent'
      );
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          'Failed to send verification email'
      );
    } finally {
      setSendingVerification(false);
    }
  };


  const handleDeleteListing = async (id) => {
    try {
      await sellerAPI.deleteWebsite(id);

      toast.success('Listing deleted');

      fetchListings();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          'Cannot delete this listing'
      );
    }
  };


  const handleRemoveWishlist = async (websiteId) => {
    try {
      await wishlistAPI.remove(websiteId);

      toast.success('Removed from wishlist');

      fetchWishlist();
    } catch {
      toast.error('Failed to remove');
    }
  };


  const handleLogout = () => {
    localStorage.removeItem('token');

    navigate('/');

    window.location.reload();
  };


  if (loading) {
    return (
      <div style={cssVars}>
        <WorkspaceLoading />
      </div>
    );
  }


  // -------------------------------------------------------
  // DATA
  // -------------------------------------------------------

  const stats = [
    {
      label: 'Approved',
      value: dashboard?.uploadedWebsites || 0,
      icon: Upload,
    },
    {
      label: 'Purchased',
      value: dashboard?.purchases || 0,
      icon: ShoppingBag,
    },
    {
      label: 'Wishlist',
      value: dashboard?.wishlistCount || 0,
      icon: Heart,
    },
    {
      label: 'Earnings',
      value: `₹${dashboard?.totalEarnings || 0}`,
      icon: TrendingUp,
    },
  ];


  const SECTION_META = {
    overview: {
      title: `Welcome back, ${
        profile?.name?.split(' ')[0] ||
        'there'
      }`,
      subtitle:
        "Here's what's happening across your workspace.",
    },

    listings: {
      title: isAddingListing
        ? 'Submit New Template'
        : 'My Listings',

      subtitle: isAddingListing
        ? 'Add your project details and submit it for review.'
        : 'Manage the projects you have listed for sale.',
    },

    purchases: {
      title: 'Purchases',
      subtitle:
        'Templates and projects you have bought.',
    },

    deployments: {
      title: 'Deployments',
      subtitle:
        'Connected providers and live deployments.',
    },

    wishlist: {
      title: 'Wishlist',
      subtitle:
        'Templates you have saved for later.',
    },

    payouts: {
      title: 'Payout Details',
      subtitle:
        'Manage the account we use to pay you.',
    },
  };


  const headerAction =
    activeSection === 'listings' &&
    !isAddingListing ? (
      <button
        onClick={() => {
          setIsAddingListing(true);
          setListingIssue(null);
        }}
        className="
          shrink-0
          inline-flex
          items-center
          gap-2
          px-4
          py-2.5
          rounded-xl
          bg-[var(--accent)]
          text-white
          text-[11px]
          font-bold
          hover:opacity-90
          active:scale-[0.98]
          transition-all
        "
      >
        <Plus size={15} />
        New listing
      </button>
    ) : null;


  return (
    <div
      style={cssVars}
      className="min-h-screen bg-[#090a0b] text-white"
    >
      <WorkspaceShell
        profile={profile}
        navItems={NAV_ITEMS}
        activeSection={activeSection}
        onSelectSection={(id) => {
          const item = NAV_ITEMS.find(
            (n) => n.id === id
          );

          if (item?.external) {
            navigate(item.external);
            return;
          }

          setActiveSection(id);
          setIsAddingListing(false);
          setListingIssue(null);
        }}
        onLogout={handleLogout}
        pageTitle={SECTION_META[activeSection]?.title}
        pageSubtitle={
          SECTION_META[activeSection]?.subtitle
        }
        headerAction={headerAction}
      >

        <AnimatePresence mode="wait">


          {/* =================================================
              OVERVIEW
          ================================================= */}

          {activeSection === 'overview' && (
            <motion.div
              key="overview"
              {...pageTransition}
            >

              {/* Stats */}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">

                {stats.map((stat, index) => {
                  const Icon = stat.icon;

                  return (
                    <motion.div
                      key={stat.label}
                      initial={{
                        opacity: 0,
                        y: 8,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: index * 0.04,
                      }}
                      className={`
                        ${cardClass}
                        relative
                        overflow-hidden
                        p-5
                        hover:border-white/[0.13]
                        transition-colors
                      `}
                    >

                      <div className="
                        flex
                        items-center
                        justify-between
                        mb-7
                      ">

                        <span className="
                          text-[12px]
                          font-medium
                          text-white/45
                        ">
                          {stat.label}
                        </span>

                        <div className="
                          w-8
                          h-8
                          rounded-lg
                          bg-white/[0.04]
                          border
                          border-white/[0.06]
                          flex
                          items-center
                          justify-center
                        ">
                          <Icon
                            size={15}
                            className="text-white/60"
                          />
                        </div>

                      </div>

                      <div className="
                        text-[25px]
                        font-semibold
                        tracking-tight
                        text-white
                      ">
                        {stat.value}
                      </div>

                      <div className="
                        absolute
                        bottom-0
                        left-0
                        right-0
                        h-px
                        bg-[var(--accent)]/50
                      " />

                    </motion.div>
                  );
                })}

              </div>


              {/* Quick actions */}

              <div className="mb-3 flex items-center justify-between">

                <div>
                  <h2 className="
                    text-[14px]
                    font-semibold
                    text-white
                  ">
                    Quick actions
                  </h2>

                  <p className="
                    text-[12px]
                    text-white/35
                    mt-1
                  ">
                    Jump into your most common tasks.
                  </p>
                </div>

              </div>


              <div className="
                grid
                sm:grid-cols-2
                xl:grid-cols-4
                gap-3
              ">

                <QuickAction
                  icon={Upload}
                  title="Manage listings"
                  description="Create and manage your marketplace projects."
                  onClick={() =>
                    setActiveSection('listings')
                  }
                />

                <QuickAction
                  icon={Rocket}
                  title="Deploy a purchase"
                  description="Connect a provider and publish your purchased project."
                  onClick={() =>
                    setActiveSection('deployments')
                  }
                />

                <QuickAction
                  icon={Terminal}
                  title="Deploy your own"
                  description="Deploy any GitHub repository without purchasing."
                  accent
                  onClick={() =>
                    navigate('/deploy-own')
                  }
                />

                <QuickAction
                  icon={Package}
                  title="Browse marketplace"
                  description="Discover templates and projects from other creators."
                  onClick={() =>
                    navigate('/template')
                  }
                />

              </div>


              {/* Activity section */}

              <div className="
                mt-8
                grid
                lg:grid-cols-[1.5fr_1fr]
                gap-3
              ">

                <div
                  className={`${cardClass} p-5`}
                >

                  <div className="
                    flex
                    items-center
                    justify-between
                    mb-5
                  ">
                    <div>
                      <h3 className="
                        text-[14px]
                        font-semibold
                      ">
                        Workspace activity
                      </h3>

                      <p className="
                        text-[11px]
                        text-white/35
                        mt-1
                      ">
                        Your marketplace overview
                      </p>
                    </div>

                    <TrendingUp
                      size={16}
                      className="text-white/30"
                    />
                  </div>


                  <div className="
                    h-36
                    rounded-xl
                    bg-white/[0.018]
                    border
                    border-white/[0.05]
                    flex
                    items-center
                    justify-center
                  ">
                    <div className="text-center">
                      <div className="
                        text-[12px]
                        text-white/40
                      ">
                        Keep building
                      </div>

                      <div className="
                        text-[11px]
                        text-white/25
                        mt-1
                      ">
                        Your activity will appear here.
                      </div>
                    </div>
                  </div>

                </div>


                <div
                  className={`${cardClass} p-5`}
                >

                  <h3 className="
                    text-[14px]
                    font-semibold
                    mb-5
                  ">
                    Account
                  </h3>

                  <div className="space-y-4">

                    <AccountRow
                      label="Email"
                      value={
                        profile?.email ||
                        'Not available'
                      }
                    />

                    <AccountRow
                      label="Verification"
                      value={
                        profile?.isVerified
                          ? 'Verified'
                          : 'Pending'
                      }
                      status={
                        profile?.isVerified
                          ? 'success'
                          : 'warning'
                      }
                    />

                    <AccountRow
                      label="Payout details"
                      value={
                        profile?.hasBankDetails
                          ? 'Configured'
                          : 'Not configured'
                      }
                      status={
                        profile?.hasBankDetails
                          ? 'success'
                          : 'warning'
                      }
                    />

                  </div>

                </div>

              </div>

            </motion.div>
          )}


          {/* =================================================
              LISTINGS
          ================================================= */}

          {activeSection === 'listings' && (
            <motion.div
              key="listings"
              {...pageTransition}
            >

              {isAddingListing ? (

                <div className="max-w-3xl">

                  <button
                    onClick={() => {
                      setIsAddingListing(false);
                      setListingIssue(null);
                    }}
                    className="
                      inline-flex
                      items-center
                      gap-2
                      text-[11px]
                      font-medium
                      text-white/40
                      hover:text-white
                      transition-colors
                      mb-5
                    "
                  >
                    <ArrowLeft size={13} />
                    Back to listings
                  </button>


                  <form
                    onSubmit={handleAddListing}
                    className="space-y-3 pb-10"
                  >

                    {!profile?.isVerified && (
                      <GuidancePanel
                        tone="warning"
                        title="Verify your email"
                        messages={[
                          'Seller submissions are blocked until your account email is verified.',
                          'Send a verification email and then return here.',
                        ]}
                        actionLabel={
                          sendingVerification
                            ? 'Sending...'
                            : 'Send verification email'
                        }
                        onAction={
                          handleSendVerification
                        }
                        actionDisabled={
                          sendingVerification
                        }
                      />
                    )}


                    {listingIssue &&
                      !(
                        listingIssue.title ===
                          'Verify your email before listing' &&
                        !profile?.isVerified
                      ) && (
                        <GuidancePanel
                          tone={listingIssue.tone}
                          title={listingIssue.title}
                          messages={
                            listingIssue.messages
                          }
                          actionLabel={
                            listingIssue.title ===
                            'Verify your email before listing'
                              ? sendingVerification
                                ? 'Sending...'
                                : 'Resend verification email'
                              : null
                          }
                          onAction={
                            listingIssue.title ===
                            'Verify your email before listing'
                              ? handleSendVerification
                              : null
                          }
                          actionDisabled={
                            sendingVerification
                          }
                        />
                      )}


                    {/* Project information */}

                    <FormSection
                      number="01"
                      title="Project information"
                      description="Give buyers a clear understanding of what you're selling."
                    >

                      <div className="space-y-4">

                        <Field
                          label="Project name"
                        >
                          <input
                            className={inputClass}
                            placeholder="e.g. Minimal SaaS Dashboard"
                            required
                            value={form.name}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                name: e.target.value,
                              })
                            }
                          />
                        </Field>


                        <Field
                          label="Description"
                        >
                          <textarea
                            className={`${inputClass} resize-none`}
                            rows={5}
                            placeholder="Describe the features, use case, design and included functionality..."
                            required
                            value={
                              form.description
                            }
                            onChange={(e) =>
                              setForm({
                                ...form,
                                description:
                                  e.target.value,
                              })
                            }
                          />
                        </Field>

                      </div>

                    </FormSection>


                    {/* Listing type */}

                    <FormSection
                      number="02"
                      title="Listing type"
                      description="Choose how buyers can access your project."
                    >

                      <div className="
                        grid
                        md:grid-cols-3
                        gap-2
                      ">

                        {LISTING_TYPES.map(
                          (type) => {

                            const active =
                              form.category ===
                              type.id;

                            return (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() =>
                                  handleCategorySelect(
                                    type.id
                                  )
                                }
                                className={`
                                  text-left
                                  p-4
                                  rounded-xl
                                  border
                                  transition-all
                                  ${
                                    active
                                      ? 'border-[var(--accent)]/70 bg-[var(--accent)]/[0.08]'
                                      : 'border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14]'
                                  }
                                `}
                              >

                                <div className="
                                  flex
                                  items-center
                                  justify-between
                                  mb-2
                                ">

                                  <span className="
                                    text-[11px]
                                    font-bold
                                    uppercase
                                    tracking-wider
                                  ">
                                    {type.label}
                                  </span>

                                  {active && (
                                    <CheckCircle
                                      size={15}
                                      className="text-[var(--accent)]"
                                    />
                                  )}

                                </div>

                                <p className="
                                  text-[11px]
                                  text-white/40
                                  leading-relaxed
                                ">
                                  {
                                    type.description
                                  }
                                </p>

                              </button>
                            );
                          }
                        )}

                      </div>

                    </FormSection>


                    {/* Pricing */}

                    <FormSection
                      number="03"
                      title="Pricing & links"
                      description="Set your price and provide access to the live project."
                    >

                      {form.category !==
                        'free' &&
                        !profile?.hasBankDetails && (
                          <div className="mb-4">
                            <GuidancePanel
                              tone="warning"
                              title="Payout details required"
                              messages={[
                                'Paid and exclusive listings require payout details before submission.',
                              ]}
                              actionLabel="Add payout details"
                              onAction={() =>
                                setActiveSection(
                                  'payouts'
                                )
                              }
                            />
                          </div>
                        )}


                      <div className="
                        grid
                        md:grid-cols-2
                        gap-4
                      ">

                        {form.category !==
                          'free' && (
                          <Field label="Price">

                            <div className="relative">

                              <span className="
                                absolute
                                left-4
                                top-1/2
                                -translate-y-1/2
                                text-white/30
                                text-sm
                              ">
                                ₹
                              </span>

                              <input
                                type="number"
                                min="1"
                                required
                                className={`${inputClass} pl-8`}
                                placeholder="2500"
                                value={
                                  form.price
                                }
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    price: e.target.value,
                                  })
                                }
                              />

                            </div>

                          </Field>
                        )}


                        <Field label="Live URL">

                          <input
                            className={inputClass}
                            type="url"
                            required
                            placeholder="https://your-project.com"
                            value={
                              form.deployedUrl
                            }
                            onChange={(e) =>
                              setForm({
                                ...form,
                                deployedUrl:
                                  e.target.value,
                              })
                            }
                          />

                        </Field>


                        <Field label="GitHub URL">

                          <input
                            className={inputClass}
                            type="url"
                            placeholder="https://github.com/username/project"
                            value={
                              form.githubUrl
                            }
                            onChange={(e) =>
                              setForm({
                                ...form,
                                githubUrl:
                                  e.target.value,
                              })
                            }
                          />

                        </Field>

                      </div>

                    </FormSection>


                    {/* Tech stack */}

                    <FormSection
                      number="04"
                      title="Technology stack"
                      description="Select the technologies used in your project."
                    >

                      <div className="space-y-5">

                        {Object.entries(
                          TECH_OPTIONS
                        ).map(
                          ([section, options]) => (

                            <div key={section}>

                              <div className="
                                text-[10px]
                                uppercase
                                tracking-widest
                                font-semibold
                                text-white/35
                                mb-2
                              ">
                                {section}
                              </div>


                              <div className="
                                flex
                                flex-wrap
                                gap-1.5
                              ">

                                {options.map(
                                  (tech) => {

                                    const selected =
                                      techStack[
                                        section
                                      ].includes(
                                        tech
                                      );

                                    return (
                                      <button
                                        key={tech}
                                        type="button"
                                        onClick={() => {

                                          const current =
                                            techStack[
                                              section
                                            ];

                                          const updated =
                                            selected
                                              ? current.filter(
                                                  (t) =>
                                                    t !==
                                                    tech
                                                )
                                              : [
                                                  ...current,
                                                  tech,
                                                ];

                                          setTechStack({
                                            ...techStack,
                                            [section]:
                                              updated,
                                          });
                                        }}
                                        className={`
                                          px-3
                                          py-1.5
                                          rounded-lg
                                          border
                                          text-[10px]
                                          font-medium
                                          transition-all
                                          ${
                                            selected
                                              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                              : 'bg-white/[0.025] text-white/50 border-white/[0.07] hover:text-white hover:border-white/[0.15]'
                                          }
                                        `}
                                      >
                                        {tech}
                                      </button>
                                    );
                                  }
                                )}

                              </div>

                            </div>

                          )
                        )}

                      </div>

                    </FormSection>


                    <button
                      type="submit"
                      disabled={submitting}
                      className="
                        w-full
                        py-3.5
                        rounded-xl
                        bg-[var(--accent)]
                        text-white
                        text-[11px]
                        font-bold
                        uppercase
                        tracking-wider
                        hover:opacity-90
                        active:scale-[0.995]
                        disabled:opacity-50
                        transition-all
                        flex
                        items-center
                        justify-center
                        gap-2
                      "
                    >

                      {submitting ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <Upload size={15} />
                      )}

                      {submitting
                        ? 'Submitting...'
                        : 'Submit project'}

                    </button>

                  </form>

                </div>

              ) : (

                <AnimatePresence mode="wait">

                  {listingsLoading ? (

                    <motion.div
                      key="loading"
                      {...pageTransition}
                    >
                      <CardGridSkeleton count={6} />
                    </motion.div>

                  ) : listings.length === 0 ? (

                    <motion.div
                      key="empty"
                      {...pageTransition}
                    >
                      <EmptyState
                        icon={Upload}
                        title="No listings yet"
                        description="Start selling your first project on the marketplace."
                        action="Create listing"
                        onAction={() =>
                          setIsAddingListing(
                            true
                          )
                        }
                      />
                    </motion.div>

                  ) : (

                    <motion.div
                      key="grid"
                      {...pageTransition}
                    >

                      <div className="
                        grid
                        grid-cols-1
                        md:grid-cols-2
                        xl:grid-cols-3
                        gap-4
                      ">

                        {listings.map(
                          (item) => (
                            <ListingCard
                              key={item._id}
                              item={item}
                              navigate={navigate}
                              onDelete={
                                handleDeleteListing
                              }
                            />
                          )
                        )}

                      </div>

                    </motion.div>

                  )}

                </AnimatePresence>

              )}

            </motion.div>
          )}


          {/* =================================================
              PURCHASES
          ================================================= */}

          {activeSection === 'purchases' && (
            <motion.div
              key="purchases"
              {...pageTransition}
            >

              <AnimatePresence mode="wait">

                {purchasesLoading ? (

                  <CardGridSkeleton count={6} />

                ) : purchases.length === 0 ? (

                  <EmptyState
                    icon={ShoppingBag}
                    title="No purchases yet"
                    description="Browse the marketplace and find your next project."
                    action="Browse marketplace"
                    onAction={() =>
                      navigate('/template')
                    }
                  />

                ) : (

                  <div className="
                    grid
                    grid-cols-1
                    md:grid-cols-2
                    xl:grid-cols-3
                    gap-4
                  ">

                    {purchases.map((p) => {

                      const web =
                        p.websiteId || {};

                      const cat =
                        web.category ||
                        'paid';

                      const previewVideo =
                        web.files
                          ?.previewVideo
                          ?.url || null;

                      return (
                        <motion.div
                          key={p._id}
                          {...pageTransition}
                          onClick={() =>
                            navigate(
                              `/purchases/${p._id}`
                            )
                          }
                          className={`
                            ${cardClass}
                            p-3
                            cursor-pointer
                            hover:border-white/[0.14]
                            transition-all
                          `}
                        >

                          <WishlistPreview
                            previewVideo={
                              previewVideo
                            }
                          />

                          <div className="p-2 pt-4">

                            <div className="
                              flex
                              justify-between
                              gap-3
                            ">

                              <div>
                                <h3 className="
                                  text-[15px]
                                  font-semibold
                                  text-white
                                ">
                                  {web.name ||
                                    'Template'}
                                </h3>

                                <p className="
                                  text-[10px]
                                  text-white/30
                                  mt-1
                                ">
                                  {p.createdAt
                                    ? new Date(
                                        p.createdAt
                                      ).toLocaleDateString(
                                        'en-IN',
                                        {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        }
                                      )
                                    : 'Recently'}
                                </p>
                              </div>

                              <span className="
                                h-fit
                                inline-flex
                                items-center
                                gap-1
                                px-2
                                py-1
                                rounded-md
                                bg-white/[0.04]
                                border
                                border-white/[0.06]
                                text-[9px]
                                uppercase
                                tracking-wider
                                text-white/45
                              ">
                                <CheckCircle
                                  size={9}
                                />
                                Owned
                              </span>

                            </div>


                            <div className="
                              flex
                              items-center
                              justify-between
                              mt-5
                            ">

                              <span className="
                                text-[13px]
                                font-semibold
                                text-[var(--accent)]
                              ">
                                {p.amount
                                  ? `₹${p.amount}`
                                  : cat === 'free'
                                  ? 'FREE'
                                  : `₹${
                                      web.price ||
                                      0
                                    }`}
                              </span>

                              <span className="
                                text-[9px]
                                uppercase
                                tracking-wider
                                text-white/35
                              ">
                                {cat}
                              </span>

                            </div>


                            <div className="
                              grid
                              grid-cols-2
                              gap-2
                              mt-4
                            ">

                              {web.deployedUrl && (
                                <a
                                  onClick={(e) =>
                                    e.stopPropagation()
                                  }
                                  href={
                                    web.deployedUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="
                                    flex
                                    items-center
                                    justify-center
                                    gap-1.5
                                    py-2.5
                                    rounded-lg
                                    bg-white/[0.035]
                                    border
                                    border-white/[0.07]
                                    text-[10px]
                                    font-medium
                                    text-white/55
                                    hover:text-white
                                    transition-all
                                  "
                                >
                                  <ExternalLink
                                    size={11}
                                  />
                                  Preview
                                </a>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();

                                  navigate(
                                    `/purchases/${p._id}`
                                  );
                                }}
                                className="
                                  flex
                                  items-center
                                  justify-center
                                  gap-1.5
                                  py-2.5
                                  rounded-lg
                                  bg-[var(--accent)]
                                  text-white
                                  text-[10px]
                                  font-semibold
                                  hover:opacity-90
                                  transition-all
                                "
                              >
                                <Download
                                  size={11}
                                />
                                Open access
                              </button>

                            </div>

                          </div>

                        </motion.div>
                      );
                    })}

                  </div>

                )}

              </AnimatePresence>

            </motion.div>
          )}


          {/* =================================================
              DEPLOYMENTS
          ================================================= */}

          {activeSection === 'deployments' && (
            <motion.div
              key="deployments"
              {...pageTransition}
            >

              <div className="
                grid
                lg:grid-cols-3
                gap-3
                mb-7
              ">

                <ProviderBox
                  name="GitHub"
                  connected={
                    deploymentProviders?.github
                      ?.connected
                  }
                  username={
                    deploymentProviders?.github
                      ?.username
                  }
                  onClick={() =>
                    navigate('/deployments')
                  }
                />

                <ProviderConnectCard
                  provider="vercel"
                  status={
                    deploymentProviders?.vercel
                  }
                  onChange={fetchDeployments}
                />

                <ProviderConnectCard
                  provider="render"
                  status={
                    deploymentProviders?.render
                  }
                  onChange={fetchDeployments}
                />

              </div>


              <div className="
                flex
                flex-col
                sm:flex-row
                sm:items-center
                justify-between
                gap-3
                mb-4
              ">

                <div>

                  <h2 className="
                    text-[14px]
                    font-semibold
                  ">
                    Deployments
                  </h2>

                  <p className="
                    text-[11px]
                    text-white/30
                    mt-1
                  ">
                    {deployments.length} total deployment
                    {deployments.length === 1
                      ? ''
                      : 's'}
                  </p>

                </div>


                <div className="
                  flex
                  gap-1
                  p-1
                  rounded-lg
                  bg-white/[0.025]
                  border
                  border-white/[0.06]
                ">

                  {[
                    'all',
                    'successful',
                    'failed',
                    'deploying',
                  ].map((filter) => (

                    <button
                      key={filter}
                      onClick={() =>
                        setDeploymentFilter(
                          filter
                        )
                      }
                      className={`
                        px-3
                        py-1.5
                        rounded-md
                        text-[10px]
                        font-medium
                        capitalize
                        transition-all
                        ${
                          deploymentFilter ===
                          filter
                            ? 'bg-white text-black'
                            : 'text-white/40 hover:text-white'
                        }
                      `}
                    >
                      {filter}
                    </button>

                  ))}

                </div>

              </div>


              {deploymentsLoading ? (

                <div className="
                  flex
                  justify-center
                  py-20
                ">
                  <Loader2
                    size={20}
                    className="animate-spin text-white/30"
                  />
                </div>

              ) : deployments.length === 0 ? (

                <div className="
                  border
                  border-dashed
                  border-white/[0.08]
                  rounded-2xl
                  py-20
                  text-center
                ">

                  <Rocket
                    size={24}
                    className="
                      mx-auto
                      mb-4
                      text-white/20
                    "
                  />

                  <p className="
                    text-[13px]
                    text-white/55
                  ">
                    No deployments yet
                  </p>

                  <p className="
                    text-[11px]
                    text-white/25
                    mt-1
                  ">
                    Deploy a purchased project to
                    get started.
                  </p>

                </div>

              ) : (

                <div className="
                  grid
                  sm:grid-cols-2
                  gap-3
                ">

                  {deployments.map((deployment) => (
                    <DeploymentCard
                      key={deployment.id}
                      deployment={deployment}
                    />
                  ))}

                </div>

              )}

            </motion.div>
          )}


          {/* =================================================
              WISHLIST
          ================================================= */}

          {activeSection === 'wishlist' && (
            <motion.div
              key="wishlist"
              {...pageTransition}
            >

              {wishlistLoading ? (

                <CardGridSkeleton count={6} />

              ) : wishlist.length === 0 ? (

                <EmptyState
                  icon={Heart}
                  title="Your wishlist is empty"
                  description="Save projects you like and come back to them later."
                  action="Browse marketplace"
                  onAction={() =>
                    navigate('/template')
                  }
                />

              ) : (

                <div className="
                  grid
                  grid-cols-1
                  md:grid-cols-2
                  xl:grid-cols-3
                  gap-4
                ">

                  {wishlist.map((w) => {

                    const web =
                      w.websiteId || {};

                    const cat =
                      web.category || 'free';

                    const previewVideo =
                      web.files?.previewVideo
                        ?.url || null;

                    return (
                      <motion.div
                        key={w._id}
                        {...pageTransition}
                        onClick={() =>
                          navigate(
                            `/website/${web._id}`
                          )
                        }
                        className={`
                          ${cardClass}
                          p-3
                          cursor-pointer
                          hover:border-white/[0.14]
                          transition-all
                        `}
                      >

                        <WishlistPreview
                          previewVideo={
                            previewVideo
                          }
                        />

                        <div className="p-2 pt-4">

                          <div className="
                            flex
                            items-center
                            justify-between
                            gap-3
                          ">

                            <h3 className="
                              text-[15px]
                              font-semibold
                              truncate
                            ">
                              {web.name ||
                                'Template'}
                            </h3>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();

                                handleRemoveWishlist(
                                  web._id
                                );
                              }}
                              className="
                                shrink-0
                                w-8
                                h-8
                                rounded-lg
                                flex
                                items-center
                                justify-center
                                text-red-400/70
                                hover:text-red-400
                                hover:bg-red-400/[0.07]
                                transition-all
                              "
                            >
                              <Heart
                                size={14}
                                className="fill-current"
                              />
                            </button>

                          </div>


                          <div className="
                            flex
                            items-center
                            justify-between
                            mt-5
                          ">

                            <span className="
                              text-[13px]
                              font-semibold
                              text-[var(--accent)]
                            ">
                              {cat === 'free'
                                ? 'FREE'
                                : `₹${
                                    web.price ||
                                    0
                                  }`}
                            </span>

                            <span className="
                              text-[9px]
                              uppercase
                              tracking-wider
                              text-white/30
                            ">
                              {cat}
                            </span>

                          </div>

                        </div>

                      </motion.div>
                    );
                  })}

                </div>

              )}

            </motion.div>
          )}


          {/* =================================================
              PAYOUTS
          ================================================= */}

          {activeSection === 'payouts' && (
            <motion.div
              key="payouts"
              {...pageTransition}
            >

              <div className="max-w-2xl">

                {loadingBankDetails ? (

                  <BankDetailsSkeleton />

                ) : (

                  <form
                    onSubmit={
                      handleSaveBankDetails
                    }
                    className="space-y-3"
                  >

                    <div
                      className={`${cardClass} p-6`}
                    >

                      <div className="mb-6">

                        <div className="
                          flex
                          items-center
                          gap-3
                        ">

                          <div className="
                            w-9
                            h-9
                            rounded-lg
                            bg-white/[0.04]
                            border
                            border-white/[0.06]
                            flex
                            items-center
                            justify-center
                          ">
                            <Landmark
                              size={16}
                              className="text-white/55"
                            />
                          </div>

                          <div>

                            <h3 className="
                              text-[14px]
                              font-semibold
                            ">
                              Payment information
                            </h3>

                            <p className="
                              text-[11px]
                              text-white/30
                              mt-1
                            ">
                              Used when marketplace
                              earnings are paid out.
                            </p>

                          </div>

                        </div>

                      </div>


                      <div className="
                        grid
                        md:grid-cols-2
                        gap-4
                      ">

                        <Field label="UPI ID">

                          <input
                            required
                            className={
                              inputClass
                            }
                            placeholder="username@upi"
                            value={
                              bankDetails.upiId ||
                              ''
                            }
                            onChange={(e) =>
                              setBankDetails({
                                ...bankDetails,
                                upiId:
                                  e.target
                                    .value,
                              })
                            }
                          />

                        </Field>


                        <Field label="Phone number">

                          <input
                            required
                            type="tel"
                            className={
                              inputClass
                            }
                            placeholder="+91 9876543210"
                            value={
                              bankDetails.phoneNumber ||
                              ''
                            }
                            onChange={(e) =>
                              setBankDetails({
                                ...bankDetails,
                                phoneNumber:
                                  e.target
                                    .value,
                              })
                            }
                          />

                        </Field>

                      </div>

                    </div>


                    <button
                      type="submit"
                      disabled={
                        savingBankDetails
                      }
                      className="
                        w-full
                        py-3.5
                        rounded-xl
                        bg-[var(--accent)]
                        text-white
                        text-[11px]
                        font-bold
                        uppercase
                        tracking-wider
                        flex
                        items-center
                        justify-center
                        gap-2
                        hover:opacity-90
                        disabled:opacity-50
                        transition-all
                      "
                    >

                      {savingBankDetails ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <CheckCircle
                          size={15}
                        />
                      )}

                      {savingBankDetails
                        ? 'Saving...'
                        : 'Save payout details'}

                    </button>

                  </form>

                )}

              </div>

            </motion.div>
          )}

        </AnimatePresence>

      </WorkspaceShell>
    </div>
  );
}


/* ============================================================
   COMPONENTS
============================================================ */


function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
  accent = false,
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group
        text-left
        ${cardClass}
        p-5
        hover:border-white/[0.14]
        transition-all
        ${
          accent
            ? 'border-[var(--accent)]/20'
            : ''
        }
      `}
    >

      <div className="
        flex
        items-center
        justify-between
        mb-8
      ">

        <div className={`
          w-8
          h-8
          rounded-lg
          flex
          items-center
          justify-center
          border
          ${
            accent
              ? 'bg-[var(--accent)]/[0.08] border-[var(--accent)]/20'
              : 'bg-white/[0.035] border-white/[0.06]'
          }
        `}>

          <Icon
            size={15}
            className={
              accent
                ? 'text-[var(--accent)]'
                : 'text-white/55'
            }
          />

        </div>

        <ArrowUpRight
          size={14}
          className="
            text-white/20
            group-hover:text-white/50
            transition-colors
          "
        />

      </div>


      <h3 className="
        text-[13px]
        font-semibold
        text-white
      ">
        {title}
      </h3>

      <p className="
        text-[11px]
        text-white/35
        leading-relaxed
        mt-1.5
      ">
        {description}
      </p>

    </button>
  );
}


function AccountRow({
  label,
  value,
  status,
}) {
  return (
    <div className="
      flex
      items-center
      justify-between
      gap-4
    ">

      <span className="
        text-[11px]
        text-white/35
      ">
        {label}
      </span>

      <span className={`
        text-[11px]
        ${
          status === 'success'
            ? 'text-emerald-400/70'
            : status === 'warning'
            ? 'text-amber-400/70'
            : 'text-white/55'
        }
      `}>
        {value}
      </span>

    </div>
  );
}


function FormSection({
  number,
  title,
  description,
  children,
}) {
  return (
    <section
      className={`${cardClass} p-5 md:p-6`}
    >

      <div className="
        flex
        gap-4
        mb-6
      ">

        <span className="
          shrink-0
          text-[10px]
          font-mono
          text-white/20
          pt-0.5
        ">
          {number}
        </span>

        <div>

          <h2 className="
            text-[14px]
            font-semibold
          ">
            {title}
          </h2>

          <p className="
            text-[11px]
            text-white/30
            mt-1
          ">
            {description}
          </p>

        </div>

      </div>

      {children}

    </section>
  );
}


function Field({
  label,
  children,
}) {
  return (
    <div className="space-y-2">

      <label className="
        block
        text-[10px]
        uppercase
        tracking-wider
        font-semibold
        text-white/35
      ">
        {label}
      </label>

      {children}

    </div>
  );
}


function ProviderBox({
  name,
  connected,
  username,
  onClick,
}) {
  return (
    <div
      className={`
        ${cardClass}
        p-4
        flex
        items-center
        justify-between
        gap-4
      `}
    >

      <div>

        <div className="
          text-[13px]
          font-semibold
        ">
          {name}
        </div>

        <div className="
          flex
          items-center
          gap-1.5
          mt-1
          text-[10px]
        ">

          <span
            className={`
              w-1.5
              h-1.5
              rounded-full
              ${
                connected
                  ? 'bg-emerald-400'
                  : 'bg-white/20'
              }
            `}
          />

          <span className="
            text-white/35
          ">
            {connected
              ? `@${username}`
              : 'Not connected'}
          </span>

        </div>

      </div>


      <button
        onClick={onClick}
        className="
          px-3
          py-2
          rounded-lg
          bg-white/[0.04]
          border
          border-white/[0.07]
          text-[10px]
          font-medium
          text-white/55
          hover:text-white
          hover:bg-white/[0.07]
          transition-all
        "
      >
        {connected
          ? 'Reconnect'
          : 'Connect'}
      </button>

    </div>
  );
}


function ListingCard({
  item,
  navigate,
  onDelete,
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 8,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className={`
        ${cardClass}
        p-3
        flex
        flex-col
        overflow-hidden
        hover:border-white/[0.14]
        transition-all
      `}
    >

      <div className="relative">

        <WishlistPreview
          previewVideo={
            item.files?.previewVideo?.url ||
            null
          }
          fallback={getListingPreviewFallback(
            item.status
          )}
        />

        <div className="
          absolute
          top-3
          left-3
        ">

          <span className="
            px-2
            py-1
            rounded-md
            bg-black/65
            backdrop-blur-sm
            border
            border-white/10
            text-[8px]
            font-bold
            uppercase
            tracking-wider
            text-white/70
          ">
            {item.category}
          </span>

        </div>

        <div className="
          absolute
          top-3
          right-3
        ">
          <StatusBadge
            status={item.status}
          />
        </div>

      </div>


      <div className="
        px-1
        pt-4
      ">

        <h3 className="
          text-[15px]
          font-semibold
          truncate
        ">
          {item.name}
        </h3>

        <p className="
          text-[11px]
          text-white/35
          mt-1.5
          leading-relaxed
          line-clamp-2
          min-h-[32px]
        ">
          {item.description}
        </p>

      </div>


      {item.adminComment && (
        <div className="
          mt-3
          p-3
          rounded-lg
          bg-white/[0.025]
          border
          border-white/[0.06]
        ">

          <div className="
            flex
            items-center
            gap-1.5
            text-[9px]
            uppercase
            tracking-wider
            font-semibold
            text-white/35
            mb-1
          ">
            <AlertCircle size={10} />
            Admin note
          </div>

          <p className="
            text-[10px]
            text-white/45
            leading-relaxed
          ">
            {item.adminComment}
          </p>

        </div>
      )}


      <div className="
        mt-5
        pt-3
        border-t
        border-white/[0.06]
      ">

        <div className="
          flex
          items-center
          justify-between
        ">

          <div className="
            flex
            items-center
            gap-3
            text-[9px]
            text-white/30
          ">

            <span className="
              flex
              items-center
              gap-1
            ">
              <Eye size={10} />
              {item.viewCount || 0}
            </span>

            <span className="
              flex
              items-center
              gap-1
            ">
              <Heart size={10} />
              {item.wishlistCount || 0}
            </span>

            <span className="
              flex
              items-center
              gap-1
            ">
              <TrendingUp size={10} />
              {item.salesCount || 0}
            </span>

          </div>


          <span className="
            text-[12px]
            font-semibold
            text-[var(--accent)]
          ">
            {item.price === 0
              ? 'FREE'
              : `₹${item.price}`}
          </span>

        </div>


        <div className="
          flex
          gap-1.5
          mt-3
        ">

          {item.status === 'approved' && (
            <button
              onClick={() =>
                navigate(
                  `/website/${item._id}`
                )
              }
              className="
                w-9
                h-9
                rounded-lg
                bg-white/[0.035]
                border
                border-white/[0.07]
                flex
                items-center
                justify-center
                text-white/40
                hover:text-white
                hover:bg-white/[0.07]
                transition-all
              "
            >
              <ArrowUpRight
                size={13}
              />
            </button>
          )}


          {item.deployedUrl && (
            <a
              href={item.deployedUrl}
              target="_blank"
              rel="noreferrer"
              className="
                w-9
                h-9
                rounded-lg
                bg-white/[0.035]
                border
                border-white/[0.07]
                flex
                items-center
                justify-center
                text-white/40
                hover:text-white
                hover:bg-white/[0.07]
                transition-all
              "
            >
              <ExternalLink
                size={13}
              />
            </a>
          )}


          <button
            onClick={() =>
              onDelete(item._id)
            }
            className="
              ml-auto
              w-9
              h-9
              rounded-lg
              bg-white/[0.035]
              border
              border-white/[0.07]
              flex
              items-center
              justify-center
              text-white/25
              hover:text-red-400
              hover:bg-red-400/[0.06]
              transition-all
            "
          >
            <Trash2 size={13} />
          </button>

        </div>

      </div>

    </motion.div>
  );
}