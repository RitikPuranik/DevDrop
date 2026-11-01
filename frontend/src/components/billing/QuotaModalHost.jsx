import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuotaModal from './QuotaModal';
import { pricingPath } from './billingUtils';

export const QUOTA_EVENT = 'devdrop:quota-modal';

/** Mounted once (App.jsx). Any surface that gets a billing error from a generation call fires QUOTA_EVENT. */
export default function QuotaModalHost() {
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);

  useEffect(() => {
    const onEvent = (e) => setModal(e.detail || null);
    window.addEventListener(QUOTA_EVENT, onEvent);
    return () => window.removeEventListener(QUOTA_EVENT, onEvent);
  }, []);

  const close = () => setModal(null);
  const go = (planId) => { setModal(null); navigate(pricingPath(planId)); };
  return (
    <QuotaModal
      open={!!modal}
      variant={modal?.variant}
      data={modal?.data}
      onClose={close}
      onUpgrade={(planId) => go(planId)}
      onViewPricing={() => go()}
      onExplore={() => go()}
    />
  );
}
